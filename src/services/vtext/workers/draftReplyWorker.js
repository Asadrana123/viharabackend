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
const VtextConversation = require("../../../model/vtext/vtextConversationModel");
const { bullmqConnection } = require("../queue/connection");
const { QUEUE_NAMES, QUEUE_PREFIX } = require("../queue/queues");
const { getSettings } = require("../vtextSettingsService");
const { buildPropertyContext, generateDraftReply, MODEL_NAME } = require("../vtextAiReplyService");
const { createDraftReply, approveDraft, humanReplyDelayMs } = require("../vtextDraftReplyService");
const { isRagEnabled, buildReplyKnowledge } = require("../vtextKnowledgeService");
const { loadToorakLead } = require("../vtextToorakReplyRules");
const { SAFE_HANDOFF, checkReplyAmounts, collectSourceTexts, customerTextsOf } = require("../vtextReplyGuard");
const { publishEvent } = require("../vtextEventsBus");
const { notifyVtextAlert } = require("../../shared/slackService");
const { sendAlertWithCooldown, inboxUrl, clip } = require("../vtextAlertService");
const { detectKeyword } = require("../vtextComplianceService");

const HISTORY_LIMIT = 10;
const AI_FAILURE_ALERT_COOLDOWN_MS = 30 * 60_000; // a Gemini outage must not post once per customer message

