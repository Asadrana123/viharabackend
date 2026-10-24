// scripts/regradeCalls.js
//
// One-off, run by hand after the call-grading fix (2026-10-24).
//
// 1. Regrades CallLog rows from --since on with callGradeService (Claude for
//    calls where someone spoke, rules for the rest) and prints old → new.
// 2. Lists leads stuck at callStatus "connected" whose calls never reached a
//    person (voicemail read as a pickup, or the prompt's "scheduleCallback"
//    mistaken for a booked callback). With --reopen they go back into the
//    daily follow-up loop (noAnswerUpdate: next day's slot, or "not-reached"
//    if their 7-day window is over) — the live server's sweep then calls them.
//
// Nothing is written without --write.
//   node src/scripts/regradeCalls.js --since=2026-10-01            # dry run
//   node src/scripts/regradeCalls.js --since=2026-10-01 --write    # save grades
//   node src/scripts/regradeCalls.js --since=2026-10-01 --write --reopen
//   add --rules-only to skip Claude (free, less accurate)

require("dotenv").config();
const mongoose = require("mongoose");
const CallLog = require("../model/calling/callLogModel");
const { gradeCall, gradeByRules } = require("../services/calling/callGradeService");
const { mapCallLog, normalisePhone, PICKUP_OUTCOMES } = require("../services/calling/vapiCallsService");
const { noAnswerUpdate } = require("../services/calling/followUpCadence");
const { MODEL_BY_TYPE } = require("../services/leads/leadModelsByType");

const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || "").split("=")[1];
const WRITE = process.argv.includes("--write");
const REOPEN = process.argv.includes("--reopen");
const RULES_ONLY = process.argv.includes("--rules-only");
const SINCE = new Date(arg("since") || Date.now() - 30 * 864e5);
const DEFAULT_TZ = "America/New_York";

(async () => {
  await mongoose.connect(process.env.DB_URI, { serverSelectionTimeoutMS: 10000 });
  console.log(`Regrading calls since ${SINCE.toISOString().slice(0, 10)}${WRITE ? "" : " (dry run)"}`);

  // ── 1. Regrade ────────────────────────────────────────────────────────────
  const rows = await CallLog.find({ createdAt: { $gte: SINCE } }).sort({ createdAt: 1 }).lean();
  const counts = {};
  for (const row of rows) {
    const before = mapCallLog(row);
    const input = { transcript: row.transcript, endedReason: row.endedReason, durationSecs: row.durationSeconds };
    const grade = RULES_ONLY ? gradeByRules(input) : await gradeCall(input);
    const key = `${before.outcome} → ${grade.outcome}`;
    counts[key] = (counts[key] || 0) + 1;
    if (before.outcome !== grade.outcome || before.score !== grade.score) {
      console.log(`${row.fullName || row.phone} | ${before.outcome} ${before.score} → ${grade.outcome} ${grade.score} (${grade.by}) ${grade.reason || ""}`);
    }
    if (WRITE) await CallLog.updateOne({ _id: row._id }, { $set: { grade } });
  }
  console.log(`\n${rows.length} calls:`);
  for (const [k, n] of Object.entries(counts)) console.log(`  ${k}: ${n}`);

  // ── 2. Leads wrongly marked connected ────────────────────────────────────
  // Uses the stored grades, so run with --write first (or together).
  console.log("\nLeads marked connected with no real pickup:");
  let found = 0;
  for (const [type, Model] of Object.entries(MODEL_BY_TYPE)) {
    const leads = await Model.find({
      callStatus: "connected",
      callingStopped: { $ne: true },
      updatedAt: { $gte: SINCE },
    }).lean();
    for (const lead of leads) {
      const phone = normalisePhone(lead.phoneNormalized || lead.phone);
      if (!phone) continue;
      const calls = await CallLog.find({ phone }).lean();
      if (calls.length === 0) continue; // never called through Maya — leave it
      if (calls.some((c) => PICKUP_OUTCOMES.has(mapCallLog(c).outcome))) continue;
      found += 1;
      const update = noAnswerUpdate(lead, DEFAULT_TZ);
      console.log(`  [${type}] ${lead.fullName || phone} → ${update.callStatus}${update.nextCallAt ? ` at ${update.nextCallAt.toISOString()}` : ""}`);
      if (WRITE && REOPEN) await Model.updateOne({ _id: lead._id, callStatus: "connected" }, { $set: update });
    }
  }
  console.log(`${found} lead(s)${WRITE && REOPEN ? " reopened" : " — pass --write --reopen to put them back in the loop"}`);

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
