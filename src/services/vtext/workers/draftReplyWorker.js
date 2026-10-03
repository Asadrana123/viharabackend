// services/vtext/workers/draftReplyWorker.js
//
// Processes the vtext-draft-reply queue (Phase 7c). Separate from
// inboundWorker.js on purpose — an LLM call has a different latency/failure
// profile than webhook reprocessing, and this keeps that call off the
// webhook-processing path entirely (inboundWorker.js just enqueues a job and
// moves on). Never sends anything itself: creates a "pending-approval"
// VtextMessage (vtextDraftReplyService.createDraftReply), and only
// enqueues it for an actual send if vtextSettingsModel's
// aiAutoReplyEnabled is on — otherwise it waits in the admin Inbox.
const { Worker } = require("bullmq");
const VtextMessage = require("../../../model/vtext/vtextMessageModel");
const VtextContact = require("../../../model/vtext/vtextContactModel");
const { bullmqConnection } = require("../queue/connection");
const { QUEUE_NAMES, QUEUE_PREFIX } = require("../queue/queues");
const { getSettings } = require("../vtextSettingsService");
const { buildPropertyContext, generateDraftReply, MODEL_NAME } = require("../vtextAiReplyService");
const { createDraftReply, approveDraft } = require("../vtextDraftReplyService");
const { publishEvent } = require("../vtextEventsBus");

const HISTORY_LIMIT = 10;

async function processDraftReplyJob(job) {
  const { conversationId, contactId, inboundMessageId, lineId, channelType } = job.data;

  const contact = await VtextContact.findById(contactId).lean();
  if (!contact || contact.optOut?.isOptedOut) return; // state may have shifted since enqueue — bail quietly

  // One draft per inbound message (not one per conversation) — a burst of
  // several messages gets a separate draft for each, so nothing gets
  // silently skipped. This check is retry-safety (a BullMQ retry of the
  // same job must not create a second draft for the same inbound message),
  // not a throttle.
  const alreadyDrafted = await VtextMessage.exists({ "origin.replyToMessageId": inboundMessageId });
  if (alreadyDrafted) return;

  const inboundMessage = await VtextMessage.findById(inboundMessageId).select("body").lean();
  if (!inboundMessage?.body) return;

  const history = await VtextMessage.find({ conversationId })
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
    console.error(`[vtext draft-reply] job ${job?.id} failed:`, err.message);
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
