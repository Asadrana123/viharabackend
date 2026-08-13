// utils/resolveTimezone.js
// Zero-dependency IANA timezone resolver for US properties.
// Primary signal: `state`. For the handful of states that span two zones,
// a ZIP-prefix override corrects the minority region using the `zipCode`
// you already require. No dataset, no network calls.
const { DateTime } = require('luxon');

const DEFAULT_TZ = 'America/New_York';

// State/territory -> dominant IANA zone.
const STATE_TZ = {
  AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix',
  AR: 'America/Chicago', CA: 'America/Los_Angeles', CO: 'America/Denver',
  CT: 'America/New_York', DE: 'America/New_York', DC: 'America/New_York',
  FL: 'America/New_York', GA: 'America/New_York', HI: 'Pacific/Honolulu',
  ID: 'America/Boise', IL: 'America/Chicago', IN: 'America/Indiana/Indianapolis',
  IA: 'America/Chicago', KS: 'America/Chicago', KY: 'America/New_York',
  LA: 'America/Chicago', ME: 'America/New_York', MD: 'America/New_York',
  MA: 'America/New_York', MI: 'America/Detroit', MN: 'America/Chicago',
  MS: 'America/Chicago', MO: 'America/Chicago', MT: 'America/Denver',
  NE: 'America/Chicago', NV: 'America/Los_Angeles', NH: 'America/New_York',
  NJ: 'America/New_York', NM: 'America/Denver', NY: 'America/New_York',
  NC: 'America/New_York', ND: 'America/Chicago', OH: 'America/New_York',
  OK: 'America/Chicago', OR: 'America/Los_Angeles', PA: 'America/New_York',
  RI: 'America/New_York', SC: 'America/New_York', SD: 'America/Chicago',
  TN: 'America/Chicago', TX: 'America/Chicago', UT: 'America/Denver',
  VT: 'America/New_York', VA: 'America/New_York', WA: 'America/Los_Angeles',
  WV: 'America/New_York', WI: 'America/Chicago', WY: 'America/Denver',
  PR: 'America/Puerto_Rico', VI: 'America/St_Thomas', GU: 'Pacific/Guam',
};

// Split-timezone states: ZIP prefix -> zone for the minority region.
// Anything not matched here falls back to STATE_TZ above.
// NOTE: tiny edge regions (AZ Navajo Nation, NV West Wendover, a few ND/KS/MI
// UP counties) use the dominant state zone — flag any such property to me.
const ZIP_OVERRIDES = {
  TX: [{ prefixes: ['798', '799'], zone: 'America/Denver' }],            // El Paso / Hudspeth
  FL: [{ prefixes: ['324', '325'], zone: 'America/Chicago' }],           // western Panhandle
  KY: [{ prefixes: ['420', '421', '422', '423', '424'], zone: 'America/Chicago' }], // western KY
  TN: [{ prefixes: ['374', '376', '377', '378', '379'], zone: 'America/New_York' }], // east TN
  IN: [{ prefixes: ['463', '464', '476', '477'], zone: 'America/Chicago' }], // NW + SW corners
  ID: [{ prefixes: ['835', '838'], zone: 'America/Los_Angeles' }],       // north Idaho
  OR: [{ prefixes: ['979'], zone: 'America/Denver' }],                   // Malheur County
  SD: [{ prefixes: ['577'], zone: 'America/Denver' }],                   // west river
  NE: [{ prefixes: ['693'], zone: 'America/Denver' }],                   // Panhandle
};

const NAME_TO_ABBR = {
  ALABAMA:'AL',ALASKA:'AK',ARIZONA:'AZ',ARKANSAS:'AR',CALIFORNIA:'CA',COLORADO:'CO',
  CONNECTICUT:'CT',DELAWARE:'DE','DISTRICT OF COLUMBIA':'DC',FLORIDA:'FL',GEORGIA:'GA',
  HAWAII:'HI',IDAHO:'ID',ILLINOIS:'IL',INDIANA:'IN',IOWA:'IA',KANSAS:'KS',KENTUCKY:'KY',
  LOUISIANA:'LA',MAINE:'ME',MARYLAND:'MD',MASSACHUSETTS:'MA',MICHIGAN:'MI',MINNESOTA:'MN',
  MISSISSIPPI:'MS',MISSOURI:'MO',MONTANA:'MT',NEBRASKA:'NE',NEVADA:'NV','NEW HAMPSHIRE':'NH',
  'NEW JERSEY':'NJ','NEW MEXICO':'NM','NEW YORK':'NY','NORTH CAROLINA':'NC','NORTH DAKOTA':'ND',
  OHIO:'OH',OKLAHOMA:'OK',OREGON:'OR',PENNSYLVANIA:'PA','RHODE ISLAND':'RI','SOUTH CAROLINA':'SC',
  'SOUTH DAKOTA':'SD',TENNESSEE:'TN',TEXAS:'TX',UTAH:'UT',VERMONT:'VT',VIRGINIA:'VA',
  WASHINGTON:'WA','WEST VIRGINIA':'WV',WISCONSIN:'WI',WYOMING:'WY','PUERTO RICO':'PR',
};

// Resolve a property (needs `state`, optionally `zipCode`) -> IANA zone string.
function resolvePropertyTimezone(property = {}) {
  const raw = String(property.state || '').trim().toUpperCase();
  const state = raw.length === 2 ? raw : (NAME_TO_ABBR[raw] || raw);
  const zip = String(property.zipCode || '').replace(/\D/g, '');

  const overrides = ZIP_OVERRIDES[state];
  if (overrides && zip) {
    for (const rule of overrides) {
      if (rule.prefixes.some((p) => zip.startsWith(p))) return rule.zone;
    }
  }
  return STATE_TZ[state] || DEFAULT_TZ;
}

// Admin-typed wall-clock (e.g. "2026-09-11T11:00") in `zone` -> correct UTC Date.
// If the string already carries an offset/Z, that instant is preserved.
function wallClockToUtc(value, zone) {
  const dt = DateTime.fromISO(value, { zone });
  return dt.isValid ? dt.toUTC().toJSDate() : null;
}

// Stored UTC Date -> wall-clock "YYYY-MM-DDTHH:mm" in `zone` (for input prefill).
function utcToWallClock(date, zone) {
  if (!date) return null;
  const dt = DateTime.fromJSDate(new Date(date), { zone });
  return dt.isValid ? dt.toFormat("yyyy-LL-dd'T'HH:mm") : null;
}

module.exports = { resolvePropertyTimezone, wallClockToUtc, utcToWallClock };