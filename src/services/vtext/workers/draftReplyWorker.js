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

const HISTORY_LIMIT = 10;
const AI_FAILURE_ALERT_COOLDOWN_MS = 30 * 60_000; // a Gemini outage must not post once per customer message

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

  // With the knowledge lookup on, the AI also gets what this lead told us and the property details that
  // match the question (vtextKnowledgeService.js, which never throws). Off, nothing changes.
  // A Toorak lead (Facebook ad) also gets Prajwal's reply rules and its home's facts (vtextToorakReplyRules.js).
  const toorak = await loadToorakLead(contact);
  const knowledge = isRagEnabled() ? await buildReplyKnowledge({ contact, messages: history, replyToBody: inboundMessage.body, conversationId, toorak }) : null;
  const propertyContext = knowledge ? knowledge.propertyContext : await buildPropertyContext(contact, toorak);
  let draft = await generateDraftReply({ contact, messages: history, replyToBody: inboundMessage.body, propertyContext, knowledge, toorak });
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
        { label: "Their message", value: clip(inboundMessage.body), wide: true },
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
      sourceTexts: collectSourceTexts({ knowledge, messages: history, replyToBody: inboundMessage.body }),
      customerTexts: customerTextsOf({ messages: history, replyToBody: inboundMessage.body }),
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
    await approveDraft(message._id, { approvedBy: { adminId: null, adminName: "AI (auto-approved)" }, delayMs: humanReplyDelayMs(body) });
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
          { label: "Question", value: clip(inboundMessage.body), wide: true },
          { label: "AI draft", value: clip(body), wide: true },
          { label: "Inbox", value: `<${inboxUrl(conversationId)}|Open the conversation>`, wide: true },
        ],
      }).catch(() => {});
    }
  }
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

module.exports = { processDraftReplyJob, startDraftReplyWorker, stopDraftReplyWorker };
