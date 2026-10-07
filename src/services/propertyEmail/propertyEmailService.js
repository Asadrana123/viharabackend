// services/propertyEmail/propertyEmailService.js
//
// Phase 1 of the backend property email sequence (property email spec):
// the INSTANT emails that send the moment someone acts.
//
//   Landing-page form submitted  → lead record (property_lead)            → E1  (198)
//   Signed up to bid             → lead record registered, pending        → R1  (210)
//                                  + Slack alert, + PT1 (208) to the referring realtor
//   Team approves a registrant   → verificationStatus approved           → R2  (211)
//   Team rejects a registrant    → lead record closed, no email
//   Hard bounce / spam / unsub   → every lead record for that contact closed
//
// Every send goes through sendPropertyEmail, which enforces the spec's rules:
//   • never resend: the send log row is reserved before the Brevo call
//   • blocklist check before every send (transactional sends skip it otherwise)
//   • tags property:<PROPERTY_ID> + template code, UTM on LISTING_URL
//
// OFF unless BOTH switches are on, so Big Bear (interim setup) is untouched:
//   PROPERTY_EMAILS_ENABLED=true          (env, global kill switch)
//   property.emailSequenceEnabled = true  (per property, Manage Listings)
// When on for a property, these emails REPLACE the old nodemailer
// registration emails and the realtor new-lead email for that property.
//
// All exported trigger functions are non-throwing: callers fire-and-forget.
const PropertyEmailLead = require("../../model/email/propertyEmailLeadModel");
const EmailSendLog = require("../../model/email/emailSendLogModel");
const Unsubscribe = require("../../model/integrations/unsubscribeModel");
const { PROPERTY_EMAIL_TEMPLATES } = require("../../config/propertyEmailTemplates");
const { getContactBlockStatus, sendTransactionalEmail } = require("../integrations/brevoService");
const { notifyNewLead } = require("../shared/slackService");
const { buildPropertyEmailParams, firstNameOf, propertyKeyOf } = require("./propertyEmailParams");

const normEmail = (e) => String(e || "").trim().toLowerCase();

const globalOn = () => String(process.env.PROPERTY_EMAILS_ENABLED || "").toLowerCase() === "true";

/** Is the backend sequence live for this property? */
const isSequenceOn = (property) => globalOn() && property?.emailSequenceEnabled === true;

// ── Send log reservation ────────────────────────────────────────────────────

// Claim the right to send. Returns the reserved row, or null when this email
// was already sent (or is being sent right now). A "failed" row can be
// claimed again, so a Brevo outage doesn't block the email forever.
async function reserve(doc) {
  try {
    return await EmailSendLog.create({ ...doc, status: "sending" });
  } catch (err) {
    if (err?.code !== 11000) throw err;
    return EmailSendLog.findOneAndUpdate(
      { dedupKey: doc.dedupKey, status: "failed" },
      { $set: { status: "sending", error: "" } },
      { new: true }
    );
  }
}

async function isBlocked(email) {
  const local = await Unsubscribe.exists({ email: { $in: [email, email.toLowerCase()] } });
  if (local) return true;
  const { blocked } = await getContactBlockStatus(email);
  return blocked;
}

/**
 * Send one sequence email. Never throws.
 * @param {object} p
 * @param {string} p.code       template code (E1, R1, R2, PT1, ...)
 * @param {object} p.property   productModel doc
 * @param {string} p.to         recipient email
 * @param {string} [p.name]     recipient full name
 * @param {object} [p.extra]    per-recipient params (FIRSTNAME, QUOTE_AMOUNT, ...)
 * @param {string} [p.dedupKey] defaults to "<to>|<propertyId>|<code>"
 * @param {object} [p.lead]     PropertyEmailLead to stamp lastEmailAt on
 * @returns {Promise<{ sent: boolean, skipped?: string, error?: string, messageId?: string }>}
 */
