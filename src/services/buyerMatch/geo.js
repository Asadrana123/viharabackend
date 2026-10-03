// services/buyerMatch/geo.js
//
// Location helpers for lead ↔ property matching. Leads describe where they want
// to buy in free text ("New York, California, nationwide", "Austin, TX",
// "Central Valley"), so everything here turns that text into structured targets:
//   { kind: "nationwide" }
//   { kind: "state",  state: "CA" }
//   { kind: "region", region: "centralValley", state: "CA" }
//   { kind: "county", county: "contra costa", state: "CA" | null }
//   { kind: "city",   city: "austin", state: "TX" | null }
//   { kind: "zip",    zip: "32566" }

const STATES = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california",
  CO: "colorado", CT: "connecticut", DE: "delaware", DC: "district of columbia",
  FL: "florida", GA: "georgia", HI: "hawaii", ID: "idaho", IL: "illinois",
  IN: "indiana", IA: "iowa", KS: "kansas", KY: "kentucky", LA: "louisiana",
  ME: "maine", MD: "maryland", MA: "massachusetts", MI: "michigan",
  MN: "minnesota", MS: "mississippi", MO: "missouri", MT: "montana",
  NE: "nebraska", NV: "nevada", NH: "new hampshire", NJ: "new jersey",
  NM: "new mexico", NY: "new york", NC: "north carolina", ND: "north dakota",
  OH: "ohio", OK: "oklahoma", OR: "oregon", PA: "pennsylvania",
  RI: "rhode island", SC: "south carolina", SD: "south dakota",
  TN: "tennessee", TX: "texas", UT: "utah", VT: "vermont", VA: "virginia",
  WA: "washington", WV: "west virginia", WI: "wisconsin", WY: "wyoming",
};

const NAME_TO_ABBR = Object.fromEntries(
  Object.entries(STATES).map(([abbr, name]) => [name, abbr])
);
// "newyork" → "NY" (people drop the space)
const SQUASHED_TO_ABBR = Object.fromEntries(
  Object.entries(STATES).map(([abbr, name]) => [name.replace(/ /g, ""), abbr])
);
// Longest first so "west virginia" is tried before "virginia".
const STATE_NAMES_BY_LENGTH = Object.keys(NAME_TO_ABBR).sort((a, b) => b.length - a.length);

// California regions, by county. Only regions a lead form can actually name.
const BAY_AREA = [
  "san francisco", "san mateo", "santa clara", "alameda", "contra costa",
  "marin", "sonoma", "napa", "solano",
];
const CENTRAL_VALLEY = [
  "sacramento", "san joaquin", "stanislaus", "merced", "fresno", "madera",
  "kings", "tulare", "kern", "yolo", "sutter", "yuba", "colusa", "glenn",
  "butte", "tehama", "shasta",
];
const SIERRA_FOOTHILLS = [
  "placer", "el dorado", "amador", "calaveras", "tuolumne", "mariposa", "nevada",
];
const NORCAL_OTHER = [
  "santa cruz", "san benito", "monterey", "lake", "mendocino", "humboldt",
  "del norte", "siskiyou", "trinity", "modoc", "lassen", "plumas", "sierra",
  "alpine", "mono",
];
const SOCAL = [
  "los angeles", "orange", "san diego", "riverside", "san bernardino",
  "ventura", "santa barbara", "imperial", "san luis obispo",
];

const REGIONS = {
  bayArea:         { label: "Bay Area",          state: "CA", counties: BAY_AREA },
  centralValley:   { label: "Central Valley",    state: "CA", counties: CENTRAL_VALLEY },
  sierraFoothills: { label: "Sierra foothills",  state: "CA", counties: SIERRA_FOOTHILLS },
  norCal: {
    label: "Northern California",
    state: "CA",
    counties: [...BAY_AREA, ...CENTRAL_VALLEY, ...SIERRA_FOOTHILLS, ...NORCAL_OTHER],
  },
  soCal: { label: "Southern California", state: "CA", counties: SOCAL },
};

