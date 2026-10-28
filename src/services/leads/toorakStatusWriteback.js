// services/leads/toorakStatusWriteback.js
//
// Writes a Toorak lead's status back to Zernio, so lead quality can be read per
// form on Zernio's side too: new | contacted | unreachable | qualified |
// converted | disqualified (Zernio's "Update a lead's status", lead_gen_update_lead).
//
// Our own record is the source of truth (Admin → Toorak Leads); this is a
// best-effort copy and never throws. Zernio's docs don't state the REST path
// yet, so it's OFF until ZERNIO_LEAD_STATUS_WRITEBACK=true, and the method /
// path can be changed without a deploy:
//   ZERNIO_LEAD_STATUS_METHOD  (default "patch")
//   ZERNIO_LEAD_STATUS_PATH    (default "/v1/ads/leads/{id}")
// {id} is the Zernio lead id; without one, Meta's leadgenId plus accountId.

const { request: zernioRequest } = require("../adsLoop/zernioClient");

const STATUSES = ["new", "contacted", "unreachable", "qualified", "converted", "disqualified"];
const enabled = () => process.env.ZERNIO_LEAD_STATUS_WRITEBACK === "true";

/** The latest submission's ids for this lead. */
function idsOf(lead) {
  const subs = lead?.formSubmissions || [];
  const last = subs[subs.length - 1] || {};
  return { zernioLeadId: last.zernioLeadId || "", leadgenId: last.leadgenId || (lead?.leadgenIds || []).slice(-1)[0] || "" };
}

async function writebackLeadStatus(lead, status) {
  if (!enabled() || !lead || !STATUSES.includes(status)) return { skipped: true };
  const { zernioLeadId, leadgenId } = idsOf(lead);
  const id = zernioLeadId || leadgenId;
  if (!id) return { skipped: true };
  const method = String(process.env.ZERNIO_LEAD_STATUS_METHOD || "patch").toLowerCase();
  const path = String(process.env.ZERNIO_LEAD_STATUS_PATH || "/v1/ads/leads/{id}").replace("{id}", encodeURIComponent(id));
  try {
    await zernioRequest(method, path, {
      data: { status, ...(zernioLeadId ? {} : { accountId: process.env.ZERNIO_ADS_ACCOUNT_ID }) },
    });
    return { ok: true };
  } catch (error) {
    console.error(`[toorak-writeback] ${status} for lead ${id} failed: ${error.message}`);
    return { ok: false, error: error.message };
  }
}

module.exports = { writebackLeadStatus, idsOf };
