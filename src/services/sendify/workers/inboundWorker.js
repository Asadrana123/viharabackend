// services/sendify/workers/inboundWorker.js
//
// Processes the sendify-inbound queue (sendify-infra.md §6.2). Each job
// points at a persisted sendifyWebhookEvent; this re-parses it through the
// line's channel adapter and handles every NormalizedEvent it yields.
const { Worker } = require("bullmq");
const { toUsSmsNumber } = require("../../../utils/usPhone");
const { timezoneForPhone } = require("../../../utils/areaCodeTimezone");
const SendifyWebhookEvent = require("../../../model/sendify/sendifyWebhookEventModel");
const SendifyLine = require("../../../model/sendify/sendifyLineModel");
const SendifyContact = require("../../../model/sendify/sendifyContactModel");
const SendifyConversation = require("../../../model/sendify/sendifyConversationModel");
const SendifyMessage = require("../../../model/sendify/sendifyMessageModel");
const { getAdapter } = require("../channels/registry");
const { bullmqConnection } = require("../queue/connection");
const { QUEUE_NAMES, QUEUE_PREFIX, getRouteQueue } = require("../queue/queues");
const capacity = require("../sendifyCapacityService");
const { detectKeyword } = require("../sendifyComplianceService");
const { publishEvent } = require("../sendifyEventsBus");
const { MODEL_BY_TYPE } = require("../../leads/leadModelsByType");
const { notifySendifyAlert } = require("../../shared/slackService");

const HELP_TEXT = process.env.SENDIFY_HELP_TEXT || "This is Vihara. Reply STOP to opt out, or visit vihara.ai for more info.";
const STOP_CONFIRM_TEXT = process.env.SENDIFY_STOP_CONFIRM_TEXT || "You're unsubscribed and won't receive more messages from Vihara. Reply START to resubscribe.";
const AUTO_REPLY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // one HELP / one stop-confirm per contact per 24h

function normalizeInboundAddress(raw) {
  if (typeof raw !== "string") return null;
  if (raw.includes("@")) return raw.trim().toLowerCase();
  return toUsSmsNumber(raw);
}

/** Looks a phone up across every linked lead collection; returns the first match (and stops there — a number rarely appears in more than one source). */
async function findLeadRefs(phoneE164) {
  const refs = [];
  for (const [leadType, Model] of Object.entries(MODEL_BY_TYPE)) {
    try {
      const lead = await Model.findOne({ phoneNormalized: phoneE164 }).select("_id smsConsent smsConsentText smsConsentAt").lean();
      if (lead) {
        refs.push({ leadType, leadId: lead._id, lead });
      }
    } catch (err) {
      console.error(`[sendify inbound] lead lookup failed for ${leadType}:`, err.message);
    }
  }
  return refs;
}

/** Sends one system-origin message, routed back through the same channel the inbound message arrived on (not a channelPolicy-default "any" — see channelPolicy below for why that matters) and bypassing the normal compliance gate via sendifyComplianceService's SYSTEM_BYPASS_TEMPLATES (currently stop-confirm and help). */
async function sendSystemReply(contact, line, body, templateKey) {
  const conversation = await SendifyConversation.findOne({ contactId: contact._id, lineId: line._id });
  const message = await SendifyMessage.create({
    direction: "out",
    contactId: contact._id,
    lineId: line._id,
    conversationId: conversation?._id,
    channelType: line.channelType,
    body,
    status: "queued",
    origin: { kind: "system", templateKey },
    // Without this, channelPolicy defaults to {mode:"any", channels:[]} and
    // sendifyRouter's default candidate list excludes "mock" (never a silent
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
  const last = await SendifyMessage.findOne({ contactId, "origin.kind": "system", "origin.templateKey": templateKey })
    .sort({ createdAt: -1 })
    .select("createdAt");
  return last?.createdAt || null;
}

async function cancelPendingOutbound(contactId) {
  const pending = await SendifyMessage.find({
    contactId,
    direction: "out",
    status: { $in: ["queued", "waiting-window", "waiting-capacity", "assigned"] },
  });

  for (const message of pending) {
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
      console.warn(`[sendify inbound] couldn't remove line-queue job for message ${message._id}:`, err.message);
    }

    if (message.status === "assigned" && message.lineId) {
      const line = await SendifyLine.findById(message.lineId);
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
    const existing = await SendifyMessage.findOne({ channelType: line.channelType, "provider.messageId": event.providerMessageId });
    if (existing) return;
  }

  const phoneStatus = from ? "valid" : "invalid";
  const contactKey = from || event.from; // store something even for an unparseable sender, so the event isn't silently dropped

  let contact = await SendifyContact.findOne({ phoneE164: contactKey });
  if (!contact) {
    const leadRefs = from ? await findLeadRefs(from) : [];
    const consentLead = leadRefs.find((r) => r.lead.smsConsent === true);

    contact = await SendifyContact.create({
      phoneE164: contactKey,
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

  let conversation = await SendifyConversation.findOne({ contactId: contact._id, lineId: line._id });
  const isFirstInbound = !conversation?.firstInboundAt;
  conversation = await SendifyConversation.findOneAndUpdate(
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

  const message = await SendifyMessage.create({
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
    // matched; sendifyContactModel's optOut.method enum describes the
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

    notifySendifyAlert({
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
  }

  publishEvent({ type: "message.inbound", conversationId: String(conversation._id), contactId: String(contact._id) });
}

async function handleMessageStatus(event) {
  const message = await SendifyMessage.findOne({ "provider.messageId": event.providerMessageId });
  if (!message) {
    console.warn(`[sendify inbound] status update for unknown provider message id ${event.providerMessageId}`);
    return;
  }

  // Monotonic: never regress a later status to an earlier one if webhooks arrive out of order.
  const ORDER = ["accepted", "sent", "delivered"];
  const currentIdx = ORDER.indexOf(message.status);
  const incomingIdx = ORDER.indexOf(event.status);
  if (event.status === "failed") {
    message.status = "failed";
    message.error = { kind: "line", code: event.errorCode, message: event.errorMessage };
    message.failedAt = event.at || new Date();
  } else if (incomingIdx > currentIdx) {
    message.status = event.status;
    if (event.status === "sent") message.sentAt = event.at || new Date();
    if (event.status === "delivered") message.deliveredAt = event.at || new Date();
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
  const webhookEvent = await SendifyWebhookEvent.findById(webhookEventId);
  if (!webhookEvent) {
    console.warn(`[sendify inbound] webhook event ${webhookEventId} not found, dropping job`);
    return;
  }

  const line = await SendifyLine.findById(webhookEvent.lineId);
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
  });
  worker.on("failed", (job, err) => {
    console.error(`[sendify inbound] job ${job?.id} failed:`, err.message);
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