// California regions by the first 3 ZIP digits — used when a property has no
// county (uploaded sheets usually don't). Ranges follow USPS sectional centers.
const CA_ZIP3_REGIONS = (() => {
  const map = {};
  const add = (from, to, ...regions) => {
    for (let z = from; z <= to; z++) map[String(z)] = regions;
  };
  add(900, 935, "soCal");                                  // LA → Santa Barbara / Mojave
  add(932, 933, "centralValley", "norCal");                // Bakersfield (Kern)
  add(936, 938, "centralValley", "norCal");                // Fresno / Madera / Kings / Tulare
  add(939, 939, "norCal");                                 // Salinas / Monterey
  add(940, 941, "bayArea", "norCal");                      // San Francisco / Peninsula
  add(943, 951, "bayArea", "norCal");                      // Peninsula, East Bay, Marin, South Bay
  add(952, 953, "centralValley", "norCal");                // Stockton / Modesto / Merced
  add(954, 954, "bayArea", "norCal");                      // Santa Rosa / Napa
  add(955, 955, "norCal");                                 // Eureka
  add(956, 956, "centralValley", "sierraFoothills", "norCal"); // Sacramento suburbs, Placer, El Dorado
  add(957, 958, "centralValley", "norCal");                // Sacramento
  add(959, 959, "centralValley", "sierraFoothills", "norCal"); // Marysville / Chico / Grass Valley
  add(960, 961, "norCal");                                 // Redding / Truckee
  map["960"] = ["centralValley", "norCal"];               // Redding is Shasta County
  return map;
})();

/** Every region a property sits in, from its county and/or ZIP. */
function regionsForProperty({ state, countyKey, zip }) {
  const out = new Set();
  if (state !== "CA") return out;
  for (const [key, region] of Object.entries(REGIONS)) {
    if (countyKey && region.counties.includes(countyKey)) out.add(key);
  }
  for (const key of CA_ZIP3_REGIONS[String(zip || "").slice(0, 3)] || []) out.add(key);
  return out;
}

// Phrases (lower-case, exact token) that name a region.
const REGION_ALIASES = {
  "bay area": "bayArea",
  "sf bay area": "bayArea",
  "san francisco bay area": "bayArea",
  "central valley": "centralValley",
  "sierra foothills": "sierraFoothills",
  "foothills": "sierraFoothills",
  "norcal": "norCal",
  "nor cal": "norCal",
  "northern california": "norCal",
  "northern ca": "norCal",
  "anywhere in norcal": "norCal",
  "socal": "soCal",
  "so cal": "soCal",
  "southern california": "soCal",
};

const NATIONWIDE = /\b(nation ?wide|anywhere|everywhere|all over|any market|all markets|all states|national|usa|united states|open)\b/i;
const IGNORE = new Set(["", "any", "other", "none", "n/a", "na", "tbd", "not sure", "all"]);

const clean = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[.()]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** "CA" | "california" | "Calif" → "CA"; anything else → null. */
function toStateAbbr(s) {
  const v = clean(s);
  if (!v) return null;
  if (v.length === 2 && STATES[v.toUpperCase()]) return v.toUpperCase();
  if (NAME_TO_ABBR[v]) return NAME_TO_ABBR[v];
  if (SQUASHED_TO_ABBR[v]) return SQUASHED_TO_ABBR[v];
  if (v === "calif") return "CA";
  return null;
}

/** "Sacramento County" → "sacramento" */
const normCounty = (s) => clean(s).replace(/\s+county$/, "");
const normCity = (s) => clean(s).replace(/^city of /, "");

/**
 * Parse one free-text location answer into structured targets.
 * Handles "Austin, TX" (city + state pair), comma/semicolon/"and" lists, state
 * names, known regions and "nationwide".
 */
