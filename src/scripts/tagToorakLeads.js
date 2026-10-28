// scripts/tagToorakLeads.js
//
// One-off: tag the Facebook form leads saved BEFORE Toorak routing existed
// (config/toorakForms.js) with their Toorak route, property, listing link and
// hot flag, so they show in Admin → Toorak Leads. Records only: no email,
// Brevo, Slack, text or call. Safe to run twice.
//
// Toorak leads leave the 7-day call loop for the 3-attempt schedule
// (toorakCallScheduler.js): a lead still being called keeps going there if it
// has had fewer than 3 calls, otherwise it ends as "not-reached".
//
// To bring in leads that never reached us at all (e.g. the Financing v2 form's
// older leads), run importFacebookFormLeads.js first, then this.
//
//   node src/scripts/tagToorakLeads.js          # tag
//   node src/scripts/tagToorakLeads.js --dry    # just count

require("dotenv").config();
const mongoose = require("mongoose");
const FacebookFormLead = require("../model/leads/facebookFormLeadModel");
const { toorakRouteFor } = require("../services/leads/facebookFormLeadService");
const { hotReasons } = require("../services/leads/toorakLeads");
const { findDeal } = require("../config/newDeals");

const DRY = process.argv.includes("--dry");

(async () => {
  await mongoose.connect(process.env.DB_URI, { serverSelectionTimeoutMS: 10000 });
  const leads = await FacebookFormLead.find({ toorak: null }).select("formId formName answers buyBox dealInterest callStatus callAttempts").lean();
  const counts = { checked: leads.length, tagged: 0, hot: 0, notToorak: 0, ended: 0 };

  for (const l of leads) {
    const route = toorakRouteFor({ formId: l.formId, formName: l.formName }, null);
    if (!route) { counts.notToorak++; continue; }
    const hot = hotReasons(l.answers);
    counts.tagged++;
    if (hot.length) counts.hot++;
    const end = l.callStatus === "no-answer" && (l.callAttempts || 0) >= 3;
    if (end) counts.ended++;
    if (DRY) continue;

    const set = {
      leadSource: "meta_leadform",
      toorak: { key: route.key, kind: route.kind, known: route.known, propertySlug: route.propertySlug || "", listingUrl: route.listingUrl },
      hot: hot.length > 0,
      hotReasons: hot,
    };
    if (route.state && !(l.buyBox?.states || []).length) set["buyBox.states"] = [route.state];
    if (route.dealId && !l.dealInterest && findDeal(route.dealId)) set.dealInterest = route.dealId;
    if (end) Object.assign(set, { callStatus: "not-reached", nextCallAt: null });
    await FacebookFormLead.updateOne({ _id: l._id }, { $set: set });
  }

  console.log(DRY ? "DRY RUN (nothing changed):" : "Done:", JSON.stringify(counts));
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