async function processDraftReplyJob(job) {
  const { conversationId, contactId, inboundMessageId, lineId, channelType } = job.data;

  const contact = await VtextContact.findById(contactId).lean();
  if (!contact || contact.optOut?.isOptedOut) return; // state may have shifted since enqueue — bail quietly

  // Retry-safety: a BullMQ retry of the same job must not create a second draft for the same inbound message.
  const alreadyDrafted = await VtextMessage.exists({ "origin.replyToMessageId": inboundMessageId });
  if (alreadyDrafted) return;

  const inboundMessage = await VtextMessage.findById(inboundMessageId).select("body createdAt").lean();
  if (!inboundMessage?.body) return;

  // Several texts in a row get ONE reply, written by the job for the newest of them. Two replies drafted at the
  // same time each pick their own human-like pause, so they could go out in the wrong order (seen 2026-11-12).
  // A newer text only takes over when it will get a draft of its own: a STOP/HELP/START keyword does not.
  if (await hasNewerTextToAnswer(conversationId, inboundMessage)) return;

  const recent = await VtextMessage.find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(HISTORY_LIMIT)
    .select("direction body createdAt")
    .lean();
  recent.reverse();
  // Their texts since our last message are answered together, as one message, and the AI sees them that way.
  const { history, replyToBody } = mergeUnansweredTexts(recent, inboundMessage);

  // With the knowledge lookup on, the AI also gets what this lead told us and the property details that
  // match the question (vtextKnowledgeService.js, which never throws). Off, nothing changes.
  // A Toorak lead (Facebook ad) also gets Prajwal's reply rules and its home's facts (vtextToorakReplyRules.js).
  const toorak = await loadToorakLead(contact);
  const knowledge = isRagEnabled() ? await buildReplyKnowledge({ contact, messages: history, replyToBody, conversationId, toorak }) : null;
  const propertyContext = knowledge ? knowledge.propertyContext : await buildPropertyContext(contact, toorak);
  let draft = await generateDraftReply({ contact, messages: history, replyToBody, propertyContext, knowledge, toorak });
  if (!draft) {
    // Generation unavailable or failed: the conversation just stays needs-reply, which used to be
    // completely silent. Tell the team once in a while that nobody is answering this customer.
    await sendAlertWithCooldown("ai-draft-failed", AI_FAILURE_ALERT_COOLDOWN_MS, {
      level: "error",
      icon: "🔴",
      title: "AI could not draft a reply",
      fields: [
        { label: "Contact", value: contact.name || "(no name)" },
        { label: "Phone", value: contact.phoneE164 },
        { label: "Why", value: "The AI service returned nothing. It may be down, or its key may be missing or out of credit.", wide: true },
        { label: "What to do", value: "Reply to them by hand from the Inbox. This alert repeats at most once in a while, so other customers may be waiting too.", wide: true },
        { label: "Their message", value: clip(replyToBody), wide: true },
        { label: "Inbox", value: `<${inboxUrl(conversationId)}|Open the conversation>`, wide: true },
      ],
    }).catch((err) => console.error("[vtext draft-reply] could not send the AI-failure alert:", err.message));
    return;
  }

  // With the knowledge lookup on, a dollar amount the AI was never shown (a guess at the reserve price,
  // say) must not go out. The draft is swapped for a plain hand-off and the original kept for review.
  let guard;
  if (knowledge) {
    const check = checkReplyAmounts({
      reply: draft.reply,
      sourceTexts: collectSourceTexts({ knowledge, messages: history, replyToBody }),
      customerTexts: customerTextsOf({ messages: history, replyToBody }),
    });
    if (!check.ok) {
      console.warn(`[vtext guard] reply replaced, it contained amount(s) the AI was not given: ${check.unsupported.join(", ")}`);
      guard = { replaced: true, amounts: check.unsupported, originalReply: draft.reply };
      draft = { reply: SAFE_HANDOFF, needsHuman: true, topic: draft.quotedPrice ? draft.topic : "amount to check", bestTime: draft.bestTime, language: draft.language }; // a quoted price stays the topic
    }
  }
  const { reply: body, needsHuman, topic, bestTime, language } = draft;

  const message = await createDraftReply({
    contactId,
    conversationId,
    lineId,
    channelType,
    inboundMessageId,
    body,
    model: MODEL_NAME,
    needsHuman,
    topic,
    bestTime,
    language,
    sources: knowledge?.sources,
    retrieval: knowledge?.retrieval,
    guard,
  });
  await publishEvent({ type: "message.updated", conversationId: String(conversationId), contactId: String(contactId) });

  const settings = await getSettings();
  if (settings.aiAutoReplyEnabled) {
    // A human-like pause before it goes out (20-50 s, longer for a long reply): an answer a few seconds after their text reads as a bot.
    await approveDraft(message._id, { approvedBy: { adminId: null, adminName: "AI (auto-approved)" }, delayMs: await autoReplyDelayMs({ conversationId, messageId: message._id, body, textAt: inboundMessage.createdAt }) });
    await publishEvent({ type: "message.updated", conversationId: String(conversationId), contactId: String(contactId) });
  }

  if (needsHuman) {
    // The reminder clock (vtextNeedsHumanReminder.js) starts when the flag goes on, not on every later flagged text.
    await VtextConversation.updateOne({ _id: conversationId, needsHuman: { $ne: true } }, { $set: { needsHumanAt: new Date(), needsHumanReminders: 0 } });
    await VtextConversation.updateOne({ _id: conversationId }, { $set: { needsHuman: true, ...(bestTime ? { bestTimeToReach: bestTime } : {}) } });
    await publishEvent({ type: "message.updated", conversationId: String(conversationId), contactId: String(contactId) });

    // A reply sent automatically already posted one combined Slack message (vtextAlertService.notifyAiReplySent),
    // which says the team must follow up. Only a draft that is still waiting needs its own alert, because
    // nothing else tells the team it is sitting in the Inbox.
    if (!settings.aiAutoReplyEnabled) {
      notifyVtextAlert({
        level: "warning",
        icon: "🙋",
        title: "AI could not answer, team follow-up needed",
        fields: [
          { label: "Contact", value: contact.name || "(no name)" },
          { label: "Phone", value: contact.phoneE164 },
          { label: "Property", value: propertyContext?.property_name || propertyContext?.property_address },
          { label: "Topic", value: topic },
          { label: "Best time to reach them", value: bestTime || undefined },
          { label: "Language", value: language ? `Texting in ${language}` : undefined },
          { label: "Status", value: "Draft waiting for approval, nothing sent yet" },
          { label: "Question", value: clip(replyToBody), wide: true },
          { label: "AI draft", value: clip(body), wide: true },
          { label: "Inbox", value: `<${inboxUrl(conversationId)}|Open the conversation>`, wide: true },
        ],
      }).catch(() => {});
    }
  }
}

