// ============================================================================
// PASTE-IN for services/brevoService.js  —  Partner Program sync
// ----------------------------------------------------------------------------
// Add this to your EXISTING brevoService.js and export it (see bottom). Do NOT
// replace the whole file — it already holds syncPropertyLead / syncEarlyAccessLead.
//
// If brevoService.js already has a configured Brevo client (shared axios instance
// or the @getbrevo/brevo SDK), swap the inline axios call for it. As written this
// is self-contained and safe to drop in.
//
// ENV:
//   BREVO_API_KEY           — your Brevo v3 API key (already used elsewhere)
//   BREVO_PARTNER_LIST_ID   — the "Nurture - Partners" list id = 15 (PLAIN NUMBER,
//                             never "#15"; the parse below strips stray non-digits
//                             as a guard against the #-prefix bug).
//
// BREVO ATTRIBUTES (verified live against the account — do not rename):
//   FIRSTNAME    -> normal/text     <- firstName
//   LASTNAME     -> normal/text     <- lastName
//   EMAIL        -> contact key     <- sent as the top-level `email`, NOT an attribute
//   SMS          -> normal/text     <- phone (E.164)
//   MARKETS      -> normal/text     <- primaryMarket  (freeform string is fine)
//   PARTNER_TYPE -> CATEGORY        <- persona, mapped to a numeric id (see below)
//
// PARTNER_TYPE is a CATEGORY attribute, so it will NOT accept a raw label string —
// it must be the enumeration id. Live values:
//   1 = Realtor / Agent   2 = Flipper / Investor   3 = Wholesaler   4 = Fund / Operator
// The page sends the label ("Realtor / agent" etc.), so we normalize + map it to
// the id. An unrecognized persona is simply omitted (never sent as an invalid
// value that would 400 the whole upsert).
// ============================================================================

const axios = require("axios"); // remove if brevoService.js already imports axios

// Plain integer list id. Strips any non-digits (guards the "#15" -> NaN bug).
const BREVO_PARTNER_LIST_ID = parseInt(
  String(process.env.BREVO_PARTNER_LIST_ID || "").replace(/[^0-9]/g, ""),
  10
);

// Page persona label -> PARTNER_TYPE category id (keys are normalized: lowercased,
// single-spaced). Matches the four options on the Partner Program page.
const PARTNER_TYPE_IDS = {
  "realtor / agent": 1,
  "flipper / investor": 2,
  "wholesaler": 3,
  "fund / operator": 4,
};

const normalizeLabel = (s) =>
  String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Upsert a Partner Program applicant into Brevo and add them to the dedicated
 * "Nurture - Partners" list (list 15), which kicks off the partner email
 * sequence. Fire-and-forget: the controller wraps this in .catch, so a Brevo
 * failure never blocks signup.
 *
 * @param {object} p
 * @param {string} p.email           required — contact key
 * @param {string} [p.firstName]
 * @param {string} [p.lastName]
 * @param {string} [p.phone]         E.164 -> Brevo SMS
 * @param {string} [p.primaryMarket] -> MARKETS
 * @param {string} [p.persona]       page label -> PARTNER_TYPE id
 */
async function syncPartnerLead({
  email,
  firstName = "",
  lastName = "",
  phone = "",
  primaryMarket = "",
  persona = "",
} = {}) {
  if (!process.env.BREVO_API_KEY) {
    console.warn("[brevo] BREVO_API_KEY missing — skipping partner sync");
    return;
  }
  if (!email) return;

  const attributes = {
    FIRSTNAME: firstName,
    LASTNAME: lastName,
    MARKETS: primaryMarket,
    ...(phone ? { SMS: phone } : {}),
  };

  // PARTNER_TYPE is a category — send the id, or omit if the label is unknown.
  const partnerTypeId = PARTNER_TYPE_IDS[normalizeLabel(persona)];
  if (partnerTypeId) attributes.PARTNER_TYPE = partnerTypeId;

  const body = {
    email,
    attributes,
    updateEnabled: true, // upsert — update the contact if it already exists
  };
  if (Number.isInteger(BREVO_PARTNER_LIST_ID)) {
    body.listIds = [BREVO_PARTNER_LIST_ID];
  } else {
    console.warn("[brevo] BREVO_PARTNER_LIST_ID missing/invalid — contact upserted without a list");
  }

  await axios.post("https://api.brevo.com/v3/contacts", body, {
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    timeout: 10000,
  });
}

// ── add to your existing module.exports ──
//   module.exports = { ...existing, syncPartnerLead };
module.exports = { syncPartnerLead };
