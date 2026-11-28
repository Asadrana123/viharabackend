// services/leads/phoneLookupService.js
//
// Before we text a number for the first time: can it exist, and what kind of line is it?
//   1. The free check (utils/phoneCheck.js, libphonenumber-js). An impossible number (+1 498…, 555…) stops here, unpaid.
//   2. Twilio Lookup, Line Type Intelligence ($0.008 a number, Oct 2026 price), US numbers only, while
//      PHONE_LOOKUP_ENABLED=true. It answers mobile / landline / fixedVoip / nonFixedVoip / tollFree / …
// The answer is kept per number (phonelookups), so each number is paid for once (re-checked after LOOKUP_KEEP_DAYS).
// Keys: the Vtext Twilio line's (twilio/twilioKeys.js), the same ones the home pop-up's Verify code uses.
//
// What we do with it (verdictFor):
//   not a real number          → "invalid":  no texts at all
//   landline / pager / …       → "landline": no texts (calls still go)
//   VoIP (Google Voice …)      → texts by Twilio SMS only: a VoIP number can't be on iMessage
//   mobile                     → texts as usual: iMessage first, SMS when it isn't on iMessage
//
// Never throws: a Lookup that fails or is slow (LOOKUP_TIMEOUT_MS) leaves the number "unknown" and the text goes as before.
const PhoneLookup = require("../../model/leads/phoneLookupModel");
const { checkPhoneFormat } = require("../../utils/phoneCheck");
const { loadTwilioCredentials, twilioClientFrom } = require("../twilio/twilioKeys");
const { setIMessageReachable } = require("../vtext/vtextPhoneFacts");

const LOOKUP_KEEP_DAYS = 180; // numbers get ported mobile ↔ landline, so look again after half a year
const LOOKUP_TIMEOUT_MS = 4000;
const PAUSE_AFTER_ERROR_MS = 5 * 60 * 1000; // Twilio failing: don't make every text wait 4 s for the next 5 minutes

// Twilio line types that can't take a text, and ones that can't be on iMessage.
const CANT_TEXT = new Set(["landline", "voicemail", "pager", "premium", "sharedCost", "uan"]);
const NOT_IMESSAGE = new Set(["fixedVoip", "nonFixedVoip", "tollFree", ...CANT_TEXT]);

const isEnabled = () => process.env.PHONE_LOOKUP_ENABLED === "true";

let pausedUntil = 0;
const inFlight = new Map(); // phone → Promise, so two texts at once pay for one lookup

