// services/enrichment/enrichmentCallRunner.js
//
// Our own small runner around dispatchCall (enrich.md §7.2, decision #3) —
// does NOT reuse vapiCampaignService.createCampaign/runCampaign, which has
// no way to accept enrichment we already stored short of editing it. Only
// imports from src/services/calling/ (never edits — decision #2):
// vapiPropertyService.resolveProperty, vapiPromptService.resolvePromptConfig,
// vapiService.dispatchCall/parsePhones.
//
// Split into prepare (validates the property + prompt, builds recipients
// with their research summaries, creates the call-run doc — NO call is
// placed) and run (the part that actually calls dispatchCall), the same
// fast/slow shape as createList/startEnrichment and the SMS/Email dispatch.

const EnrichmentCallRun = require("../../model/enrichment/enrichmentCallRunModel");
const EnrichmentList = require("../../model/enrichment/enrichmentListModel");
const EnrichmentListRow = require("../../model/enrichment/enrichmentListRowModel");
const Errorhandler = require("../../utils/errorhandler");
const { resolveProperty } = require("../calling/vapiPropertyService");
const { resolvePromptConfig } = require("../calling/vapiPromptService");
const { dispatchCall, parsePhones } = require("../calling/vapiService");
const { buildResearchSummary } = require("./researchSummary");
const { sendableRows } = require("./enrichmentDispatchService");

const DELAY_BETWEEN_CALLS_MS = 2000; // same pacing as vapiCampaignService.runCampaign
const DELAY_BETWEEN_CONTACTS_MS = 6000;
const STALE_MS = 10 * 60 * 1000; // same rule as Outbound/enrichment lists

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// vapiPropertyService/vapiPromptService throw with `err.statusCode` (capital
// C); our own middleware reads `err.statuscode` (lowercase) — translate
// rather than letting these default to a raw 500.
const asErrorhandler = (err) => new Errorhandler(err.message, err.statusCode || 500);

/**
 * Fast: validates the property has a starting bid and a written voice
 * prompt (both throw before anything is created), builds one recipient per
 * sendable row (every valid phone, decision #17) with its research summary,
 * and creates the call-run document. Does NOT call dispatchCall.
 */
const prepareCallDispatch = async (listId, { propertyId, maxContacts }, user) => {
  const list = await EnrichmentList.findById(listId);
  if (!list) throw new Errorhandler("List not found", 404);

  let property;
  let promptConfig;
  try {
    property = await resolveProperty(propertyId);
    promptConfig = await resolvePromptConfig(propertyId);
  } catch (err) {
    throw asErrorhandler(err);
  }

  const rows = await sendableRows(listId, "call");
  if (rows.length === 0) {
    throw new Errorhandler("call: no sendable rows (every row is excluded or has no valid phone)", 400);
  }
  // Never silently truncated — same rule as every other channel (Outbound's
  // maxContacts, the calling campaign's row cap).
  if (maxContacts && rows.length > maxContacts) {
    throw new Errorhandler(`call: ${rows.length} contacts ready is over your limit of ${maxContacts}`, 400);
  }

  const recipients = rows.map(({ row, effective }) => ({
    rowId: row._id,
    name: effective.fullName || "",
    phones: effective.phones || [],
    address: effective.address || "",
    city: effective.city || "",
    state: effective.state || "",
    zip: effective.zip || "",
    email: effective.email || "",
    status: "pending",
    reason: "",
    researchSummary: buildResearchSummary(effective, property),
    calls: [],
    processedAt: null,
  }));

  const callRun = await EnrichmentCallRun.create({
    listId,
    status: "queued",
    property: { id: property.id, name: property.name, slug: property.slug, address: property.address },
    createdBy: { id: user?._id, email: user?.email || "", name: user?.name || "" },
    counts: { total: recipients.length, processed: 0, dispatched: 0, skipped: 0, failed: 0 },
    recipients,
  });

  await EnrichmentList.updateOne(
    { _id: listId },
    {
      $push: {
        dispatches: {
          channel: "call",
          refId: callRun._id,
          propertyId,
          propertyName: property.name || "",
          rowCount: recipients.length,
          createdBy: { id: user?._id, email: user?.email || "", name: user?.name || "" },
          createdAt: new Date(),
        },
      },
    }
  );
  await EnrichmentListRow.updateMany(
    { _id: { $in: rows.map(({ row }) => row._id) } },
    { $set: { "lastSent.call": { at: new Date(), refId: callRun._id, status: "pending" } } }
  );

  return { callRunId: callRun._id, property, promptConfig };
};

