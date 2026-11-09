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
const { cancelPendingOutbound, recordProviderOptOut } = require("../vtextOptOutService");
const { publishEvent } = require("../vtextEventsBus");
const { findLeadRefs, consentFromRef } = require("../vtextLeadLookupService");
const { endFollowUp } = require("../vtextFollowUpService");
const { notifyVtextAlert } = require("../../shared/slackService");
const { reportTextProblem } = require("../vtextTextProblemAlert");
const { notifyOptOut } = require("../vtextOptOutService");
const { notifyInboundNoDraft } = require("../vtextAlertService");
const { learnFromMessageStatus } = require("../../calling/facetime/iphoneLearning");
const smsFallback = require("../vtextSmsFallbackService");

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
    const consentLead = leadRefs.find((r) => r.consent.consented);

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
      consent: consentLead ? consentFromRef(consentLead) : { status: "unknown" },
    });
  }

  let conversation = await VtextConversation.findOne({ contactId: contact._id, lineId: line._id });
  const isFirstInbound = !conversation?.firstInboundAt;
  conversation = await VtextConversation.findOneAndUpdate(
    { contactId: contact._id, lineId: line._id },
    {
      $setOnInsert: {
        channelType: line.channelType,
        contactPhone: contact.phoneE164,
        lineAddress: line.address,
        ...(contact.followUp?.propertyId ? { propertyId: contact.followUp.propertyId } : {}),
      },
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

  let keyword = detectKeyword(event.body);
  // Twilio's Advanced Opt-Out tells us when IT acted on a keyword (OptOutType STOP / START / HELP), and it has already
  // answered the person. Its word wins over our text matching, and we must not send a second confirmation of our own
  // (a STOP confirmation to a number Twilio just blocked would only come back as error 21610).
  const providerKeywordType = { STOP: "stop", START: "start", HELP: "help" }[event.optOutType];
  if (providerKeywordType && keyword.type !== providerKeywordType) {
    keyword = { type: providerKeywordType, matched: event.optOutType, method: "exact" };
  }
  const providerAnswered = Boolean(providerKeywordType) && getAdapter(line.channelType).capabilities?.providerHandlesKeywords === true;
  // "Yes" is the most common answer to our own questions ("Are you free for a quick call?"). It only
  // counts as a resubscribe keyword for someone who is actually opted out; for anyone else it is a
  // normal reply and goes to the AI. START and UNSTOP stay keywords for everyone.
  if (keyword.type === "start" && keyword.matched === "YES" && !contact.optOut?.isOptedOut) {
    keyword = { type: null, matched: null, method: null };
  }

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

  // One alert per reply that no AI draft will answer, so a person knows to look. STOP already alerts above.
  const alertNoDraft = (reason) =>
    notifyInboundNoDraft({ contact, conversationId: conversation._id, body: event.body, reason });

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
    if (!providerAnswered && (!lastConfirm || Date.now() - lastConfirm.getTime() > AUTO_REPLY_COOLDOWN_MS)) {
      await sendSystemReply(contact, line, STOP_CONFIRM_TEXT, "stop-confirm");
    }

    notifyOptOut({
      contact,
      how: keyword.method === "exact" ? `Texted ${keyword.matched}` : `Asked to stop ("${keyword.matched}")`,
      theirMessage: message.body,
      lineName: line.name,
      cancelledCount,
      conversationId: conversation?._id,
    });
  } else if (keyword.type === "help") {
    const lastHelp = await lastAutoReplyAt(contact._id, "help");
    if (!providerAnswered && (!lastHelp || Date.now() - lastHelp.getTime() > AUTO_REPLY_COOLDOWN_MS)) {
      await sendSystemReply(contact, line, HELP_TEXT, "help");
    }
    alertNoDraft(providerAnswered ? "They sent HELP, and Twilio answered it automatically" : "They sent HELP, so the help text was sent automatically");
  } else if (keyword.type === "start") {
    // An admin-set opt-out is a deliberate human decision — a keyword doesn't override it.
    if (contact.optOut?.isOptedOut && contact.optOut.method !== "admin") {
      contact.optOut = { isOptedOut: false };
      contact.consent.status = "opted-in";
      contact.consent.source = "inbound-initiated";
      contact.consent.capturedAt = new Date();
      contact.consentEvents.push({ type: "resubscribe", at: new Date(), method: keyword.method, keyword: keyword.matched, messageId: message._id, lineId: line._id });
      await contact.save();
      if (!providerAnswered) await sendSystemReply(contact, line, "You're resubscribed to messages from Vihara.", "resubscribe-confirm");
      alertNoDraft(providerAnswered ? "They had opted out and resubscribed, and Twilio sent the confirmation" : "They had opted out and resubscribed, so the confirmation was sent automatically");
    } else if (contact.optOut?.isOptedOut) {
      alertNoDraft("They are opted out by an admin, and a keyword does not change that");
    } else {
      alertNoDraft(`They sent ${keyword.matched}, which is a keyword, and they were not opted out, so nothing was done`);
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
  } else {
    alertNoDraft(contact.optOut?.isOptedOut ? "This contact is opted out, so no AI reply is made" : "AI replies are switched off");
  }

  publishEvent({ type: "message.inbound", conversationId: String(conversation._id), contactId: String(contact._id) });
}

async function handleMessageStatus(event, line) {
  // Scoped to the receiving line's channel when known: provider ids from different providers must never match each other.
  let message = await VtextMessage.findOne({ ...(line ? { channelType: line.channelType } : {}), "provider.messageId": event.providerMessageId });
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
    // A late "failed" must not overwrite a text that already reached the phone (carriers sometimes report both).
    if (message.status === "delivered" || message.status === "read") return;
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
  await learnFromMessageStatus(message, event); // FaceTime test: is this number on iPhone? Never throws.

  // Twilio blocks sends to a number that texted STOP to it (error 21610). Mirror that here so no other line texts them.
  if (event.status === "failed" && String(event.errorCode) === "21610") {
    try {
      const contact = await VtextContact.findById(message.contactId);
      await recordProviderOptOut(contact, { lineId: message.lineId, messageId: message._id, code: "21610" });
    } catch (err) {
      console.error(`[vtext inbound] couldn't record the provider opt-out for message ${message._id}:`, err.message);
    }
  }

  // SMS fallback (off unless VTEXT_SMS_FALLBACK_ENABLED): an iMessage that was not delivered goes out once by SMS;
  // one that turns out delivered stops a fallback that has not gone out yet. Never lets an error here lose the receipt.
  let fallback = null;
  try {
    if (message.channelType === smsFallback.IMESSAGE) {
      if (message.status === "failed" && smsFallback.isExplicitIMessageFailure(message.error?.code)) {
        fallback = await smsFallback.maybeQueueSmsFallback(message, { trigger: "not-delivered", reason: message.error?.code });
      } else if (message.status === "delivered" || message.status === "read") {
        await smsFallback.onOriginalConfirmed(message);
      }
    }
  } catch (err) {
    console.error(`[vtext sms-fallback] receipt handling failed for message ${message._id}:`, err.message);
    fallback = { queued: false, reason: `the fallback could not be queued (${err.message})` };
  }
  // A "not delivered" receipt (iMessage or Twilio): one Slack message for this lead's text, unless the SMS
  // fallback is now on its way. Never throws; a repeated receipt posts nothing.
  if (event.status === "failed" && message.status === "failed") await reportTextProblem(message, { fallback });
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
    events = adapter.parseWebhook({ body: webhookEvent.body, query: webhookEvent.query, headers: webhookEvent.headers, line }) || [];
  } catch (err) {
    webhookEvent.error = `parseWebhook threw: ${err.message}`;
    await webhookEvent.save();
    throw err; // let BullMQ retry — this could be a transient adapter bug
  }

  for (const event of events) {
    if (event.type === "message.received") {
      await handleMessageReceived(event, line);
    } else if (event.type === "message.status") {
      await handleMessageStatus(event, line);
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

module.exports = { processInboundJob, startInboundWorker, stopInboundWorker, handleMessageStatus, handleMessageReceived };
