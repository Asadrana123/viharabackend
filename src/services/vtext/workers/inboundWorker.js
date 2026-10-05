// services/vtext/workers/inboundWorker.js
//
// Processes the vtext-inbound queue (sendify-infra.md §6.2). Each job
// points at a persisted vtextWebhookEvent; this re-parses it through the
// line's channel adapter and handles every NormalizedEvent it yields.
const mongoose = require("mongoose");
const { Worker } = require("bullmq");
const { normalizeInternationalPhone } = require("../../../utils/internationalPhone");
const { timezoneForPhone } = require("../../../utils/areaCodeTimezone");
const VtextWebhookEvent = require("../../../model/vtext/vtextWebhookEventModel");
const VtextLine = require("../../../model/vtext/vtextLineModel");
const VtextContact = require("../../../model/vtext/vtextContactModel");
const VtextConversation = require("../../../model/vtext/vtextConversationModel");
const VtextMessage = require("../../../model/vtext/vtextMessageModel");
const { getAdapter } = require("../channels/registry");
const { bullmqConnection } = require("../queue/connection");
const { QUEUE_NAMES, QUEUE_PREFIX, getRouteQueue } = require("../queue/queues");
const capacity = require("../vtextCapacityService");
const { detectKeyword } = require("../vtextComplianceService");
const { publishEvent } = require("../vtextEventsBus");
const { findLeadRefs } = require("../vtextLeadLookupService");
const { endFollowUp } = require("../vtextFollowUpService");
const { notifyVtextAlert } = require("../../shared/slackService");

const HELP_TEXT = process.env.VTEXT_HELP_TEXT || "This is Vihara. Reply STOP to opt out, or visit vihara.ai for more info.";
const STOP_CONFIRM_TEXT = process.env.VTEXT_STOP_CONFIRM_TEXT || "You're unsubscribed and won't receive more messages from Vihara. Reply START to resubscribe.";
const AUTO_REPLY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // one HELP / one stop-confirm per contact per 24h

function normalizeInboundAddress(raw) {
  if (typeof raw !== "string") return null;
  if (raw.includes("@")) return raw.trim().toLowerCase();
  return normalizeInternationalPhone(raw);
}

/** Sends one system-origin message, routed back through the same channel the inbound message arrived on (not a channelPolicy-default "any" — see channelPolicy below for why that matters) and bypassing the normal compliance gate via vtextComplianceService's SYSTEM_BYPASS_TEMPLATES (currently stop-confirm and help). */
async function sendSystemReply(contact, line, body, templateKey) {
  const conversation = await VtextConversation.findOne({ contactId: contact._id, lineId: line._id });
  const message = await VtextMessage.create({
    direction: "out",
    contactId: contact._id,
    lineId: line._id,
    conversationId: conversation?._id,
    channelType: line.channelType,
    body,
    status: "queued",
    origin: { kind: "system", templateKey },
    // Without this, channelPolicy defaults to {mode:"any", channels:[]} and
    // vtextRouter's default candidate list excludes "mock" (never a silent
    // default for a real send) — found this stranding every system reply as
    // permanently "waiting-capacity" on a mock-channel test line, since
    // selectLine was only ever looking for imessage-bluebubbles lines. The
    // real-world version of this bug: without pinning the channel, a reply
    // could get routed to a DIFFERENT channel than the one STOP/HELP arrived
    // on, which is wrong regardless of mock vs. real — a reply belongs on
    // the same channel the inbound message came in on.
    channelPolicy: { mode: "only", channels: [line.channelType] },
    isReplyToInbound: true,
  });
  await getRouteQueue().add("route", { messageId: String(message._id) }, { jobId: `route-${message._id}-1` });
  return message;
}

async function lastAutoReplyAt(contactId, templateKey) {
  const last = await VtextMessage.findOne({ contactId, "origin.kind": "system", "origin.templateKey": templateKey })
    .sort({ createdAt: -1 })
    .select("createdAt");
  return last?.createdAt || null;
}

