// services/leads/toorakLeadPoller.js
//
// Safety net for the Toorak lead forms (marketing handover, 28 Oct 2026):
// webhooks miss some leads, so every 15 minutes we ask Zernio for each Toorak
// form's recent leads (GET /v1/ads/leads?formId=) and run any we haven't saved
// through the same flow as the lead.received webhook (facebookFormLeadService).
//
// Only leads from the last TOORAK_POLL_MAX_AGE_HOURS (default 24) are picked
// up: older ones belong to the backfill (src/scripts/importFacebookFormLeads.js),
// so nobody gets a "just now" welcome or call for an old submission.
//
// Runs when ZERNIO_LEADS_ENABLED=true, unless TOORAK_LEAD_POLL_ENABLED=false.

const cron = require("node-cron");
const FacebookFormLead = require("../../model/leads/facebookFormLeadModel");
const { request: zernioRequest } = require("../adsLoop/zernioClient");
const { TOORAK_FORM_IDS } = require("../../config/toorakForms");
const { handleLead, isEnabled } = require("./facebookFormLeadService");

const MAX_PAGES = 3;
const maxAgeMs = () => Math.max(1, Number(process.env.TOORAK_POLL_MAX_AGE_HOURS) || 24) * 60 * 60 * 1000;

// Lead ids this process already passed on, so a lead that can't be saved (no
// email or phone) isn't re-sent, and re-alerted, every 15 minutes.
const tried = new Set();

/** One form's leads from the last maxAge, newest pages first. */
async function recentLeads(formId, since) {
  const out = [];
  let cursor;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await zernioRequest("get", "/v1/ads/leads", {
      params: {
        accountId: process.env.ZERNIO_ADS_ACCOUNT_ID,
        ...(process.env.ZERNIO_AD_ACCOUNT_ID ? { adAccountId: process.env.ZERNIO_AD_ACCOUNT_ID } : {}),
        formId,
        limit: 100,
        ...(cursor ? { cursor } : {}),
      },
    });
    const leads = data?.leads || data?.data || [];
    out.push(...leads.filter((l) => new Date(l.createdTime).getTime() >= since));
    cursor = data?.pagination?.hasMore ? data.pagination.cursor : null;
    if (!cursor || !leads.some((l) => new Date(l.createdTime).getTime() >= since)) break;
  }
  return out;
}

/** The webhook payload's lead shape, from a GET /v1/ads/leads row. */
const asWebhookLead = (l) => ({
  id: l.id,
  leadgenId: l.leadgenId,
  formId: l.formId,
  formName: l.formName,
  adId: l.adId,
  adsetId: l.adsetId,
  campaignId: l.campaignId,
  isOrganic: l.isOrganic === true,
  createdAt: l.createdTime,
  fields: l.fields || {},
  consents: l.consents || [],
  receivedVia: "poll",
});

let running = false;

/** One pass over every Toorak form. Returns { checked, picked } for logs and tests. */
async function pollToorakLeads() {
  if (running) return { checked: 0, picked: 0 };
  running = true;
  const since = Date.now() - maxAgeMs();
  let checked = 0;
  let picked = 0;
  try {
    for (const formId of TOORAK_FORM_IDS) {
      let leads;
      try {
        leads = await recentLeads(formId, since);
      } catch (error) {
        console.error(`[toorak-poll] form ${formId}: ${error.message}`);
        continue;
      }
      checked += leads.length;
      for (const l of leads) {
        if (!l.leadgenId || tried.has(l.leadgenId)) continue;
        if (await FacebookFormLead.exists({ leadgenIds: l.leadgenId })) {
          tried.add(l.leadgenId);
          continue;
        }
        tried.add(l.leadgenId);
        picked += 1;
        console.log(`[toorak-poll] webhook missed lead ${l.leadgenId} (form ${formId}); handling it now.`);
        await handleLead({ lead: asWebhookLead(l) }).catch((e) => console.error(`[toorak-poll] lead ${l.leadgenId} failed:`, e.message));
      }
    }
  } finally {
    running = false;
  }
  if (picked) console.log(`[toorak-poll] ${picked} missed lead(s) picked up of ${checked} recent.`);
  return { checked, picked };
}

let task = null;

function startToorakLeadPoller() {
  if (task) return task;
  if (!isEnabled() || process.env.TOORAK_LEAD_POLL_ENABLED === "false") {
    console.log("[toorak-poll] off (needs ZERNIO_LEADS_ENABLED=true; TOORAK_LEAD_POLL_ENABLED=false turns it off).");
    return null;
  }
  task = cron.schedule("*/15 * * * *", () => {
    pollToorakLeads().catch((e) => console.error("[toorak-poll] failed:", e.message));
  });
  console.log(`[toorak-poll] started — every 15 minutes, ${TOORAK_FORM_IDS.length} Toorak forms.`);
  return task;
}

module.exports = { startToorakLeadPoller, pollToorakLeads, asWebhookLead };
