// services/outbound/outboundCallRunner.js
//
// Our own small runner around dispatchCall, mirroring
// src/services/enrichment/enrichmentCallRunner.js's prepare/run/poll split
// (see the Outbound Calls plan). Only imports from src/services/calling/
// (never edits): vapiPropertyService.resolveProperty, vapiService.dispatchCall.
// Uses outboundContactsService's own CSV/single-contact parser (not
// enrichment's row store) and outboundCallPromptService's own prompt store
// (not vapiPromptService.resolvePromptConfig) — kept fully separate from
// both the existing Calls tab and Enrichment's call channel.
//
// Split into prepare (validates the property + prompt, parses contacts,
// creates the call-run doc — NO call is placed) and run (the part that
// actually calls dispatchCall), same fast/slow shape as
// outboundCampaignService.createCampaign/startCampaign.

const OutboundCallRun = require("../../model/outbound/outboundCallRunModel");
const Product = require("../../model/property/productModel");
const Errorhandler = require("../../utils/errorhandler");
const { resolveProperty } = require("../calling/vapiPropertyService");
const { dispatchCall } = require("../calling/vapiService");
const { validateMaxContacts, parseContacts } = require("./outboundContactsService");
const { resolveOutboundCallPromptConfig } = require("./outboundCallPromptService");

const DELAY_BETWEEN_CONTACTS_MS = 6000; // same pacing as enrichmentCallRunner/vapiCampaignService
const STALE_MS = 10 * 60 * 1000; // same rule as Outbound/Enrichment

// vapiPropertyService/vapiPromptService-shaped errors throw with
// `err.statusCode` (capital C); our own middleware reads `err.statuscode`
// (lowercase) — translate rather than letting these default to a raw 500.
const asErrorhandler = (err) => new Errorhandler(err.message, err.statusCode || 500);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fast: validates the property has a starting bid and a written Outbound
 * call prompt (both throw before anything is created), parses contacts
 * (single or CSV), and creates the call-run document. Does NOT call
 * dispatchCall.
 */
const prepareCallDispatch = async ({ propertyId, maxContacts, csvData, contact, source, csvFileName }, user) => {
  if (!propertyId) throw new Errorhandler("Property not found", 404);
  const property = await Product.findById(propertyId);
  if (!property) throw new Errorhandler("Property not found", 404);

  const validatedMax = validateMaxContacts(maxContacts);

  let resolvedProperty;
  let promptConfig;
  try {
    resolvedProperty = await resolveProperty(propertyId);
    promptConfig = await resolveOutboundCallPromptConfig(propertyId);
  } catch (err) {
    throw asErrorhandler(err);
  }

  const { contacts, skipped, total, overLimit } = parseContacts({
    channel: "call",
    csvData,
    contact,
    maxContacts: validatedMax,
  });

  if (overLimit) {
    throw new Errorhandler(`${total} contacts ready is over your limit of ${validatedMax}`, 400);
  }
  if (total === 0) {
    throw new Errorhandler("No valid contacts to call", 400);
  }

  const recipients = contacts.map((c) => ({
    name: c.name,
    phone: c.phone,
    email: c.email,
    address: c.address,
    city: c.city,
    state: c.state,
    zip: c.zip,
    status: "pending",
    reason: "",
    call: {},
    processedAt: null,
  }));

  const callRun = await OutboundCallRun.create({
    status: "queued",
    source: source === "csv" ? "csv" : "single",
    csvFileName,
    maxContacts: validatedMax,
    property: {
      id: property._id,
      name: resolvedProperty.name || property.productName || "",
      slug: resolvedProperty.slug || property.slug || "",
      address: resolvedProperty.address || "",
    },
    createdBy: { id: user?._id, email: user?.email || "", name: user?.name || "" },
    counts: { total: recipients.length, processed: 0, dispatched: 0, skipped: 0, failed: 0 },
    parseSkipped: skipped,
    recipients,
  });

  return { callRunId: callRun._id, total, skipped, property: resolvedProperty, promptConfig };
};

