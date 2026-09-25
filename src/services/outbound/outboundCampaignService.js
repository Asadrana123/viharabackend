// services/outbound/outboundCampaignService.js
//
// Campaign lifecycle for both outbound channels (SMS and Email): create,
// start (kicks off the channel-specific runner after the HTTP response has
// already gone out, same shape as the calling campaigns), record per-
// recipient progress, finish, and read back (list + detail, with the
// recent-N-by-default / full-list-on-request split described in
// outboundplan.md §6/§7).
//
// The SMS/Email runners are required lazily (inside startCampaign) rather
// than at the top of this file, so this module has no load-time dependency
// on them — avoids a circular require (they both call back into this file
// for markRecipient/finishCampaign) and keeps this file loadable on its own
// during earlier build phases.

const OutboundCampaign = require("../../model/outbound/outboundCampaignModel");
const { MAX_CONTACTS_CEILING } = require("./outboundContactsService");

// A "running" campaign whose updatedAt hasn't moved in this long is treated
// as abandoned (e.g. a Render restart mid-run, with no resume/startup hook)
// and flipped to "interrupted" lazily on the next read. updatedAt moves on
// every recipient processed, so a long-but-healthy run is never flagged.
const STALE_MS = 10 * 60 * 1000;

/** Returns property.brevoOutboundSmsListId if it's a positive integer, else null. No env fallback — see outboundplan.md §4. */
const resolveOutboundSmsListId = (property) => {
  const n = Number(property?.brevoOutboundSmsListId);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const applyStaleCheck = async (doc) => {
  if (!doc || doc.status !== "running") return doc;
  const updatedAt = new Date(doc.updatedAt || 0).getTime();
  if (Date.now() - updatedAt > STALE_MS) {
    await OutboundCampaign.updateOne(
      { _id: doc._id, status: "running" },
      { $set: { status: "interrupted", finishedAt: doc.finishedAt || new Date() } }
    );
    doc.status = "interrupted";
  }
  return doc;
};

/**
 * Creates a campaign document with all recipients in "pending" status.
 * Does not start it — call startCampaign separately (the controller calls
 * this, responds 202, then calls startCampaign without awaiting it).
 */
const createCampaign = async ({
  channel,
  source,
  csvFileName,
  maxContacts,
  property,
  createdBy,
  contacts,
  parseSkipped,
  sms,
  email,
}) => {
  const doc = new OutboundCampaign({
    channel,
    source,
    csvFileName: csvFileName || "",
    maxContacts,
    property: {
      id: property._id,
      name: property.productName || "",
      slug: property.slug || "",
      address: [property.street, property.city, property.state].filter(Boolean).join(", "),
    },
    createdBy: {
      id: createdBy?._id,
      email: createdBy?.email || "",
      name: createdBy?.name || "",
    },
    counts: { total: contacts.length, processed: 0, succeeded: 0, skipped: 0, failed: 0 },
    parseSkipped: parseSkipped || [],
    recipients: contacts.map((c) => ({
      name: c.name || "",
      email: c.email || "",
      phone: c.phone || "",
      status: "pending",
    })),
  });

  if (channel === "sms") {
    doc.sms = { listId: sms.listId, consentAttested: sms.consentAttested === true };
  } else {
    doc.email = {
      subject: email?.subject || "",
      body: email?.body || "",
      bodyFormat: email?.bodyFormat === "html" ? "html" : "text",
    };
  }

  await doc.save();
  return doc;
};

/** Marks the campaign running and hands off to the channel-specific runner. Catches a thrown/rejected runner and finishes the campaign as "failed" rather than leaving it stuck on "running". */
const startCampaign = async (id) => {
  const campaign = await OutboundCampaign.findById(id);
  if (!campaign) return;

  campaign.status = "running";
  campaign.startedAt = new Date();
  await campaign.save();

  try {
    if (campaign.channel === "sms") {
      const { runSmsCampaign } = require("./outboundSmsService");
      await runSmsCampaign(id);
    } else {
      const { runEmailCampaign } = require("./outboundEmailService");
      await runEmailCampaign(id);
    }
  } catch (err) {
    await finishCampaign(id, "failed", err?.message || String(err));
  }
};

/**
 * One atomic update for a single recipient: sets its fields plus
 * processedAt, and increments the matching counter. `patch.status` must be
 * one of "succeeded" | "failed" (v1 runners don't use "skipped" — see the
 * model's `counts.skipped` comment).
 */
const markRecipient = async (id, index, patch) => {
  const setOps = { [`recipients.${index}.processedAt`]: new Date() };
  Object.entries(patch || {}).forEach(([k, v]) => {
    setOps[`recipients.${index}.${k}`] = v;
  });

  const incOps = { "counts.processed": 1 };
  if (patch?.status === "succeeded") incOps["counts.succeeded"] = 1;
  else if (patch?.status === "failed") incOps["counts.failed"] = 1;
  else if (patch?.status === "skipped") incOps["counts.skipped"] = 1;

  await OutboundCampaign.updateOne({ _id: id }, { $set: setOps, $inc: incOps });
};

const finishCampaign = async (id, status, error) => {
  const update = { status, finishedAt: new Date() };
  if (error) update.error = String(error);
  await OutboundCampaign.updateOne({ _id: id }, { $set: update });
};

/**
 * Lightweight by default: the campaign fields, counters, and only the last
 * `recent` recipients (default 50, capped at the shared ceiling) — what the
 * progress view polls with. Pass `all: true` for the full recipient list
 * (the "View all recipients" action and the History detail view) — never
 * used for live polling.
 */
const getCampaign = async (id, { recent, all } = {}) => {
  const doc = await OutboundCampaign.findById(id).lean();
  if (!doc) return null;
  await applyStaleCheck(doc);

  if (all) return doc;

  const n = Math.min(Math.max(Number(recent) || 50, 1), MAX_CONTACTS_CEILING);
  return { ...doc, recipients: (doc.recipients || []).slice(-n) };
};

/** History list — newest first, without recipients or the email body (kept small). */
const listCampaigns = async ({ channel, propertyId } = {}, page = 1, limit = 20) => {
  const query = {};
  if (channel) query.channel = channel;
  if (propertyId) query["property.id"] = propertyId;

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  const [docs, total] = await Promise.all([
    OutboundCampaign.find(query)
      .select("-recipients -email.body")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    OutboundCampaign.countDocuments(query),
  ]);

  await Promise.all(docs.filter((d) => d.status === "running").map(applyStaleCheck));

  return {
    campaigns: docs,
    pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) },
  };
};

module.exports = {
  resolveOutboundSmsListId,
  createCampaign,
  startCampaign,
  markRecipient,
  finishCampaign,
  getCampaign,
  listCampaigns,
};
