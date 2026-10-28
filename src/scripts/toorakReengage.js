// scripts/toorakReengage.js
//
// Re-engagement email for Toorak leads that came in BEFORE the automation was
// switched on (handover 28 Oct 2026: "don't blast old leads with 'just now'
// messaging — use a separate re-engagement template"). Email only: no text,
// no call. Once per person (reengageEmailSentAt).
//
// Who (marketing, 28 Oct 2026): leads on the given Toorak form, from before
// --before (default 2026-10-28), that never got anything from us: no welcome
// email and no call. Anyone already emailed or called gets nothing. Test leads
// and leads marked disqualified are skipped. Hold until the template exists.
//
// DRY RUN unless --send. Sending needs the Brevo template ID:
//   TOORAK_REENGAGE_TEMPLATE_ID=<id> node src/scripts/toorakReengage.js --send
//   node src/scripts/toorakReengage.js                       # list who would get it
//   node src/scripts/toorakReengage.js --form ml-baltimore   # another form (default financing-v2)
//   node src/scripts/toorakReengage.js --before 2026-10-29   # another cutoff
//
// Template params: FIRSTNAME, MARKETS, PRICE_RANGE, FINANCING, LISTING_URL.

require("dotenv").config();
const mongoose = require("mongoose");
const FacebookFormLead = require("../model/leads/facebookFormLeadModel");
const { sendTemplateEmail } = require("../services/integrations/brevoService");
const { stateName, labelList, priceRangeText } = require("../services/leads/buyBox");

const SEND = process.argv.includes("--send");
const formArg = process.argv.indexOf("--form");
const FORM_KEY = formArg > 0 ? process.argv[formArg + 1] : "financing-v2";
const beforeArg = process.argv.indexOf("--before");
const BEFORE = new Date(beforeArg > 0 ? process.argv[beforeArg + 1] : "2026-10-28");
const TEMPLATE_ID = parseInt(String(process.env.TOORAK_REENGAGE_TEMPLATE_ID || "").replace(/\D/g, ""), 10);

(async () => {
  if (SEND && !TEMPLATE_ID) {
    console.error("Set TOORAK_REENGAGE_TEMPLATE_ID to the Brevo template's ID before --send.");
    process.exit(1);
  }
  await mongoose.connect(process.env.DB_URI, { serverSelectionTimeoutMS: 10000 });

  if (Number.isNaN(BEFORE.getTime())) {
    console.error("--before needs a date like 2026-10-28.");
    process.exit(1);
  }
  const leads = await FacebookFormLead.find({
    "toorak.key": FORM_KEY,
    createdAt: { $lt: BEFORE },
    // Nothing sent yet: no welcome email, no call.
    welcomeEmailSentAt: null,
    welcomeEmailMessageId: { $in: ["", null] },
    callAttempts: { $in: [0, null] },
    lastCallAt: null,
    reengageEmailSentAt: null,
    isTest: { $ne: true },
    leadStatus: { $ne: "disqualified" },
  })
    .sort({ createdAt: 1 })
    .lean();

  console.log(`${leads.length} lead(s) on "${FORM_KEY}" would get the re-engagement email.`);
  if (!SEND) {
    leads.forEach((l) => console.log(`  ${l.createdAt?.toISOString?.().slice(0, 10) || ""}  ${l.fullName || l.firstName}  <${l.email}>`));
    console.log("DRY RUN: nothing sent. Add --send (with TOORAK_REENGAGE_TEMPLATE_ID) to send.");
    await mongoose.disconnect();
    return process.exit(0);
  }

  const counts = { sent: 0, failed: 0 };
  for (const l of leads) {
    // Claim first, so two runs at once can't both send.
    const claimed = await FacebookFormLead.findOneAndUpdate(
      { _id: l._id, reengageEmailSentAt: null },
      { $set: { reengageEmailSentAt: new Date() } }
    );
    if (!claimed) continue;
    const box = l.buyBox || {};
    const result = await sendTemplateEmail({
      templateId: TEMPLATE_ID,
      label: "Toorak re-engagement",
      email: l.email,
      name: l.fullName || l.firstName,
      params: {
        FIRSTNAME: l.firstName,
        MARKETS: (box.states || []).map(stateName).join(", "),
        PRICE_RANGE: priceRangeText(box),
        FINANCING: labelList("financing", box.financing),
        LISTING_URL: l.toorak?.listingUrl || "",
      },
    });
    if (result.success) counts.sent++;
    else {
      counts.failed++;
      await FacebookFormLead.updateOne({ _id: l._id }, { $set: { reengageEmailSentAt: null, reengageEmailError: result.error || "send failed" } });
    }
  }

  console.log("Done:", JSON.stringify(counts));
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
