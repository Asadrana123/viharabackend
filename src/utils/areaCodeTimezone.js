// utils/areaCodeTimezone.js
//
// US area code -> IANA timezone, for contacts with no lead link (so no
// resolvePropertyTimezone(state,zip) available) — used by the quiet-hours
// gate (sendify-infra.md §4.3/D11) to guess a reasonable local time to text.
//
// NOT exhaustive — there's no npm package for this (checked), and hand-typing
// all ~350 real US area codes correctly without a verified data source isn't
// worth the risk of silent wrong entries for a compliance-adjacent feature.
// This covers the large/common codes across every US timezone (including
// Arizona's no-DST Mountain quirk) so the quiet-hours mechanism works
// correctly end to end; unknown codes fall back to America/New_York,
// matching this repo's existing SENDIFY_DAY_TZ default. Worth replacing with
// a licensed/verified dataset if real volume ever depends on precision here.
const AREA_CODE_TIMEZONES = {
  // Eastern
  "212": "America/New_York", "646": "America/New_York", "917": "America/New_York", // NYC
  "718": "America/New_York", "347": "America/New_York", "929": "America/New_York",
  "617": "America/New_York", "857": "America/New_York", // Boston
  "202": "America/New_York", // DC
  "215": "America/New_York", "267": "America/New_York", // Philadelphia
  "305": "America/New_York", "786": "America/New_York", // Miami
  "404": "America/New_York", "678": "America/New_York", "470": "America/New_York", // Atlanta
  "704": "America/New_York", "980": "America/New_York", // Charlotte
  "412": "America/New_York", // Pittsburgh
  "313": "America/New_York", // Detroit
  // Central
  "312": "America/Chicago", "773": "America/Chicago", "872": "America/Chicago", // Chicago
  "713": "America/Chicago", "281": "America/Chicago", "832": "America/Chicago", // Houston
  "214": "America/Chicago", "469": "America/Chicago", "972": "America/Chicago", // Dallas
  "210": "America/Chicago", // San Antonio
  "512": "America/Chicago", "737": "America/Chicago", // Austin
  "504": "America/Chicago", // New Orleans
  "615": "America/Chicago", "629": "America/Chicago", // Nashville
  "314": "America/Chicago", // St. Louis
  "612": "America/Chicago", "763": "America/Chicago", // Minneapolis
  "316": "America/Chicago", // Wichita (Kansas, central time)
  // Mountain (observes DST)
  "303": "America/Denver", "720": "America/Denver", "970": "America/Denver", // Denver
  "801": "America/Denver", // Salt Lake City
  "505": "America/Denver", // Albuquerque
  "406": "America/Denver", // Montana
  "307": "America/Denver", // Wyoming
  // Mountain, NO DST (Arizona, except the Navajo Nation — close enough for a soft gate)
  "602": "America/Phoenix", "480": "America/Phoenix", "623": "America/Phoenix", "520": "America/Phoenix",
  // Pacific
  "213": "America/Los_Angeles", "310": "America/Los_Angeles", "323": "America/Los_Angeles", "424": "America/Los_Angeles", // LA
  "415": "America/Los_Angeles", "628": "America/Los_Angeles", // San Francisco
  "408": "America/Los_Angeles", "669": "America/Los_Angeles", // San Jose
  "619": "America/Los_Angeles", "858": "America/Los_Angeles", // San Diego
  "503": "America/Los_Angeles", "971": "America/Los_Angeles", // Portland
  "206": "America/Los_Angeles", "425": "America/Los_Angeles", "253": "America/Los_Angeles", // Seattle
  "702": "America/Los_Angeles", "725": "America/Los_Angeles", // Las Vegas
  "916": "America/Los_Angeles", // Sacramento
  // Alaska / Hawaii
  "907": "America/Anchorage",
  "808": "Pacific/Honolulu",
};

const DEFAULT_TIMEZONE = "America/New_York";

/**
 * @param {string} phoneE164 - "+1XXXXXXXXXX"
 * @returns {string} an IANA timezone — DEFAULT_TIMEZONE if the area code isn't in the table
 */
function timezoneForPhone(phoneE164) {
  const match = /^\+1(\d{3})\d{7}$/.exec(String(phoneE164 || ""));
  if (!match) return DEFAULT_TIMEZONE;
  return AREA_CODE_TIMEZONES[match[1]] || DEFAULT_TIMEZONE;
}

module.exports = { timezoneForPhone, AREA_CODE_TIMEZONES, DEFAULT_TIMEZONE };
