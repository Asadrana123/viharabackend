// services/sendify/workers/routeWorker.js
//
// Processes the sendify-route queue (sendify-infra.md §4.3, routeWorker
// section). Picks a line, reserves capacity, creates/updates the
// conversation, and hands off to that line's own queue for the actual send.
// Never sends anything itself — that's lineSendWorker's job.
const { Worker } = require("bullmq");
const SendifyMessage = require("../../../model/sendify/sendifyMessageModel");
const SendifyContact = require("../../../model/sendify/sendifyContactModel");
const SendifyConversation = require("../../../model/sendify/sendifyConversationModel");
const { bullmqConnection } = require("../queue/connection");
const { QUEUE_NAMES, QUEUE_PREFIX, getLineQueue } = require("../queue/queues");
const { canSend } = require("../sendifyComplianceService");
const { checkQuietHours } = require("../sendifyQuietHoursService");
const { selectLine } = require("../sendifyRouter");
const capacity = require("../sendifyCapacityService");

const WAITING_CAPACITY_RETRY_MS = 15 * 60 * 1000; // 15 min, per sendify-infra.md §4.3
const STATUSES_ROUTABLE = ["queued", "waiting-window", "waiting-capacity"];

function uniqueRouteJobId(messageId) {
  return `route-${messageId}-${Date.now()}`;
}

async function requeueRoute(messageId, delayMs) {
  const { getRouteQueue } = require("../queue/queues");
  await getRouteQueue().add("route", { messageId: String(messageId) }, { jobId: uniqueRouteJobId(messageId), delay: delayMs });
}

function jitterMs(line, limits) {
  const { min = 0, max = 0 } = limits.jitterMs || {};
  if (max <= min) return min;
  return min + Math.floor(Math.random() * (max - min));
}

async function processRouteJob(job) {
  const { messageId } = job.data;
  const message = await SendifyMessage.findById(messageId);
  if (!message) {
    console.warn(`[sendify route] message ${messageId} not found, dropping job`);
    return;
  }

  // Idempotent: a message already past routing (assigned/sending/terminal) was
  // already handled by a previous run of this job — nothing to do.
  if (!STATUSES_ROUTABLE.includes(message.status)) {
    return;
  }

  const contact = await SendifyContact.findById(message.contactId);
  if (!contact) {
    message.status = "failed";
    message.error = { kind: "compliance", message: "contact no longer exists" };
    message.failedAt = new Date();
    await message.save();
    return;
  }

  // Gate #2 — a STOP could have arrived between enqueue and now.
  const complianceResult = canSend(contact, { isReplyToInbound: message.isReplyToInbound, origin: message.origin });
  if (!complianceResult.allowed) {
    message.status = "blocked";
    message.error = { kind: complianceResult.errorKind, message: complianceResult.reason };
    await message.save();
    return;
  }

  const { inWindow, nextWindowOpensAt } = checkQuietHours(contact);
  if (!inWindow) {
    message.status = "waiting-window";
    await message.save();
    await requeueRoute(message._id, Math.max(0, nextWindowOpensAt.getTime() - Date.now()));
    return;
  }

  const line = await selectLine(message, contact);
  if (!line) {
    message.status = "waiting-capacity";
    await message.save();
    await requeueRoute(message._id, WAITING_CAPACITY_RETRY_MS);
    return;
  }

  const existingConversation = await SendifyConversation.findOne({ contactId: contact._id, lineId: line._id });
  const isNewRecipient = !existingConversation;

  const reservation = await capacity.reserve(line, { isReply: message.isReplyToInbound, isNewRecipient });
  if (!reservation.ok) {
    // Lost the race for this line's capacity (or its new-recipient slot) —
    // exclude it and go back through selectLine, same job (not a new one),
    // so one route job can hop lines without round-tripping the queue again.
    message.excludeLineIds = [...(message.excludeLineIds || []), line._id];
    await message.save();
    return processRouteJob(job); // re-run with the updated exclusion list
  }

  const limits = capacity.limitsFor(line);

  const conversation = await SendifyConversation.findOneAndUpdate(
    { contactId: contact._id, lineId: line._id },
    {
      $setOnInsert: {
        channelType: line.channelType,
        contactPhone: contact.phoneE164,
        lineAddress: line.address,
        firstOutboundAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  contact.stickyLines.set(line.channelType, line._id);
  await contact.save();

  message.lineId = line._id;
  message.conversationId = conversation._id;
  message.channelType = line.channelType;
  message.status = "assigned";
  message.assignedAt = new Date();
  await message.save();

  await getLineQueue(line._id).add(
    "send",
    { messageId: String(message._id), reservationDay: reservation.day },
    { jobId: `send-${message._id}`, delay: jitterMs(line, limits) }
  );
}

let worker = null;

function startRouteWorker() {
  if (worker) return worker;
  worker = new Worker(QUEUE_NAMES.ROUTE, processRouteJob, {
    connection: bullmqConnection(),
    prefix: QUEUE_PREFIX,
    concurrency: 5,
  });
  worker.on("failed", (job, err) => {
    console.error(`[sendify route] job ${job?.id} failed:`, err.message);
  });
  return worker;
}

async function stopRouteWorker() {
  if (worker) {
    await worker.close();
    worker = null;
  }
}

module.exports = { processRouteJob, startRouteWorker, stopRouteWorker };