// ─── Twilio call (replaceable in tests) ──────────────────────────────────────
async function twilioLineType(e164) {
  const creds = await loadTwilioCredentials();
  if (!creds) throw new Error("no Twilio keys");
  const res = await twilioClientFrom(creds).lookups.v2.phoneNumbers(e164).fetch({ fields: "line_type_intelligence" });
  const lti = res.lineTypeIntelligence || res.line_type_intelligence || {};
  return {
    valid: res.valid !== false,
    validationErrors: res.validationErrors || res.validation_errors || [],
    country: res.countryCode || res.country_code || null,
    lineType: lti.type || null,
    carrierName: lti.carrier_name || lti.carrierName || null,
    errorCode: lti.error_code ?? lti.errorCode ?? null,
  };
}
let fetchLineType = twilioLineType;
/** Tests only: `fn(e164)` returns what twilioLineType returns (or throws). Pass null to restore the real call. */
function setLookupForTests(fn) {
  fetchLineType = fn || twilioLineType;
  pausedUntil = 0;
  inFlight.clear();
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Twilio Lookup took over ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function save(phoneE164, fields, now) {
  const update = { $set: { ...fields, checkedAt: now } };
  if (fields.source === "format") update.$unset = { lineType: 1, carrierName: 1, errorCode: 1 };
  return PhoneLookup.findOneAndUpdate({ phoneE164 }, update, { upsert: true, new: true }).lean();
}

/**
 * What we know about this number, looking it up when needed. Never throws.
 * @param {string} e164
 * @returns {Promise<object|null>} a phonelookups row (source "format" or "twilio"), or null for a non-phone address
 */
async function lookupPhone(e164, { now = new Date() } = {}) {
  if (!e164 || !String(e164).startsWith("+")) return null;
  try {
    const existing = await PhoneLookup.findOne({ phoneE164: e164 }).lean();
    const fresh = existing && now - new Date(existing.checkedAt) < LOOKUP_KEEP_DAYS * 86_400_000;
    // A Twilio answer, or a number that can't exist, is final until it goes stale.
    if (fresh && (existing.source === "twilio" || existing.valid === false)) return existing;

    const format = checkPhoneFormat(e164);
    if (!format.valid) return await save(e164, { source: "format", valid: false, country: format.country }, now);

    // Only US numbers are looked up: our Twilio line texts the US only, and Canada needs Twilio's approval (60601).
    const payFor = isEnabled() && format.country === "US" && Date.now() >= pausedUntil;
    if (!payFor) {
      if (fresh) return existing;
      return await save(e164, { source: "format", valid: true, country: format.country }, now);
    }

    if (!inFlight.has(e164)) {
      const job = withTimeout(fetchLineType(e164), LOOKUP_TIMEOUT_MS)
        .then((r) => save(e164, { source: "twilio", ...r, country: r.country || format.country }, now))
        .finally(() => inFlight.delete(e164));
      inFlight.set(e164, job);
    }
    return await inFlight.get(e164);
  } catch (err) {
    pausedUntil = Date.now() + PAUSE_AFTER_ERROR_MS;
    console.error(`[phone-lookup] lookup failed for ${String(e164).slice(0, 5)}***: ${err.message} (Lookups paused 5 min)`);
    const format = checkPhoneFormat(e164);
    return { phoneE164: e164, source: "format", valid: format.valid, country: format.country, checkedAt: null };
  }
}

/**
 * What a lookup means for texting.
 * @returns {{ phoneStatus: "invalid"|"landline"|"valid"|null, iMessage: false|null }}
 *   phoneStatus null = no new fact; iMessage false = skip the Mac, null = unknown (try iMessage first)
 */
function verdictFor(lookup) {
  if (!lookup) return { phoneStatus: null, iMessage: null };
  if (lookup.valid === false) return { phoneStatus: "invalid", iMessage: false };
  const type = lookup.lineType;
  if (CANT_TEXT.has(type)) return { phoneStatus: "landline", iMessage: false };
  if (NOT_IMESSAGE.has(type)) return { phoneStatus: type === "tollFree" ? null : "valid", iMessage: false };
  if (type === "mobile") return { phoneStatus: "valid", iMessage: null };
  return { phoneStatus: null, iMessage: null };
}

/**
 * Look the contact's number up (once) and write what it means onto the contact: phoneStatus for the compliance
 * gate, iMessage reachability for the router, and contact.lookup for the Inbox. Saves the contact. Never throws.
 * Doesn't override what the number itself proved: a contact who texted us stays "valid", a known iPhone stays iMessage.
 * @param {object} contact a vtextContactModel document (not lean)
 */
async function checkContactPhone(contact, { now = new Date() } = {}) {
  try {
    if (!contact?.phoneE164 || !contact.phoneE164.startsWith("+")) return null;
    const known = contact.lookup?.checkedAt && now - new Date(contact.lookup.checkedAt) < LOOKUP_KEEP_DAYS * 86_400_000;
    // Nothing more to learn: Twilio already answered, the number can't exist, it isn't a US number, or Lookup is off.
    const final = contact.lookup?.source === "twilio" || contact.lookup?.valid === false || (contact.lookup?.country && contact.lookup.country !== "US");
    if (known && (final || !isEnabled())) return null;

    const lookup = await lookupPhone(contact.phoneE164, { now });
    if (!lookup?.checkedAt) return null; // the lookup failed: try again with the next text

    const verdict = verdictFor(lookup);
    // phoneStatus is only ours to set when it's still "unknown" or was set by an earlier lookup. A status from a
    // real Twilio error (21211, 30005 …) or from them texting us is proof, and a lookup doesn't overrule proof.
    const setByLookup = contact.phoneStatus === "unknown" || (contact.lookup?.checkedAt && contact.phoneStatus === verdictFor(contact.lookup).phoneStatus);
    contact.lookup = {
      source: lookup.source,
      valid: lookup.valid,
      country: lookup.country || undefined,
      lineType: lookup.lineType || undefined,
      carrierName: lookup.carrierName || undefined,
      checkedAt: lookup.checkedAt,
    };
    const textedUs = !!contact.lastInboundAt;
    if (verdict.phoneStatus && setByLookup && !textedUs) contact.phoneStatus = verdict.phoneStatus;
    if (verdict.iMessage === false && contact.iphone?.isIphone !== true) setIMessageReachable(contact, false, now);
    await contact.save();
    return verdict;
  } catch (err) {
    console.error(`[phone-lookup] couldn't apply the lookup to contact ${contact?._id}: ${err.message}`);
    return null;
  }
}

module.exports = { lookupPhone, checkContactPhone, verdictFor, setLookupForTests, LOOKUP_KEEP_DAYS, CANT_TEXT, NOT_IMESSAGE };
