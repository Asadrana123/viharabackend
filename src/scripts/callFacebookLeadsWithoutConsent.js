// scripts/callFacebookLeadsWithoutConsent.js
//
// One-off, run by hand: an admin decided (2026-10-26) that every Facebook form
// lead gets Maya's calls, with or without the form's call consent. New leads
// get that in facebookFormLeadService; this puts the existing never-called
// ones into the call loop.
//
// No one is dialed by this script. Each lead is recorded as admin-override
// consent and handed to the live server's daily sweep, starting at tomorrow's
// 11:00 AM in the lead's time zone (Eastern when unknown), then one call a day
// for 7 days. So calls only go out in calling hours, and only from the server.
//
//   node src/scripts/callFacebookLeadsWithoutConsent.js --dry   # list only
//   node src/scripts/callFacebookLeadsWithoutConsent.js

require("dotenv").config();
const mongoose = require("mongoose");
const FacebookFormLead = require("../model/leads/facebookFormLeadModel");
const { adminOverrideConsent, isTestLead } = require("../services/leads/facebookFormLeadService");
const { nextFollowUpAt } = require("../services/calling/followUpCadence");

const DRY = process.argv.includes("--dry");

(async () => {
  await mongoose.connect(process.env.DB_URI, { serverSelectionTimeoutMS: 10000 });

  const candidates = await FacebookFormLead.find({
    consent: { $ne: true },
    callingStopped: { $ne: true },
    callAttempts: { $in: [0, null] },
    phoneNormalized: { $nin: ["", null] },
  }).lean();

  // Facebook's form-testing tool leads ("<test lead: dummy data ...>").
  const leads = candidates.filter(
    (l) => !isTestLead({ name: l.fullName, email: l.email, ...Object.fromEntries((l.answers || []).map((a) => [a.key, a.value])) })
  );

  // One loop entry per phone number, so a person with two records isn't called twice a day.
  const seen = new Set();
  const toQueue = leads.filter((l) => !seen.has(l.phoneNormalized) && seen.add(l.phoneNormalized));

  console.log(
    `${candidates.length} never-called leads without consent; ${candidates.length - leads.length} test leads skipped; ` +
    `${leads.length - toQueue.length} duplicate numbers skipped; ${toQueue.length} to queue${DRY ? " (dry run)" : ""}`
  );
  for (const l of toQueue) console.log(`  ${l.phoneNormalized}  ${l.fullName || l.firstName || ""}  [${l.formName || l.formId}]`);
  if (DRY) {
    await mongoose.disconnect();
    process.exit(0);
  }

  const now = new Date();
  let queued = 0;
  for (const lead of toQueue) {
    const start = { ...lead, followUpStartedAt: now };
    const res = await FacebookFormLead.updateOne(
      { _id: lead._id, consent: { $ne: true }, callAttempts: { $in: [0, null] } },
      {
        $set: {
          ...adminOverrideConsent(now, lead.formName),
          followUpStartedAt: now,
          callStatus: "no-answer",
          nextCallAt: nextFollowUpAt(start, undefined, now),
        },
      }
    );
    queued += res.modifiedCount;
  }

  console.log(`Done: ${queued} leads queued for the daily call sweep.`);
  await mongoose.disconnect();
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
