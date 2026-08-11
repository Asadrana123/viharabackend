// scripts/backfillEarlyAccessCalls.js
//
// ONE-TIME backfill: put EVERY existing early-access lead into the daily 1:32 PM
// callback loop — regardless of whether they were ever called or already picked
// up. (Unlike the VAPI-checked version, this does NOT skip leads that already
// connected: everyone gets re-scheduled.)
//
// What it sets on each eligible lead:
//   callStatus      = "no-answer"
//   phoneNormalized = canonical E.164 of their phone
//   nextCallAt      = next 1:32 PM in their timezone (ET fallback when unknown)
//   timezone        is left as-is (old leads have none -> ET fallback)
//
// Guards:
//   - Only touches untouched leads (callStatus "pending" / missing / null), so it
//     won't disturb leads already in the new signup flow, and it's safe to re-run.
//   - By default SKIPS leads without consent === true (TCPA - never auto-dial a
//     lead who didn't agree). Pass --include-no-consent to override.
//
// Usage:
//   node scripts/backfillEarlyAccessCalls.js --dry                     # preview only
//   node scripts/backfillEarlyAccessCalls.js                           # apply (consented only)
//   node scripts/backfillEarlyAccessCalls.js --include-no-consent      # apply to ALL, incl. no-consent

require("dotenv").config();
const mongoose = require("mongoose");
const EarlyAccessLead = require("../model/earlyAccessLeadModel");
const { normalisePhone } = require("../services/vapiCallsService");
const { nextDailyCallAt } = require("../services/earlyAccessCallScheduler");

const DEFAULT_TZ = "America/New_York"; // fallback for leads with no timezone
const DRY_RUN = process.argv.includes("--dry");
const INCLUDE_NO_CONSENT = process.argv.includes("--include-no-consent");

async function main() {
  if (!process.env.DB_URI) throw new Error("DB_URI is not set");
  await mongoose.connect(process.env.DB_URI, { serverSelectionTimeoutMS: 5000 });
  console.log(
    `[backfill] connected${DRY_RUN ? " (DRY RUN - no writes)" : ""}` +
      `${INCLUDE_NO_CONSENT ? " [including no-consent leads]" : ""}`
  );

  // Only untouched leads: "pending", or old rows that predate the field.
  const leads = await EarlyAccessLead.find({
    $or: [
      { callStatus: "pending" },
      { callStatus: { $exists: false } },
      { callStatus: null },
    ],
  }).lean();
  console.log(`[backfill] ${leads.length} lead(s) to evaluate`);

  const summary = { scheduled: 0, noConsent: 0, skipped: 0 };

  for (const lead of leads) {
    const norm = normalisePhone(lead.phone);
    if (!norm) {
      summary.skipped++;
      console.warn(`[backfill] skip (bad phone): ${lead.email || lead._id}`);
      continue;
    }

    // No consent -> do not schedule (unless explicitly overridden). Still store
    // the normalized phone so the record is complete.
    if (lead.consent !== true && !INCLUDE_NO_CONSENT) {
      summary.noConsent++;
      if (!DRY_RUN) {
        await EarlyAccessLead.updateOne(
          { _id: lead._id },
          { $set: { phoneNormalized: norm } }
        );
      }
      continue;
    }

    // Schedule the daily loop for everyone else - no VAPI outcome check.
    summary.scheduled++;
    const when = nextDailyCallAt(lead.timezone || DEFAULT_TZ);
    if (!DRY_RUN) {
      await EarlyAccessLead.updateOne(
        { _id: lead._id },
        { $set: { callStatus: "no-answer", phoneNormalized: norm, nextCallAt: when } }
      );
    }
  }

  console.log("[backfill] done:", summary);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("[backfill] fatal:", err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