/**
 * Slow: the actual loop. Calls dispatchCall for every phone on every
 * recipient, 2s apart, 6s between contacts — same pacing as
 * vapiCampaignService.runCampaign. Called fire-and-forget after
 * prepareCallDispatch and the HTTP response.
 */
const runCallDispatch = async (callRunId, property, promptConfig) => {
  const callRun = await EnrichmentCallRun.findById(callRunId);
  if (!callRun) return;

  callRun.status = "running";
  callRun.startedAt = new Date();
  await callRun.save();

  try {
    for (let i = 0; i < callRun.recipients.length; i++) {
      const recipient = callRun.recipients[i];
      if (recipient.status !== "pending") continue;

      const phones = parsePhones(recipient.phones.join("|"));
      if (phones.length === 0) {
        await EnrichmentCallRun.updateOne(
          { _id: callRunId },
          {
            $set: {
              [`recipients.${i}.status`]: "skipped",
              [`recipients.${i}.reason`]: "no valid phone numbers",
              [`recipients.${i}.processedAt`]: new Date(),
            },
            $inc: { "counts.skipped": 1, "counts.processed": 1 },
          }
        );
        continue;
      }

      const contact = {
        fullName: recipient.name,
        address: recipient.address,
        city: recipient.city,
        state: recipient.state,
        zip: recipient.zip,
        email: recipient.email || null,
        phones,
      };

      const calls = [];
      for (let p = 0; p < phones.length; p++) {
        const result = await dispatchCall(phones[p], contact, {
          researchSummary: recipient.researchSummary,
          property,
          promptConfig,
        });
        calls.push({
          phone: phones[p],
          success: Boolean(result?.success),
          callId: result?.callId || "",
          error: result?.error || "",
        });
        if (p < phones.length - 1) await delay(DELAY_BETWEEN_CALLS_MS);
      }

      const anySuccess = calls.some((c) => c.success);
      await EnrichmentCallRun.updateOne(
        { _id: callRunId },
        {
          $set: {
            [`recipients.${i}.status`]: anySuccess ? "dispatched" : "failed",
            [`recipients.${i}.calls`]: calls,
            [`recipients.${i}.reason`]: anySuccess ? "" : calls[0]?.error || "call failed",
            [`recipients.${i}.processedAt`]: new Date(),
          },
          $inc: {
            [`counts.${anySuccess ? "dispatched" : "failed"}`]: 1,
            "counts.processed": 1,
          },
        }
      );

      await EnrichmentListRow.updateOne(
        { _id: recipient.rowId },
        { $set: { "lastSent.call.status": anySuccess ? "dispatched" : "failed" } }
      );

      if (i < callRun.recipients.length - 1) await delay(DELAY_BETWEEN_CONTACTS_MS);
    }

    await EnrichmentCallRun.updateOne(
      { _id: callRunId, status: "running" },
      { $set: { status: "completed", finishedAt: new Date() } }
    );
  } catch (err) {
    await EnrichmentCallRun.updateOne(
      { _id: callRunId },
      { $set: { status: "failed", error: err.message || String(err), finishedAt: new Date() } }
    );
  }
};

/** GET /call-runs/:id — same lightweight/?all=true split as Outbound's GET /campaigns/:id. */
const getCallRun = async (id, { all } = {}) => {
  const doc = await EnrichmentCallRun.findById(id).lean();
  if (!doc) return null;

  if (doc.status === "running") {
    const updatedAt = new Date(doc.updatedAt || 0).getTime();
    if (Date.now() - updatedAt > STALE_MS) {
      await EnrichmentCallRun.updateOne(
        { _id: id, status: "running" },
        { $set: { status: "interrupted" } }
      );
      doc.status = "interrupted";
    }
  }

  if (all) return doc;
  return { ...doc, recipients: (doc.recipients || []).slice(-50) };
};

module.exports = { prepareCallDispatch, runCallDispatch, getCallRun };