function parseLocationText(text) {
  let raw = String(text || "").trim();
  if (!raw) return [];
  // "Anywhere in NorCal" / "anywhere in Texas" names a place, not the nation.
  const scoped = raw.match(/^anywhere (?:in|within|around) (.+)$/i);
  if (scoped) raw = scoped[1];
  if (NATIONWIDE.test(raw)) {
    // "nationwide" wins — any other names in the same answer add nothing.
    return [{ kind: "nationwide" }];
  }

  const tokens = raw
    .split(/[,;/|&\n]+|\band\b|\bor\b/i)
    .map((t) => t.trim())
    .filter((t) => !IGNORE.has(clean(t)));

  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const key = clean(tok);

    if (/^\d{5}$/.test(key)) {
      out.push({ kind: "zip", zip: key });
      continue;
    }

    const region = REGION_ALIASES[key];
    if (region) {
      out.push({ kind: "region", region, state: REGIONS[region].state });
      continue;
    }

    const st = toStateAbbr(key);
    if (st) {
      out.push({ kind: "state", state: st });
      continue;
    }

    // A place followed by a state inside one token: "Austin TX",
    // "Omaha Nebraska", "Erie County New York", "California Texas".
    const split = splitTrailingState(key);
    if (split) {
      out.push(...placeTargets(split.place, split.state));
      continue;
    }

    // A place followed by a state as the NEXT token ("Austin", "TX").
    const nextState = i + 1 < tokens.length ? toStateAbbr(tokens[i + 1]) : null;
    if (nextState) {
      out.push(...placeTargets(key, nextState));
      i++;
    } else {
      out.push(...placeTargets(key, null));
    }
  }
  return out;
}

/** "omaha nebraska" → { place: "omaha", state: "NE" }; null if no trailing state. */
function splitTrailingState(key) {
  const abbr = key.match(/^(.+?)\s+([a-z]{2})$/);
  if (abbr && STATES[abbr[2].toUpperCase()]) return { place: abbr[1], state: abbr[2].toUpperCase() };
  for (const name of STATE_NAMES_BY_LENGTH) {
    if (key.endsWith(` ${name}`)) {
      return { place: key.slice(0, -name.length).trim(), state: NAME_TO_ABBR[name] };
    }
  }
  return null;
}

// Every California county we group into regions — lets a bare "Contra Costa"
// be read as a county. ("nevada" is left out: it's a state first.)
const CA_COUNTIES = new Set(
  Object.values(REGIONS).flatMap((r) => r.counties).filter((c) => c !== "nevada")
);

/** Targets for a place name, optionally already tied to a state. */
function placeTargets(place, state) {
  // "California Texas", "New York New Jersey" → a list of states
  const states = [];
  let rest = place;
  while (rest) {
    const whole = toStateAbbr(rest);
    if (whole) {
      states.unshift(whole);
      rest = "";
      break;
    }
    const split = splitTrailingState(rest);
    if (!split) break;
    states.unshift(split.state);
    rest = split.place;
  }
  if (!rest && states.length) {
    return [...states, state].filter(Boolean).map((s) => ({ kind: "state", state: s }));
  }

  if (/ county$/.test(place)) {
    return [{ kind: "county", county: normCounty(place), state }];
  }
  if (!state && CA_COUNTIES.has(place)) {
    // "Sacramento" is a city AND a county — keep both readings.
    return [
      { kind: "city", city: normCity(place), state: null },
      { kind: "county", county: place, state: "CA" },
    ];
  }
  return [{ kind: "city", city: normCity(place), state }];
}

/** Human label for one location target (for the UI's "wants" line). */
function targetLabel(t) {
  if (t.kind === "nationwide") return "Nationwide";
  if (t.kind === "county") return `${titleCase(t.county)} County${t.state ? `, ${t.state}` : ""}`;
  if (t.kind === "zip") return t.zip;
  if (t.kind === "state") return STATES[t.state] ? titleCase(STATES[t.state]) : t.state;
  if (t.kind === "region") return REGIONS[t.region]?.label || t.region;
  if (t.kind === "city") return `${titleCase(t.city)}${t.state ? `, ${t.state}` : ""}`;
  return "";
}

const titleCase = (s) => String(s).replace(/\b\w/g, (c) => c.toUpperCase());

module.exports = {
  REGIONS,
  regionsForProperty,
  toStateAbbr,
  normCounty,
  normCity,
  parseLocationText,
  targetLabel,
};