async function sendPropertyEmail({ code, property, to, name, extra = {}, dedupKey, lead }) {
  const email = normEmail(to);
  const templateId = PROPERTY_EMAIL_TEMPLATES[code];
  const tag = `[property-email:${code}] ${email} / ${propertyKeyOf(property)}`;
  if (!email) return { sent: false, skipped: "no recipient" };
  if (!templateId) return { sent: false, skipped: "template not built" };

  let row;
  try {
    row = await reserve({
      dedupKey: dedupKey || `${email}|${property._id}|${code}`,
      contactEmail: email,
      propertyId: property._id,
      templateCode: code,
      templateId,
    });
  } catch (err) {
    console.error(`${tag} send log reservation failed:`, err.message);
    return { sent: false, error: err.message };
  }
  if (!row) return { sent: false, skipped: "already sent" };

  const fail = async (error) => {
    await EmailSendLog.updateOne({ _id: row._id }, { $set: { status: "failed", error } }).catch(() => {});
    console.error(`${tag} not sent: ${error}`);
    return { sent: false, error };
  };

  try {
    if (await isBlocked(email)) {
      // Not a failure: release the reservation and stop the sequence for them.
      await EmailSendLog.deleteOne({ _id: row._id });
      if (code !== "PT1") await closeLeadsForContact(email, "blocklisted");
      console.log(`${tag} skipped: contact is blocklisted`);
      return { sent: false, skipped: "blocklisted" };
    }
  } catch (err) {
    return fail(`blocklist check failed: ${err.message}`);
  }

  let params;
  try {
    params = buildPropertyEmailParams(code, property, extra);
  } catch (err) {
    return fail(err.message);
  }

  const result = await sendTransactionalEmail({
    templateId,
    email,
    name,
    params,
    tags: [`property:${propertyKeyOf(property)}`, code],
  });
  if (!result.success) return fail(result.error || "Brevo send failed");

  const sentAt = new Date();
  await EmailSendLog.updateOne(
    { _id: row._id },
    { $set: { status: "sent", sentAt, brevoMessageId: result.messageId || "" } }
  );
  if (lead?._id) await PropertyEmailLead.updateOne({ _id: lead._id }, { $set: { lastEmailAt: sentAt } });
  console.log(`✅ ${tag} sent (template ${templateId}, messageId ${result.messageId || "?"})`);
  return { sent: true, messageId: result.messageId };
}

// ── Lead records ────────────────────────────────────────────────────────────

/**
 * Create or merge the lead record for (email, property). A merge keeps the
 * earliest source and partner; `set` fields are applied either way.
 */
async function upsertLeadRecord({ email, propertyId, fullName, source, partnerId = null, set = {} }) {
  const filter = { contactEmail: normEmail(email), propertyId };
  const update = {
    $setOnInsert: { source, partnerId },
    $set: { ...(fullName ? { fullName } : {}), ...set },
  };
  const opts = { upsert: true, new: true, setDefaultsOnInsert: true };
  try {
    return await PropertyEmailLead.findOneAndUpdate(filter, update, opts);
  } catch (err) {
    // Two signups at once both tried to insert; the loser just merges.
    if (err?.code !== 11000) throw err;
    return PropertyEmailLead.findOneAndUpdate(filter, update, { new: true });
  }
}

/** Close every open lead record for a contact (bounce, spam, unsubscribe, blocklist). */
async function closeLeadsForContact(email, reason) {
  const { modifiedCount } = await PropertyEmailLead.updateMany(
    { contactEmail: normEmail(email), status: "open" },
    { $set: { status: "closed", closedAt: new Date(), closedReason: reason } }
  );
  if (modifiedCount) console.log(`[property-email] closed ${modifiedCount} lead record(s) for ${normEmail(email)} (${reason})`);
  return modifiedCount;
}

// ── Triggers ────────────────────────────────────────────────────────────────

/**
 * Landing-page form submitted (quote or interest). Sends E1 unless they're
 * already on this property's early-access track (EA1 covered them).
 * @param {object} p.property  productModel doc
 * @param {object} p.lead      propertyLeadModel doc
 */
async function onPropertyLeadSignup({ property, lead }) {
  if (!isSequenceOn(property)) return;
  try {
    const record = await upsertLeadRecord({
      email: lead.email,
      propertyId: property._id,
      fullName: lead.fullName,
      source: "property_lead",
      set: lead.quotePrice ? { quoteAmount: lead.quotePrice } : {},
    });
    if (record.status === "closed" || record.source === "early_access") return;

    await sendPropertyEmail({
      code: "E1",
      property,
      to: lead.email,
      name: lead.fullName,
      extra: { FIRSTNAME: firstNameOf(lead.fullName), QUOTE_AMOUNT: record.quoteAmount },
      lead: record,
    });
  } catch (err) {
    console.error(`[property-email] E1 trigger failed for ${lead?.email}:`, err.message);
  }
}

/**
 * Signed up to bid. Sends R1 (and R2 if the registration is already approved),
 * posts a Slack alert so the team starts verification, and sends PT1 to the
 * referring realtor when this registration was newly attributed to one.
 * @param {object} p.property      productModel doc
 * @param {object} p.registration  AuctionRegistration doc
 * @param {object} [p.realtor]     realtor doc — pass only when NEWLY attributed
 */
