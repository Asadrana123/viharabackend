// scripts/tagNewDealsPartner.js
//
// One-off: tag New Deals leads saved BEFORE the partner tag existed with
// partner "Premier Mortgage" (config/newDeals.js → NEW_DEALS_PARTNER), so they
// show it in Admin → Leads like new sign-ups do. Only leads whose page URL is
// /new-deals; /find and /request leads share the collection and are left alone.
// Records only: no email, Brevo, Slack, text or call. Safe to run twice.
//
//   node src/scripts/tagNewDealsPartner.js --dry    # just count
//   node src/scripts/tagNewDealsPartner.js          # tag

require("dotenv").config();
const mongoose = require("mongoose");
const NewDealsLead = require("../model/leads/newDealsLeadModel");
const { NEW_DEALS_PARTNER } = require("../config/newDeals");

const DRY = process.argv.includes("--dry");
const NEW_DEALS_URL = /\/new-deals(?:[/?#]|$)/i;

(async () => {
  await mongoose.connect(process.env.DB_URI, { serverSelectionTimeoutMS: 10000 });
  const leads = await NewDealsLead.find({ $or: [{ partner: { $exists: false } }, { partner: "" }] }).select("pageUrl").lean();
  const counts = { checked: leads.length, tagged: 0, otherPage: 0, noPageUrl: 0 };
  const ids = [];

  for (const l of leads) {
    if (!l.pageUrl) { counts.noPageUrl++; continue; }
    if (!NEW_DEALS_URL.test(l.pageUrl)) { counts.otherPage++; continue; }
    counts.tagged++;
    ids.push(l._id);
  }

  if (!DRY && ids.length) await NewDealsLead.updateMany({ _id: { $in: ids } }, { $set: { partner: NEW_DEALS_PARTNER } });

  console.log(DRY ? "DRY RUN (nothing changed):" : "Done:", JSON.stringify(counts));
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