async function cancelPendingOutbound(contactId, { onlyFollowUps = false } = {}) {
  const pending = await VtextMessage.find({
    contactId,
    direction: "out",
    status: { $in: ["queued", "waiting-window", "waiting-capacity", "assigned", "pending-approval"] },
    ...(onlyFollowUps ? { "origin.templateKey": /^followup-/ } : {}),
  });

  for (const message of pending) {
    // A pending AI draft never reached the route queue, so there's no line
    // job or capacity reservation to undo for it — just reject it below.
    if (message.status === "pending-approval") {
      message.status = "cancelled";
      if (message.aiDraft) message.aiDraft.approvalStatus = "rejected";
      await message.save();
      continue;
    }

    // Best-effort job removal — the message's own status flip is what
    // actually stops it from sending even if a stale job slips through
    // (routeWorker/lineSendWorker both check status before doing anything).
    try {
      if (message.lineId) {
        const { getLineQueue } = require("../queue/queues");
        const job = await getLineQueue(message.lineId).getJob(`send-${message._id}`);
        if (job) await job.remove();
      }
    } catch (err) {
      console.warn(`[vtext inbound] couldn't remove line-queue job for message ${message._id}:`, err.message);
    }

    if (message.status === "assigned" && message.lineId) {
      const line = await VtextLine.findById(message.lineId);
      if (line) await capacity.release(line, capacity.dayKey(message.updatedAt), { wasReply: message.isReplyToInbound });
    }

    message.status = "cancelled";
    await message.save();
  }

  return pending.length;
}

