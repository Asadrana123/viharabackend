// config/toorakForms.js
//
// The live Toorak Meta lead forms (marketing handover, 28 Oct 2026), routed by
// form ID — never by name, names change. Leads arrive through Zernio's
// lead.received webhook (services/leads/facebookFormLeadService.js), with a
// 15-minute poll as a safety net (services/leads/toorakLeadPoller.js).
//
//   kind "financing"  Toorak Buyers – Financing v2: general, sends to /auctions
//   kind "property"   ML-Toorak-<city>-v2: one property each, sends to its listing
//
// address is the property's name in the welcome email (DEAL_MARKET).
// dealId ties a property form to its spotlight deal in config/newDeals.js
// (Maya's deal line on a call).
//
// Toorak rules (marketing's answers, 28 Oct 2026):
//   calls    only with the form's call_consent checkbox ticked; no admin
//            override. 3 attempts (T+5 min, +1 h, next day), 8 AM–9 PM in the
//            property's / market's time zone (services/calling/toorakCallScheduler.js)
//   texts    only with sms_consent ticked
//   no consent → email only, and the team dials by hand from Admin → Toorak Leads
//
// Archived forms (the non-v2 versions) send no leads and aren't listed. A new
// form whose name starts "Toorak" or "ML-Toorak" but isn't here is still
// treated as Toorak (default queue) and posts a Slack alert to add it here.

const TOORAK_FORMS = {
  "1103113942694711": { key: "financing-v2", kind: "financing", name: "Toorak Buyers – Financing – Oct 2026 v2", path: "/auctions" },
  "1571119771728277": {
    key: "ml-baltimore", kind: "property", name: "ML-Toorak-Baltimore-27Oct2026-v2",
    propertySlug: "2529-2531-e-monument-st-baltimore", dealId: "bal-01", address: "2529-2531 E Monument St, Baltimore", state: "MD", city: "Baltimore",
  },
  "3679551498868299": {
    key: "ml-capitol-heights", kind: "property", name: "ML-Toorak-Capitol Heights-27Oct2026-v2",
    propertySlug: "703-59th-ave-capitol-heights", dealId: "pg-01", address: "703 59th Ave, Capitol Heights", state: "MD", city: "Capitol Heights",
  },
  "1200670338953487": {
    key: "ml-lathrup-village", kind: "property", name: "ML-Toorak-Lathrup Village-27Oct2026-v2",
    propertySlug: "18753-san-diego-blvd-lathrup-village", dealId: "det-01", address: "18753 San Diego Blvd, Lathrup Village", state: "MI", city: "Lathrup Village",
  },
  "1112577325022588": {
    key: "ml-1977-law-st", kind: "property", name: "ML-Toorak-New Orleans 1977 Law St-27Oct2026-v2",
    propertySlug: "1977-law-st-new-orleans", dealId: "nola-02", address: "1977 Law St, New Orleans", state: "LA", city: "New Orleans",
  },
  "1157473749943510": {
    key: "ml-1983-law-st", kind: "property", name: "ML-Toorak-New Orleans 1983 Law St-27Oct2026-v2",
    propertySlug: "1983-law-st-new-orleans", dealId: "nola-01", address: "1983 Law St, New Orleans", state: "LA", city: "New Orleans",
  },
  "1683656083105610": {
    key: "ml-2508-s-prieur-st", kind: "property", name: "ML-Toorak-New Orleans 2508-12 S Prieur St-27Oct2026-v2",
    propertySlug: "2508-12-s-prieur-st-new-orleans", dealId: "nola-03", address: "2508-12 S Prieur St, New Orleans", state: "LA", city: "New Orleans",
  },
};

const TOORAK_FORM_IDS = Object.keys(TOORAK_FORMS);

// A Toorak form we don't know yet (new version, renamed copy): by name only.
const looksToorak = (name) => /^\s*(ml-)?toorak/i.test(String(name || ""));

/**
 * The Toorak route for a lead's form, or null for any other form.
 * @returns {{ key, kind, name, known: boolean, propertySlug?, dealId?, state?, city?, path? } | null}
 */
function toorakFormFor(formId, formName) {
  const known = TOORAK_FORMS[String(formId || "")];
  if (known) return { ...known, known: true };
  if (!looksToorak(formName)) return null;
  return {
    key: "unknown",
    kind: /^\s*ml-/i.test(formName) ? "property" : "financing",
    name: String(formName || ""),
    known: false,
  };
}

module.exports = { TOORAK_FORMS, TOORAK_FORM_IDS, toorakFormFor };
