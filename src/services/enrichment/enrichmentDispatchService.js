// services/enrichment/enrichmentDispatchService.js
//
// Hands sendable rows off to Outbound's existing SMS/Email pipeline
// (enrich.md §7.3). Calling is Phase 5 — "call" is not a supported channel
// here yet.
//
// No edits to outboundContactsService.js, outboundCampaignService.js, or
// the outbound controller — only the two additive changes described in
// enrich.md §5.2 (outboundCampaignModel's source enum/enrichmentListId/
// recipient vars, outboundEmailService's ENRICHED_EMAIL_VARIABLES /
// buildRecipientVars).
//
// Split into prepare (validates everything, creates the Outbound
// campaign(s) — no network send yet) and run (calls startCampaign, the
// part that actually dials out) so the controller can respond as soon as
// prepare finishes and run fire-and-forget, the same shape as
// createList/startEnrichment.

const Papa = require("papaparse");
const Product = require("../../model/property/productModel");
const EnrichmentList = require("../../model/enrichment/enrichmentListModel");
const EnrichmentListRow = require("../../model/enrichment/enrichmentListRowModel");
const EnrichedPerson = require("../../model/enrichment/enrichedPersonModel");
const Errorhandler = require("../../utils/errorhandler");
const { effectiveContact } = require("./enrichmentContactsService");
const { CHANNEL_REQUIREMENTS } = require("./enrichmentListService");
const outboundContactsService = require("../../services/outbound/outboundContactsService");
const outboundCampaignService = require("../../services/outbound/outboundCampaignService");

const SUPPORTED_CHANNELS = ["sms", "email"]; // "call" is Phase 5

/** Every non-excluded row in a list, with effective values computed. */
const allRowsWithEffective = async (listId) => {
  const rows = await EnrichmentListRow.find({ listId, excluded: false }).lean();
  const personIds = [...new Set(rows.map((r) => r.enrichment?.personId).filter(Boolean))];
  const people = personIds.length
    ? await EnrichedPerson.find({ _id: { $in: personIds } }).lean()
    : [];
  const peopleById = new Map(people.map((p) => [String(p._id), p]));
  return rows.map((row) => {
    const person = row.enrichment?.personId ? peopleById.get(String(row.enrichment.personId)) : null;
    return { row, effective: effectiveContact(row, person) };
  });
};

/** Non-excluded rows that qualify for a channel (enrich.md §7.1). */
const sendableRows = async (listId, channel) => {
  const check = CHANNEL_REQUIREMENTS[channel];
  if (!check) throw new Errorhandler(`Unsupported channel: ${channel}`, 400);
  const all = await allRowsWithEffective(listId);
  return all.filter((r) => check(r.effective));
};

const toOutboundCsvRow = ({ effective }) => ({
  "full name": effective.fullName || "",
  phones: (effective.phones || []).join("|"),
  emails: (effective.emails || []).join("|"),
});

/**
 * POST /lists/:id/dispatch/preview — sends nothing. For each requested
 * channel: how many non-excluded rows qualify, plus the setup checks the
 * send panel's "Check" button shows.
 */
const dispatchPreview = async (listId, { channels, propertyId }) => {
  const list = await EnrichmentList.findById(listId).lean();
  if (!list) throw new Errorhandler("List not found", 404);

  const property = propertyId ? await Product.findById(propertyId).lean() : null;
  if (propertyId && !property) throw new Errorhandler("Property not found", 404);

  const result = {};
  for (const channel of channels || []) {
    if (!SUPPORTED_CHANNELS.includes(channel)) {
      result[channel] = { supported: false, ready: 0, reason: "Not available yet" };
      continue;
    }
    const rows = await sendableRows(listId, channel);
    const entry = { supported: true, ready: rows.length };
    if (channel === "sms") {
      entry.setup = {
        propertyPicked: Boolean(property),
        listConfigured: property
          ? Number.isInteger(Number(property.brevoOutboundSmsListId)) && Number(property.brevoOutboundSmsListId) > 0
          : null,
      };
    }
    if (channel === "email") {
      entry.setup = {
        propertyPicked: Boolean(property),
        emailConfigured: Boolean(process.env.EMAIL_USERNAME && process.env.EMAIL_PASSWORD),
      };
    }
    result[channel] = entry;
  }
  return result;
};

/**
 * Fast: validates every requested channel first (property, max contacts,
 * per-channel setup, at least one sendable row), building each Outbound
 * campaign document if everything passes. Throws with every problem listed
 * if any channel fails — nothing is created (enrich.md §6, §7.5). Does NOT
 * call startCampaign — see runDispatch.
 */