/**
 * How long a new text waits before the AI drafts its reply, so a second text sent right after it is answered in the
 * same reply. Env VTEXT_AI_REPLY_BATCH_SEC (default 15, 0 switches it off).
 * @returns {number} milliseconds
 */
function replyBatchDelayMs() {
  const raw = process.env.VTEXT_AI_REPLY_BATCH_SEC;
  const sec = raw !== undefined && raw !== "" && Number.isFinite(Number(raw)) && Number(raw) >= 0 ? Number(raw) : 15;
  return Math.round(sec * 1000);
}

/** True when a later text in this conversation will get its own draft, which then answers this one too. */
async function hasNewerTextToAnswer(conversationId, inboundMessage) {
  const newer = await VtextMessage.find({ conversationId, direction: "in", createdAt: { $gt: inboundMessage.createdAt } })
    .select("body")
    .lean();
  return newer.some((m) => m.body && !detectKeyword(m.body).type);
}

/**
 * Their texts since our last message become one message: the AI answers all of them, and does not treat the earlier
 * ones as "already answered" history. A keyword text (STOP/HELP/START) in the run is left out of what the AI answers.
 * @param {object[]} recent - the conversation's latest messages, oldest first, including `current`
 * @param {object} current - the text this job was made for (the newest one)
 * @returns {{ history: object[], replyToBody: string }} history ends with the combined text
 */
function mergeUnansweredTexts(recent, current) {
  let start = recent.length;
  while (start > 0 && recent[start - 1].direction === "in") start -= 1;
  const run = recent.slice(start).filter((m) => m.body && !detectKeyword(m.body).type);
  if (!run.some((m) => String(m._id) === String(current._id))) run.push(current);
  const replyToBody = run.map((m) => m.body).join("\n");
  return { history: [...recent.slice(0, start), { direction: "in", body: replyToBody }], replyToBody };
}

/**
 * The pause before an auto-sent reply. The human-like pause (humanReplyDelayMs) is counted from their text, not
 * from now, since the batching wait and the AI call already took part of it. And it never goes out before a reply
 * still waiting in this conversation, so their order holds.
 */
async function autoReplyDelayMs({ conversationId, messageId, body, textAt, now = Date.now() }) {
  const sinceText = textAt ? Math.max(0, now - new Date(textAt).getTime()) : 0;
  let wait = Math.max(0, humanReplyDelayMs(body) - sinceText);
  const waiting = await VtextMessage.findOne({ conversationId, _id: { $ne: messageId }, direction: "out", status: "queued", scheduledFor: { $gt: new Date(now) } })
    .sort({ scheduledFor: -1 })
    .select("scheduledFor")
    .lean();
  if (waiting) wait = Math.max(wait, waiting.scheduledFor.getTime() - now + 5000);
  return wait;
}

let worker = null;

function startDraftReplyWorker() {
  if (worker) return worker;
  worker = new Worker(QUEUE_NAMES.DRAFT_REPLY, processDraftReplyJob, {
    connection: bullmqConnection(),
    prefix: QUEUE_PREFIX,
    concurrency: 5,
    // BullMQ's 30s default stalled-check runs continuously regardless of
    // traffic — a real, measured contributor to Upstash command usage.
    stalledInterval: 90_000,
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

module.exports = { processDraftReplyJob, startDraftReplyWorker, stopDraftReplyWorker, replyBatchDelayMs, mergeUnansweredTexts, autoReplyDelayMs, _test: { hasNewerTextToAnswer } };
