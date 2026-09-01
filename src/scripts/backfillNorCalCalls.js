// scripts/backfillNorCalCalls.js
//
// ONE-OFF backfill: put NorCal leads that were captured BEFORE the calling
// integration (the old store-only controller) into the same call loop a fresh
// signup gets. For each eligible lead it:
//   1. fills phoneNormalized (canonical E.164) if it's missing,
//   2. runs scheduleNorCalSignupCall — the 2-in-60s burst, then the daily
//      11:00 / 2:30 / 6:00 local callback loop if the lead doesn't pick up.
//
// Mail/Brevo is intentionally NOT touched here (you're handling that).
//
// SAFE TO RE-RUN: it only targets leads that have never been called
// (callStatus "pending" + lastCallAt null), so already-processed leads are
// skipped automatically.
//
// USAGE (run from the backend project root, where your .env lives):
//   node src/scripts/backfillNorCalCalls.js            # call consented leads
//   node src/scripts/backfillNorCalCalls.js --dry      # preview only, places NO calls
//   node src/scripts/backfillNorCalCalls.js --force    # call even leads with consent!=true
//
// Adjust the two require paths below if you place this file somewhere other
// than src/scripts/.

require("dotenv").config();
const mongoose = require("mongoose");

const NorCalLead = require("../model/norCalLeadModel");
const { normalisePhone } = require("../services/vapiCallsService");
const { scheduleNorCalSignupCall } = require("../services/norCalCallScheduler");

const DRY = process.argv.includes("--dry");
const FORCE = process.argv.includes("--force"); // call regardless of stored consent

async function main() {
  if (!process.env.DB_URI) {
    console.error("✖ DB_URI is not set. Run this from the project root where .env lives.");
    process.exit(1);
  }

  await mongoose.connect(process.env.DB_URI, {
    serverSelectionTimeoutMS: 5000,
  });
  console.log(`✔ Mongo connected${DRY ? "  (DRY RUN — no calls will be placed)" : ""}`);

  // Pre-integration leads: never called yet, not admin-stopped.
  const candidates = await NorCalLead.find({
    callStatus: { $in: ["pending", null] },
    lastCallAt: null,
    callingStopped: { $ne: true },
  })
    .sort({ createdAt: 1 })
    .lean();

  console.log(`Found ${candidates.length} lead(s) not yet in the call loop.\n`);

  const scheduled = [];
  let skippedNoPhone = 0;
  let skippedNoConsent = 0;

  for (const lead of candidates) {
    const name = lead.fullName || "(no name)";
    const phoneNormalized = lead.phoneNormalized || normalisePhone(lead.phone);

    if (!phoneNormalized) {
      console.log(`  ⏭  ${name} — invalid/unparseable phone (${lead.phone || "—"}), skipped.`);
      skippedNoPhone += 1;
      continue;
    }

    // Respect consent like a normal signup, unless --force is passed.
    if (lead.consent !== true && !FORCE) {
      console.log(`  ⏭  ${name} — consent not recorded, skipped (use --force to override).`);
      skippedNoConsent += 1;
      continue;
    }

    // Persist phoneNormalized if it was missing, so the daily sweep can dial it later.
    if (!lead.phoneNormalized && !DRY) {
      await NorCalLead.updateOne({ _id: lead._id }, { $set: { phoneNormalized } });
    }

    if (DRY) {
      console.log(`  • WOULD CALL  ${name}  <${phoneNormalized}>  buyerType="${lead.buyerType || ""}"`);
      continue;
    }

    console.log(`  ▶  Enqueuing signup call for ${name}  <${phoneNormalized}>`);
    scheduled.push(
      scheduleNorCalSignupCall({
        leadId: lead._id,
        fullName: lead.fullName,
        email: lead.email,
        phone: lead.phone,
        phoneNormalized,
        timezone: lead.timezone,
        market: lead.market || "Northern California",
        buyerType: lead.buyerType,
      })
        .then(() => ({ name, ok: true }))
        .catch((e) => ({ name, ok: false, err: e.message }))
    );
  }

  if (scheduled.length) {
    console.log(`\nWaiting for ${scheduled.length} burst(s) to complete (each waits ~60s before dialing)…`);
    const results = await Promise.allSettled(scheduled);
    for (const r of results) {
      const v = r.value || {};
      console.log(v.ok ? `  ✔ done: ${v.name}` : `  ✖ failed: ${v.name} — ${v.err}`);
    }
  }

  console.log(
    `\nSummary: ${scheduled.length} enqueued, ${skippedNoConsent} skipped (no consent), ${skippedNoPhone} skipped (bad phone).`
  );

  await mongoose.disconnect();
  console.log("✔ Done. Disconnected.");
  process.exit(0);
}

main().catch(async (e) => {
  console.error("✖ Backfill failed:", e);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