/**
 * Slow: the actual loop. Calls dispatchCall for every recipient, 6s apart —
 * same contact pacing as Enrichment's call runner. Called fire-and-forget
 * after prepareCallDispatch and the HTTP response.
 */
const runCallDispatch = async (callRunId, property, promptConfig) => {
  const callRun = await OutboundCallRun.findById(callRunId);
  if (!callRun) return;

  callRun.status = "running";
  callRun.startedAt = new Date();
  await callRun.save();

  try {
    for (let i = 0; i < callRun.recipients.length; i++) {
      const recipient = callRun.recipients[i];
      if (recipient.status !== "pending") continue;

      if (!recipient.phone) {
        await OutboundCallRun.updateOne(
          { _id: callRunId },
          {
            $set: {
              [`recipients.${i}.status`]: "skipped",
              [`recipients.${i}.reason`]: "no valid phone number",
              [`recipients.${i}.processedAt`]: new Date(),
            },
            $inc: { "counts.skipped": 1, "counts.processed": 1 },
          }
        );
        if (i < callRun.recipients.length - 1) await delay(DELAY_BETWEEN_CONTACTS_MS);
        continue;
      }

      const person = {
        fullName: recipient.name,
        address: recipient.address,
        city: recipient.city,
        state: recipient.state,
        zip: recipient.zip,
        email: recipient.email || null,
      };

      const result = await dispatchCall(recipient.phone, person, {
        property,
        promptConfig,
        source: "outbound",
      });

      const success = Boolean(result?.success);
      await OutboundCallRun.updateOne(
        { _id: callRunId },
        {
          $set: {
            [`recipients.${i}.status`]: success ? "dispatched" : "failed",
            [`recipients.${i}.call`]: { success, callId: result?.callId || "", error: result?.error || "" },
            [`recipients.${i}.reason`]: success ? "" : result?.error || "call failed",
            [`recipients.${i}.processedAt`]: new Date(),
          },
          $inc: {
            [`counts.${success ? "dispatched" : "failed"}`]: 1,
            "counts.processed": 1,
          },
        }
      );

      if (i < callRun.recipients.length - 1) await delay(DELAY_BETWEEN_CONTACTS_MS);
    }

    await OutboundCallRun.updateOne({ _id: callRunId, status: "running" }, { $set: { status: "completed", finishedAt: new Date() } });
  } catch (err) {
    await OutboundCallRun.updateOne({ _id: callRunId }, { $set: { status: "failed", error: err.message || String(err), finishedAt: new Date() } });
  }
};

/** GET /call/campaigns/:id — same lightweight/?all=true split as Outbound's GET /campaigns/:id. */
const getCallRun = async (id, { all } = {}) => {
  const doc = await OutboundCallRun.findById(id).lean();
  if (!doc) return null;

  if (doc.status === "running") {
    const updatedAt = new Date(doc.updatedAt || 0).getTime();
    if (Date.now() - updatedAt > STALE_MS) {
      await OutboundCallRun.updateOne({ _id: id, status: "running" }, { $set: { status: "interrupted" } });
      doc.status = "interrupted";
    }
  }

  if (all) return doc;
  return { ...doc, recipients: (doc.recipients || []).slice(-50) };
};

/** GET /call/campaigns?propertyId?&page=&limit= — history list, newest first, without recipients. */
const listCallRuns = async ({ propertyId }, page = 1, limit = 20) => {
  const query = {};
  if (propertyId) query["property.id"] = propertyId;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Math.min(100, Number(limit) || 20));

  const [callRuns, total] = await Promise.all([
    OutboundCallRun.find(query)
      .select("-recipients")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    OutboundCallRun.countDocuments(query),
  ]);

  return { callRuns, pagination: { page: pageNum, pages: Math.max(1, Math.ceil(total / limitNum)), total } };
};

module.exports = { prepareCallDispatch, runCallDispatch, getCallRun, listCallRuns };