async function onAuctionRegistration({ property, registration, realtor = null }) {
  if (!isSequenceOn(property)) return;
  const fullName = `${registration.firstName || ""} ${registration.lastName || ""}`.trim();
  try {
    const record = await upsertLeadRecord({
      email: registration.email,
      propertyId: property._id,
      fullName,
      source: realtor || registration.realtorId ? "partner_referral" : "property_lead",
      partnerId: registration.realtorId || realtor?._id || null,
      set: {
        registered: true,
        verificationStatus: registration.status,
        ...(registration.status === "approved" ? { status: "open", closedAt: null, closedReason: "" } : {}),
      },
    });

    if (registration.status === "pending") {
      notifyNewLead({
        leadType: "Auction Registration",
        name: fullName,
        email: registration.email,
        phone: registration.mobilePhone,
        source: realtor ? `realtor:${realtor.slug}` : "direct",
        extraFields: [
          { label: "Property", value: [property.street, property.city, property.state].filter(Boolean).join(", ") },
          { label: "Buyer Type", value: registration.buyerType },
          { label: "Action", value: "Verify ID and proof of funds, then approve or reject" },
        ],
      }).catch(() => {});
    }

    if (realtor) await sendPartnerReferralEmail({ property, registration, realtor });

    if (record.status === "closed") return;
    const buyer = { property, to: registration.email, name: fullName, extra: { FIRSTNAME: firstNameOf(fullName) }, lead: record };
    await sendPropertyEmail({ code: "R1", ...buyer });
    if (registration.status === "approved") await sendPropertyEmail({ code: "R2", ...buyer });
  } catch (err) {
    console.error(`[property-email] registration trigger failed for ${registration?.email}:`, err.message);
  }
}

/**
 * PT1 to the realtor whose link the buyer registered through. Once per buyer
 * per property (the dedupKey carries the buyer's email).
 */
async function sendPartnerReferralEmail({ property, registration, realtor }) {
  if (!isSequenceOn(property) || !realtor?.email) return;
  try {
    await sendPropertyEmail({
      code: "PT1",
      property,
      to: realtor.email,
      name: realtor.name,
      extra: { FIRSTNAME: firstNameOf(realtor.name) },
      dedupKey: `${normEmail(realtor.email)}|${property._id}|PT1|${normEmail(registration.email)}`,
    });
  } catch (err) {
    console.error(`[property-email] PT1 failed for ${realtor.email}:`, err.message);
  }
}

/**
 * The team set a registrant's verification status. approved → R2 (and the
 * record reopens if it had been closed by an earlier rejection); rejected →
 * close the record quietly, the team follows up by phone.
 */
async function onVerificationChange({ property, registration, status }) {
  if (!isSequenceOn(property)) return;
  const fullName = `${registration.firstName || ""} ${registration.lastName || ""}`.trim();
  try {
    const set = { registered: true, verificationStatus: status };
    if (status === "approved") Object.assign(set, { status: "open", closedAt: null, closedReason: "" });
    if (status === "rejected") Object.assign(set, { status: "closed", closedAt: new Date(), closedReason: "rejected" });

    const record = await upsertLeadRecord({
      email: registration.email,
      propertyId: property._id,
      fullName,
      source: registration.realtorId ? "partner_referral" : "property_lead",
      partnerId: registration.realtorId || null,
      set,
    });

    if (status === "approved") {
      await sendPropertyEmail({
        code: "R2",
        property,
        to: registration.email,
        name: fullName,
        extra: { FIRSTNAME: firstNameOf(fullName) },
        lead: record,
      });
    }
  } catch (err) {
    console.error(`[property-email] verification trigger failed for ${registration?.email}:`, err.message);
  }
}

// Brevo webhook events that end the sequence for a contact.
const STOP_EVENTS = new Set(["hard_bounce", "spam", "unsubscribed"]);

/** Brevo webhook payload (one event or a batch) → close lead records on stop events. */
async function handleDeliverabilityEvents(body) {
  const items = Array.isArray(body) ? body : [body];
  for (const e of items) {
    const event = String(e?.event || "").toLowerCase();
    if (!STOP_EVENTS.has(event) || !e?.email) continue;
    try {
      await closeLeadsForContact(e.email, event);
    } catch (err) {
      console.error(`[property-email] closing leads after ${event} failed for ${e.email}:`, err.message);
    }
  }
}

module.exports = {
  isSequenceOn,
  sendPropertyEmail,
  onPropertyLeadSignup,
  onAuctionRegistration,
  sendPartnerReferralEmail,
  onVerificationChange,
  handleDeliverabilityEvents,
  closeLeadsForContact,
};
