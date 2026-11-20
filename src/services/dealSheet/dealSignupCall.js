// services/dealSheet/dealSignupCall.js
//
// Maya's sign-up call for /deal leads moves from "new lead" to "phone verified" (Prajwal, 21 Nov 2026):
//   - consent box ticked + number confirmed  → the call goes straight away, at any hour (as today)
//   - consent box ticked, not confirmed 30 minutes after sign-up → ONE call anyway, only 9 AM–8 PM in the deal's
//     time zone, flagged phone_unverified (signupCallUnverified)
//   - no consent box → no call
// Either way the call is placed once (signupCallAt is claimed atomically). After it, the normal daily follow-ups
// run as for every property lead (propertyCallScheduler).
const cron = require("node-cron");
const { DateTime } = require("luxon");
const PropertyLead = require("../../model/leads/propertyLeadModel");
const productModel = require("../../model/property/productModel");
const { scheduleSignupCall } = require("../calling/propertyCallScheduler");
const { resolvePropertyTimezone } = require("../../utils/resolveTimezone");
const { UNVERIFIED_CALL_AFTER_MS, UNVERIFIED_CALL_HOURS, UNVERIFIED_CALL_MAX_AGE_MS } = require("../../config/dealSheet");

/**
 * Claim and place the sign-up call. Returns true when this call placed it.
 * @param {string} leadId
 * @param {object} [o]
 * @param {boolean} [o.unverified]  the 30-minute call to an unconfirmed number
 */
async function placeDealSignupCall(leadId, { unverified = false } = {}) {
  const lead = await PropertyLead.findOneAndUpdate(
    {
      _id: leadId,
      form: "deal",
      consent: true,
      signupCallAt: null,
      duplicateOf: null,
      callingStopped: { $ne: true },
      isQaTest: { $ne: true },
    },
    { $set: { signupCallAt: new Date(), signupCallUnverified: unverified } },
    { new: true }
  ).lean();
  if (!lead) return false;

  console.log(`[deal-call] ${unverified ? "unverified (30 min)" : "verified"} sign-up call for lead ${lead._id} (${lead.propertySlug}, ${lead.timeline || "no timeline"})`);
  scheduleSignupCall({
    leadId: lead._id,
    propertySlug: lead.propertySlug,
    fullName: lead.fullName,
    phone: lead.phone,
    phoneNormalized: lead.phoneNormalized,
    timezone: lead.timezone,
    email: lead.email,
    buyerType: lead.buyerType,
    quotePrice: lead.quotePrice,
    needsFinancing: lead.needsFinancing,
    downPayment: lead.downPayment,
    loanType: lead.loanType,
    loanTypeOther: lead.loanTypeOther,
    preApproved: lead.preApproved,
    timeline: lead.timeline,
  }).catch((e) => console.error(`[deal-call] scheduling failed for lead ${lead._id}:`, e.message));
  return true;
}

/** 9 AM–8 PM in the zone? */
function withinHours(zone, now = new Date()) {
  const hour = DateTime.fromJSDate(now, { zone }).hour;
  return hour >= UNVERIFIED_CALL_HOURS.start && hour < UNVERIFIED_CALL_HOURS.end;
}

let sweeping = false;
const zoneBySlug = new Map();

/** Every minute: consenting /deal leads still unconfirmed 30 minutes after sign-up get their one call. */
async function sweepUnverifiedCalls() {
  if (sweeping) return;
  sweeping = true;
  try {
    const now = Date.now();
    const due = await PropertyLead.find({
      form: "deal",
      consent: true,
      signupCallAt: null,
      phoneVerifiedAt: null,
      duplicateOf: null,
      callingStopped: { $ne: true },
      isQaTest: { $ne: true },
      createdAt: { $lte: new Date(now - UNVERIFIED_CALL_AFTER_MS), $gte: new Date(now - UNVERIFIED_CALL_MAX_AGE_MS) },
    })
      .select("_id propertySlug")
      .limit(100)
      .lean();

    for (const lead of due) {
      let zone = zoneBySlug.get(lead.propertySlug);
      if (!zone) {
        const product = await productModel.findOne({ slug: lead.propertySlug }).select("state zipCode").lean();
        zone = resolvePropertyTimezone(product || {});
        zoneBySlug.set(lead.propertySlug, zone);
      }
      if (!withinHours(zone)) continue; // picked up again at 9 AM
      await placeDealSignupCall(lead._id, { unverified: true });
    }
  } catch (e) {
    console.error("[deal-call] unverified sweep error:", e.message);
  } finally {
    sweeping = false;
  }
}

let task = null;
function startDealCallSweep() {
  if (task) return task;
  task = cron.schedule("* * * * *", sweepUnverifiedCalls);
  console.log("[deal-call] sweep started — /deal leads with consent but no confirmed number get one call 30 min after sign-up, 9 AM–8 PM deal time.");
  return task;
}

module.exports = { placeDealSignupCall, sweepUnverifiedCalls, startDealCallSweep, withinHours };
