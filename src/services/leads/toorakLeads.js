// services/leads/toorakLeads.js
//
// Toorak Meta lead forms (config/toorakForms.js): the hot-lead rule and the
// lead status, from the marketing handover (28 Oct 2026). Pure functions.
//
// HOT (call first): timeline = within_30_days, OR how_pay = cash, OR
// down_payment in 20_30 / 30_plus / paying_cash.
//
// STATUS: new → contacted / unreachable come from Maya's calls (callStatus);
// qualified / converted / disqualified are set by the team in admin, and a
// status set by hand always wins. One automatic rule: a wrong phone number
// (marked by the team) AND a bounced email → disqualified. Measured per form
// in Admin → Toorak Leads.

const LEAD_STATUSES = ["new", "contacted", "unreachable", "qualified", "converted", "disqualified"];
const MANUAL_STATUSES = LEAD_STATUSES.filter((s) => s !== "new");

// "Within 30 days" → "within_30_days", "20–30%" → "20_30": for forms whose answers come back as labels.
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/** The answer to the question with this key, as its option key (or its label, slugged). */
function answerOf(answers, key) {
  const a = (answers || []).find((x) => x.key === key);
  if (!a) return [];
  return [slug(a.value), slug(a.label)].filter(Boolean);
}

const HOT_DOWN_PAYMENTS = ["20_30", "30_plus", "paying_cash"];

/** The handover's hot rule. Returns the reasons (empty = not hot). */
function hotReasons(answers) {
  const reasons = [];
  if (answerOf(answers, "timeline").includes("within_30_days")) reasons.push("Buying within 30 days");
  if (answerOf(answers, "how_pay").includes("cash")) reasons.push("Paying cash");
  if (answerOf(answers, "down_payment").some((v) => HOT_DOWN_PAYMENTS.includes(v))) reasons.push("20%+ down or cash");
  return reasons;
}

/**
 * Where the lead stands: a status set by hand, else auto "disqualified" when
 * the phone is wrong AND the email bounced, else what Maya's calls say.
 * @param {object} [opts]  { emailBounced } — from the Brevo email events
 */
function leadStatusOf(lead, { emailBounced = false } = {}) {
  if (MANUAL_STATUSES.includes(lead.leadStatus)) return lead.leadStatus;
  if (lead.phoneInvalid && emailBounced) return "disqualified";
  if (lead.callStatus === "connected") return "contacted";
  if (lead.callStatus === "not-reached") return "unreachable";
  return "new";
}

/**
 * Consent from the form's checkboxes, by their exact keys (marketing sets
 * call_consent / sms_consent on the v3 forms). Missing or unticked = no consent.
 */
function checkboxConsents(consents) {
  const ticked = (key) => Array.isArray(consents) && consents.some((c) => c && c.checkboxKey === key && c.isChecked === true);
  return { call: ticked("call_consent"), sms: ticked("sms_consent") };
}

/**
 * Facebook's testing tool: the dummy-data text, or (marketing's rule) a lead
 * with no ad id that isn't an organic lead.
 */
const isToorakTestLead = (lead, fields) =>
  Object.values(fields || {}).some((v) => /test lead|dummy data/i.test(String(v))) || (!lead.adId && lead.isOrganic !== true);

/** Per-form counts: total, hot, and one per status. */
function formReport(leads, formName = (id) => id, bounced = new Set()) {
  const byForm = new Map();
  for (const lead of leads) {
    const id = lead.formId || "unknown";
    const row =
      byForm.get(id) ||
      { formId: id, name: formName(id, lead), total: 0, hot: 0, ...Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) };
    row.total += 1;
    if (lead.hot) row.hot += 1;
    row[leadStatusOf(lead, { emailBounced: bounced.has(String(lead.email || "").toLowerCase()) })] += 1;
    byForm.set(id, row);
  }
  return [...byForm.values()].sort((a, b) => b.total - a.total);
}

module.exports = { LEAD_STATUSES, MANUAL_STATUSES, hotReasons, leadStatusOf, formReport, checkboxConsents, isToorakTestLead };
