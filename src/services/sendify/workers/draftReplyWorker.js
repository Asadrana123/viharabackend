// services/sendify/workers/draftReplyWorker.js
//
// Processes the sendify-draft-reply queue (Phase 7c). Separate from
// inboundWorker.js on purpose — an LLM call has a different latency/failure
// profile than webhook reprocessing, and this keeps that call off the
// webhook-processing path entirely (inboundWorker.js just enqueues a job and
// moves on). Never sends anything itself: creates a "pending-approval"
// SendifyMessage (sendifyDraftReplyService.createDraftReply), and only
// enqueues it for an actual send if sendifySettingsModel's
// aiAutoReplyEnabled is on — otherwise it waits in the admin Inbox.
const { Worker } = require("bullmq");
const SendifyMessage = require("../../../model/sendify/sendifyMessageModel");
const SendifyContact = require("../../../model/sendify/sendifyContactModel");
const { bullmqConnection } = require("../queue/connection");
const { QUEUE_NAMES, QUEUE_PREFIX } = require("../queue/queues");
const { getSettings } = require("../sendifySettingsService");
const { buildPropertyContext, generateDraftReply, MODEL_NAME } = require("../sendifyAiReplyService");
const { createDraftReply, approveDraft } = require("../sendifyDraftReplyService");
const { publishEvent } = require("../sendifyEventsBus");

const HISTORY_LIMIT = 10;

async function processDraftReplyJob(job) {
  const { conversationId, contactId, inboundMessageId, lineId, channelType } = job.data;

  const contact = await SendifyContact.findById(contactId).lean();
  if (!contact || contact.optOut?.isOptedOut) return; // state may have shifted since enqueue — bail quietly

  // One draft per inbound message (not one per conversation) — a burst of
  // several messages gets a separate draft for each, so nothing gets
  // silently skipped. This check is retry-safety (a BullMQ retry of the
  // same job must not create a second draft for the same inbound message),
  // not a throttle.
  const alreadyDrafted = await SendifyMessage.exists({ "origin.replyToMessageId": inboundMessageId });
  if (alreadyDrafted) return;

  const inboundMessage = await SendifyMessage.findById(inboundMessageId).select("body").lean();
  if (!inboundMessage?.body) return;

  const history = await SendifyMessage.find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(HISTORY_LIMIT)
    .select("direction body")
    .lean();
  history.reverse();

  const propertyContext = await buildPropertyContext(contact);
  const body = await generateDraftReply({ contact, messages: history, replyToBody: inboundMessage.body, propertyContext });
  if (!body) return; // generation unavailable/failed — conversation just stays needs-reply

  const message = await createDraftReply({
    contactId,
    conversationId,
    lineId,
    channelType,
    inboundMessageId,
    body,
    model: MODEL_NAME,
  });
  await publishEvent({ type: "message.updated", conversationId: String(conversationId), contactId: String(contactId) });

  const settings = await getSettings();
  if (settings.aiAutoReplyEnabled) {
    await approveDraft(message._id, { approvedBy: { adminId: null, adminName: "AI (auto-approved)" } });
    await publishEvent({ type: "message.updated", conversationId: String(conversationId), contactId: String(contactId) });
  }
}

let worker = null;

function startDraftReplyWorker() {
  if (worker) return worker;
  worker = new Worker(QUEUE_NAMES.DRAFT_REPLY, processDraftReplyJob, {
    connection: bullmqConnection(),
    prefix: QUEUE_PREFIX,
    concurrency: 5,
  });
  worker.on("failed", (job, err) => {
    console.error(`[sendify draft-reply] job ${job?.id} failed:`, err.message);
  });
  return worker;
}

async function stopDraftReplyWorker() {
  if (worker) {
    await worker.close();
    worker = null;
  }
}

module.exports = { processDraftReplyJob, startDraftReplyWorker, stopDraftReplyWorker };
