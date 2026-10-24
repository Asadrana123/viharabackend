// scripts/contactImportedFacebookLeads.js
//
// One-off, run by hand: the leads imported by importFacebookFormLeads.js were
// saved as records only. An admin decided (2026-10-24) to contact them anyway:
// Brevo contact + welcome email + Maya's signup call, then the live server's
// daily sweep makes the follow-up calls for 7 days.
//
// Their form ("Toorak Buyers") had no call/text consent checkbox — only the
// notice "our AI assistant may give you a quick call" — so consent is recorded
// as an admin decision (consentSource "admin-override") with that notice text.
//
// Run only during US calling hours (8 AM – 9 PM in the leads' time zones).
//   node src/scripts/contactImportedFacebookLeads.js --dry   # list only
//   node src/scripts/contactImportedFacebookLeads.js

require("dotenv").config();
const mongoose = require("mongoose");
const FacebookFormLead = require("../model/leads/facebookFormLeadModel");
const { syncToBrevo, sendWelcomeOnce } = require("../services/leads/facebookFormLeadService");
const { scheduleFacebookFormSignupCall } = require("../services/calling/newDealsCallScheduler");

const DRY = process.argv.includes("--dry");
const NOTICE =
  "Tell us where to send your matched deals. We'll email you new property deals and our AI assistant may give you a quick call to help you get started.";

(async () => {
  await mongoose.connect(process.env.DB_URI, { serverSelectionTimeoutMS: 10000 });

  const leads = await FacebookFormLead.find({
    importedFromHistory: true,
    welcomeEmailSentAt: null,
    callingStopped: { $ne: true },
    callAttempts: 0,
  }).lean();
  console.log(`${leads.length} imported leads to contact${DRY ? " (dry run)" : ""}`);
  if (DRY) process.exit(0);

  const now = new Date();
  const results = { brevo: 0, email: 0, callsStarted: 0 };
  const calls = [];

  for (const lead of leads) {
    const consent = {
      consent: true,
      consentSource: "admin-override",
      consentText: `Admin approved contact on 2026-10-24. The form's own notice: "${NOTICE}"`,
      consentVersion: "admin-override-2026-10-24",
      consentTimestamp: now,
    };
    const doc = await FacebookFormLead.findByIdAndUpdate(lead._id, { $set: consent }, { new: true }).lean();

    const brevo = await syncToBrevo(doc);
    if (brevo.success) results.brevo++;
    await sendWelcomeOnce(doc).catch((e) => console.error(`email for ${doc._id} failed:`, e.message));
    const after = await FacebookFormLead.findById(doc._id).select("welcomeEmailSentAt welcomeEmailError").lean();
    if (after.welcomeEmailSentAt) results.email++;
    else console.warn(`welcome email not sent for ${doc._id}: ${after.welcomeEmailError}`);

    // Signup call (waits a minute, then dials; no answer → the daily sweep takes over).
    calls.push(
      scheduleFacebookFormSignupCall(doc)
        .then(() => results.callsStarted++)
        .catch((e) => console.error(`call for ${doc._id} failed:`, e.message))
    );
  }

  await Promise.all(calls);
  const status = await FacebookFormLead.aggregate([
    { $match: { importedFromHistory: true } },
    { $group: { _id: "$callStatus", n: { $sum: 1 } } },
  ]);
  console.log("Done:", JSON.stringify(results), "| call status:", JSON.stringify(status));
  await mongoose.disconnect();
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
