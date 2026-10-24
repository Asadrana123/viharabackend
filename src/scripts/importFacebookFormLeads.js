// scripts/importFacebookFormLeads.js
//
// One-off: put the Facebook / Instagram instant-form leads that came in
// BEFORE the Zernio lead webhook was switched on into Admin → "Facebook Forms".
//
// Records only: no welcome email, no Brevo, no Slack, no Maya call. Each
// imported lead is marked importedFromHistory and keeps its original date.
// Leads already saved (same Meta lead id) are skipped, so it is safe to run
// twice. Facebook's own test leads are skipped.
//
//   node src/scripts/importFacebookFormLeads.js          # import
//   node src/scripts/importFacebookFormLeads.js --dry    # just count

require("dotenv").config();
const mongoose = require("mongoose");
const FacebookFormLead = require("../model/leads/facebookFormLeadModel");
const { request: zernioRequest } = require("../services/adsLoop/zernioClient");
const { saveLead, getForm, isValidLead } = require("../services/leads/facebookFormLeadService");

const DRY = process.argv.includes("--dry");
const isTest = (fields) => Object.values(fields || {}).some((v) => /test lead|dummy data/i.test(String(v)));

async function allLeads() {
  const out = [];
  let cursor;
  do {
    const data = await zernioRequest("get", "/v1/ads/leads", {
      params: { accountId: process.env.ZERNIO_ADS_ACCOUNT_ID, limit: 100, ...(cursor ? { cursor } : {}) },
    });
    out.push(...(data.leads || data.data || []));
    cursor = data.pagination?.hasMore ? data.pagination.cursor : null;
  } while (cursor);
  // Oldest first, so a person's first submission becomes their record.
  return out.sort((a, b) => new Date(a.createdTime) - new Date(b.createdTime));
}

(async () => {
  await mongoose.connect(process.env.DB_URI, { serverSelectionTimeoutMS: 10000 });
  const leads = await allLeads();
  const counts = { total: leads.length, imported: 0, merged: 0, alreadySaved: 0, test: 0, noContact: 0, failed: 0 };

  for (const l of leads) {
    const fields = l.fields || {};
    if (isTest(fields)) { counts.test++; continue; }
    if (!isValidLead(fields)) { counts.noContact++; continue; }
    if (await FacebookFormLead.exists({ leadgenIds: l.leadgenId })) { counts.alreadySaved++; continue; }
    if (DRY) { counts.imported++; continue; }

    try {
      const form = l.formId ? await getForm(l.formId) : null;
      const saved = await saveLead({
        lead: {
          id: l.id,
          leadgenId: l.leadgenId,
          formId: l.formId,
          formName: l.formName,
          adId: l.adId,
          adsetId: l.adsetId,
          campaignId: l.campaignId,
          isOrganic: l.isOrganic === true,
          createdAt: l.createdTime,
        },
        form,
        fields,
      });
      if (!saved) { counts.alreadySaved++; continue; }
      // Keep the original date (the admin list is newest first) and mark it imported.
      // Straight to the collection: Mongoose won't change an existing createdAt.
      const set = { importedFromHistory: true, ...(saved.isNew ? { createdAt: new Date(l.createdTime) } : {}) };
      await FacebookFormLead.collection.updateOne({ _id: saved.lead._id }, { $set: set });
      saved.isNew ? counts.imported++ : counts.merged++;
    } catch (error) {
      counts.failed++;
      console.error(`lead ${l.leadgenId} (${l.formName}) failed:`, error.message);
    }
  }

  console.log(DRY ? "DRY RUN (nothing saved):" : "Done:", JSON.stringify(counts));
  await mongoose.disconnect();
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
