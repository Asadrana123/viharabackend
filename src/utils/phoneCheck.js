// utils/phoneCheck.js
//
// The free phone check: can this number exist at all? libphonenumber-js knows each country's real number ranges,
// so it turns away an area code that isn't in use (+1 498…), 555 numbers and 123-456-7890. Offline, no cost.
// It can't tell a mobile from a landline: that's Twilio Lookup (services/leads/phoneLookupService.js).
const { parsePhoneNumberFromString } = require("libphonenumber-js/min");

/**
 * @param {string} e164 "+14155552671"
 * @returns {{ valid: boolean, country: string|null }}
 */
function checkPhoneFormat(e164) {
  try {
    const parsed = parsePhoneNumberFromString(String(e164 || ""));
    if (!parsed) return { valid: false, country: null };
    return { valid: parsed.isValid(), country: parsed.country || null };
  } catch {
    return { valid: false, country: null };
  }
}

module.exports = { checkPhoneFormat };