async function handleMessageReceived(event, line) {
  const from = normalizeInboundAddress(event.from);

  // Dedup against the per-event provider id, not just the webhookEvent record
  // (a retried webhook delivery is a different webhookEvent but the same
  // underlying message).
  if (event.providerMessageId) {
    const existing = await VtextMessage.findOne({ channelType: line.channelType, "provider.messageId": event.providerMessageId });
    if (existing) return;
  }

  const phoneStatus = from ? "valid" : "invalid";
  const contactKey = from || event.from; // store something even for an unparseable sender, so the event isn't silently dropped

  let contact = await VtextContact.findOne({ phoneE164: contactKey });
  if (!contact) {
    const leadRefs = from ? await findLeadRefs(from) : [];
    const consentLead = leadRefs.find((r) => r.lead.smsConsent === true);

    contact = await VtextContact.create({
      phoneE164: contactKey,
      // Any lead match's name, not just the consent-granting one — a lead
      // record existing at all is a stronger name signal than guessing, even
      // when it's not the one that happens to carry SMS consent.
      name: leadRefs[0]?.name || undefined,
      phoneStatus,
      timezone: from ? timezoneForPhone(from) : undefined,
      source: "inbound-unknown",
      leadRefs: leadRefs.map((r) => ({ leadType: r.leadType, leadId: r.leadId })),
      consent: consentLead
        ? {
            status: "opted-in",
            source: "lead-form",
            capturedAt: consentLead.lead.smsConsentAt || new Date(),
            consentText: consentLead.lead.smsConsentText,
            evidence: { leadType: consentLead.leadType, leadId: consentLead.leadId },
          }
        : { status: "unknown" },
    });
  }

  let conversation = await VtextConversation.findOne({ contactId: contact._id, lineId: line._id });
  const isFirstInbound = !conversation?.firstInboundAt;
  conversation = await VtextConversation.findOneAndUpdate(
    { contactId: contact._id, lineId: line._id },
    {
      $setOnInsert: { channelType: line.channelType, contactPhone: contact.phoneE164, lineAddress: line.address },
      $set: {
        lastMessageAt: event.receivedAt || new Date(),
        lastMessagePreview: String(event.body || "").slice(0, 120),
        lastDirection: "in",
        status: "needs-reply",
        ...(isFirstInbound ? { firstInboundAt: event.receivedAt || new Date() } : {}),
      },
      $inc: { unreadCount: 1, "counts.inbound": 1 },
    },
    { upsert: true, new: true }
  );

  contact.stickyLines.set(line.channelType, line._id);
  contact.lastInboundAt = event.receivedAt || new Date();
  await contact.save();

  const keyword = detectKeyword(event.body);

  // Any reply ends the follow-up sequence. A STOP also cancels everything
  // pending below, so only a plain reply needs the follow-up-only cancel here.
  try {
    const ended = await endFollowUp(
      contact._id,
      keyword.type === "stop" ? "opted-out" : "replied",
      keyword.type === "stop" ? "contact opted out" : "contact replied"
    );
    if (ended && keyword.type !== "stop") await cancelPendingOutbound(contact._id, { onlyFollowUps: true });
  } catch (err) {
    console.error(`[vtext inbound] couldn't end follow-up sequence for contact ${contact._id}:`, err.message);
  }

  const message = await VtextMessage.create({
    direction: "in",
    contactId: contact._id,
    conversationId: conversation._id,
    lineId: line._id,
    channelType: line.channelType,
    body: event.body || "",
    status: "received",
    receivedAt: event.receivedAt || new Date(),
    provider: { messageId: event.providerMessageId },
    keyword: keyword.type ? keyword : undefined,
  });

  await capacity.recordInbound(line);

  if (keyword.type === "stop") {
    // detectKeyword's `method` ("exact"/"phrase") describes HOW the text was
    // matched; vtextContactModel's optOut.method enum describes the
    // opt-out's CAUSE category ("keyword"/"phrase"/"admin"/"import") — these
    // overlap on "phrase" but an exact match maps to "keyword", not "exact".
    // Found this the hard way: passing keyword.method straight through threw
    // a Mongoose enum-validation error on every exact-match STOP, which
    // (because the message itself was already created and saved before this
    // block, so the per-provider-id dedup check at the top of this function
    // short-circuits any retry) made every retry silently no-op instead of
    // retrying the actual cascade — the job eventually "succeeded" having
    // done nothing. Worth remembering: a dedup-by-side-effect check ahead of
    // a multi-step operation can hide a real failure inside that operation
    // behind what looks like a clean, silent retry.
    const optOutMethod = keyword.method === "exact" ? "keyword" : keyword.method;
    contact.optOut = {
      isOptedOut: true,
      at: new Date(),
      keyword: keyword.matched,
      method: optOutMethod,
      viaLineId: line._id,
      viaMessageId: message._id,
    };
    contact.consent.status = "opted-out";
    contact.consentEvents.push({ type: "opt-out", at: new Date(), method: optOutMethod, keyword: keyword.matched, messageId: message._id, lineId: line._id });
    await contact.save();

    const cancelledCount = await cancelPendingOutbound(contact._id);

    const lastConfirm = await lastAutoReplyAt(contact._id, "stop-confirm");
    if (!lastConfirm || Date.now() - lastConfirm.getTime() > AUTO_REPLY_COOLDOWN_MS) {
      await sendSystemReply(contact, line, STOP_CONFIRM_TEXT, "stop-confirm");
    }

    notifyVtextAlert({
      level: "info",
      title: "Contact opted out",
      fields: [
        { label: "Contact", value: contact.phoneE164 },
        { label: "Method", value: `${keyword.method} ("${keyword.matched}")` },
        { label: "Cancelled pending sends", value: cancelledCount },
      ],
    }).catch(() => {});
  } else if (keyword.type === "help") {
    const lastHelp = await lastAutoReplyAt(contact._id, "help");
    if (!lastHelp || Date.now() - lastHelp.getTime() > AUTO_REPLY_COOLDOWN_MS) {
      await sendSystemReply(contact, line, HELP_TEXT, "help");
    }
  } else if (keyword.type === "start") {
    // An admin-set opt-out is a deliberate human decision — a keyword doesn't override it.
    if (contact.optOut?.isOptedOut && contact.optOut.method !== "admin") {
      contact.optOut = { isOptedOut: false };
      contact.consent.status = "opted-in";
      contact.consent.source = "inbound-initiated";
      contact.consent.capturedAt = new Date();
      contact.consentEvents.push({ type: "resubscribe", at: new Date(), method: keyword.method, keyword: keyword.matched, messageId: message._id, lineId: line._id });
      await contact.save();
      await sendSystemReply(contact, line, "You're resubscribed to messages from Vihara.", "resubscribe-confirm");
    }
  } else if (process.env.VTEXT_AI_DRAFT_REPLY_ENABLED === "true" && !contact.optOut?.isOptedOut) {
    // No compliance keyword matched — a real inbound message that may
    // warrant an AI-drafted reply (Phase 7c). Fire-and-forget: drafting
    // itself (the LLM call) happens in draftReplyWorker.js, not here, so an
    // LLM round-trip never blocks this webhook-processing job or its retry
    // semantics.
    const { getDraftReplyQueue } = require("../queue/queues");
    await getDraftReplyQueue().add("draft-reply", {
      conversationId: String(conversation._id),
      contactId: String(contact._id),
      inboundMessageId: String(message._id),
      lineId: String(line._id),
      channelType: line.channelType,
    });
  }

  publishEvent({ type: "message.inbound", conversationId: String(conversation._id), contactId: String(contact._id) });
}