const prepareDispatch = async (listId, { channels, propertyId, maxContacts, sms, email }, user) => {
  const list = await EnrichmentList.findById(listId);
  if (!list) throw new Errorhandler("List not found", 404);

  const property = await Product.findById(propertyId);
  if (!property) throw new Errorhandler("Property not found", 404);

  const validatedMax = outboundContactsService.validateMaxContacts(maxContacts);

  const requested = [...new Set(channels || [])];
  if (requested.length === 0) throw new Errorhandler("Pick at least one channel", 400);

  const errors = [];
  const perChannelRows = {};

  for (const channel of requested) {
    if (!SUPPORTED_CHANNELS.includes(channel)) {
      errors.push(`${channel}: not available yet`);
      continue;
    }
    if (channel === "sms") {
      if (sms?.consentAttested !== true) {
        errors.push("SMS: these contacts must be confirmed as having given consent to receive texts");
      }
      if (outboundCampaignService.resolveOutboundSmsListId(property) === null) {
        errors.push(`SMS: ${property.productName || "this property"} is not set up for outbound SMS yet`);
      }
    }
    if (channel === "email") {
      if (!email?.subject || !String(email.subject).trim()) errors.push("Email: subject is required");
      if (!email?.body || !String(email.body).trim()) errors.push("Email: body is required");
    }

    const rows = await sendableRows(listId, channel);
    if (rows.length === 0) errors.push(`${channel}: no sendable rows (every row is excluded or missing what this channel needs)`);
    perChannelRows[channel] = rows;
  }

  if (errors.length > 0) {
    const err = new Errorhandler(errors.join("; "), 400);
    err.details = errors;
    throw err;
  }

  const created = {};

  for (const channel of requested) {
    const rows = perChannelRows[channel];
    const csvData = Papa.unparse(rows.map(toOutboundCsvRow));
    const { contacts, skipped, total, overLimit } = outboundContactsService.parseContacts({
      channel,
      csvData,
      maxContacts: validatedMax,
    });

    if (overLimit) {
      throw new Errorhandler(`${channel}: ${total} contacts ready is over your limit of ${validatedMax}`, 400);
    }
    if (total === 0) {
      throw new Errorhandler(`${channel}: no valid contacts to send to`, 400);
    }

    const campaignPayload = {
      channel,
      source: "enrichment",
      csvFileName: list.name || "",
      maxContacts: validatedMax,
      property,
      createdBy: user,
      contacts,
      parseSkipped: skipped,
    };
    if (channel === "sms") {
      campaignPayload.sms = {
        listId: outboundCampaignService.resolveOutboundSmsListId(property),
        consentAttested: true,
      };
    }
    if (channel === "email") {
      campaignPayload.email = {
        subject: email.subject,
        body: email.body,
        bodyFormat: email.bodyFormat === "html" ? "html" : "text",
      };
    }

    const campaign = await outboundCampaignService.createCampaign(campaignPayload);
    campaign.enrichmentListId = listId;

    if (channel === "email") {
      // Outbound dedupes email campaigns by email, so email is a safe key
      // to match recipients back to the enrichment rows they came from.
      const rowByEmail = new Map(rows.map(({ row, effective }) => [effective.email, { row, effective }]));
      campaign.recipients.forEach((recipient) => {
        const match = rowByEmail.get(recipient.email);
        if (match) recipient.vars = { company: match.effective.company || "" };
      });
    }
    await campaign.save();

    await EnrichmentList.updateOne(
      { _id: listId },
      {
        $push: {
          dispatches: {
            channel,
            refId: campaign._id,
            propertyId: property._id,
            propertyName: property.productName || "",
            rowCount: rows.length,
            createdBy: { id: user?._id, email: user?.email || "", name: user?.name || "" },
            createdAt: new Date(),
          },
        },
      }
    );
    await EnrichmentListRow.updateMany(
      { _id: { $in: rows.map((r) => r.row._id) } },
      { $set: { [`lastSent.${channel}`]: { at: new Date(), refId: campaign._id, status: "pending" } } }
    );

    created[channel] = { campaignId: campaign._id };
  }

  return created;
};

/** Slow: the part that actually sends. Called fire-and-forget after prepareDispatch and the HTTP response. */
const runDispatch = async (created) => {
  await Promise.all(
    Object.values(created).map(({ campaignId }) =>
      outboundCampaignService.startCampaign(campaignId).catch((err) => {
        console.error(`[enrichment] dispatch campaign ${campaignId} failed to start:`, err.message);
      })
    )
  );
};

module.exports = {
  sendableRows,
  dispatchPreview,
  prepareDispatch,
  runDispatch,
};