async function handleMessageStatus(event) {
  let message = await VtextMessage.findOne({ "provider.messageId": event.providerMessageId });
  // BlueBubbles can report the receipt under a different guid than the one we
  // stored at send time. We send our message _id as the tempGuid, so fall back to it.
  if (!message && event.tempGuid && mongoose.isValidObjectId(event.tempGuid)) {
    message = await VtextMessage.findOne({ _id: event.tempGuid, direction: "out" });
  }
  if (!message) {
    console.warn(`[vtext inbound] status update for unknown provider message id ${event.providerMessageId}`);
    return;
  }

  // Monotonic: never regress a later status to an earlier one if webhooks arrive out of order.
  const ORDER = ["accepted", "sent", "delivered", "read"];
  const currentIdx = ORDER.indexOf(message.status);
  const incomingIdx = ORDER.indexOf(event.status);
  if (event.status === "failed") {
    message.status = "failed";
    message.error = { kind: event.errorKind || "line", code: event.errorCode, message: event.errorMessage };
    message.failedAt = event.at || new Date();
  } else if (incomingIdx > currentIdx) {
    message.status = event.status;
    if (event.status === "sent") message.sentAt = event.at || new Date();
    if (event.status === "delivered") message.deliveredAt = event.at || new Date();
    if (event.status === "read") {
      message.readAt = event.at || new Date();
      if (!message.deliveredAt) message.deliveredAt = message.readAt; // a read implies delivery
    }
  }
  await message.save();
  publishEvent({ type: "message.updated", messageId: String(message._id), conversationId: message.conversationId ? String(message.conversationId) : null, status: message.status });
}

async function handleLineHeartbeat(event, line) {
  line.health = line.health || {};
  line.health.lastHeartbeatAt = event.at || new Date();
  if (event.device) line.health.device = { ...line.health.device, ...event.device };
  await line.save();
}

async function processInboundJob(job) {
  const { webhookEventId } = job.data;
  const webhookEvent = await VtextWebhookEvent.findById(webhookEventId);
  if (!webhookEvent) {
    console.warn(`[vtext inbound] webhook event ${webhookEventId} not found, dropping job`);
    return;
  }

  const line = await VtextLine.findById(webhookEvent.lineId);
  if (!line) {
    webhookEvent.processed = true;
    webhookEvent.error = "line no longer exists";
    await webhookEvent.save();
    return;
  }

  const adapter = getAdapter(webhookEvent.channelType);
  let events;
  try {
    events = adapter.parseWebhook({ body: webhookEvent.body, headers: webhookEvent.headers, line }) || [];
  } catch (err) {
    webhookEvent.error = `parseWebhook threw: ${err.message}`;
    await webhookEvent.save();
    throw err; // let BullMQ retry — this could be a transient adapter bug
  }

  for (const event of events) {
    if (event.type === "message.received") {
      await handleMessageReceived(event, line);
    } else if (event.type === "message.status") {
      await handleMessageStatus(event);
    } else if (event.type === "line.heartbeat") {
      await handleLineHeartbeat(event, line);
    }
  }

  webhookEvent.processed = true;
  await webhookEvent.save();
}

let worker = null;

function startInboundWorker() {
  if (worker) return worker;
  worker = new Worker(QUEUE_NAMES.INBOUND, processInboundJob, {
    connection: bullmqConnection(),
    prefix: QUEUE_PREFIX,
    concurrency: 10,
    // BullMQ's 30s default stalled-check runs continuously regardless of
    // traffic — a real, measured contributor to Upstash command usage.
    stalledInterval: 90_000,
  });
  worker.on("failed", (job, err) => {
    console.error(`[vtext inbound] job ${job?.id} failed:`, err.message);
  });
  return worker;
}

async function stopInboundWorker() {
  if (worker) {
    await worker.close();
    worker = null;
  }
}

module.exports = { processInboundJob, startInboundWorker, stopInboundWorker };
