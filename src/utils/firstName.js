// utils/firstName.js
//
// Picks the name to greet someone by in a text ("Hi Steve"), from whatever the
// lead form or a CRM import gave us. Returns "" when no safe name can be found,
// so callers can drop the name instead of greeting someone with junk.
//
//   "Steve Rogers"           -> "Steve"
//   "Dr. Steve Rogers"       -> "Steve"        (leading titles skipped)
//   "Dr. Rogers"             -> "Dr. Rogers"   (title plus last name only)
//   "J. Michael Smith"       -> "Michael"      (leading initials skipped)
//   "J. Smith"               -> ""             (no first name to use)
//   "Rogers, Steve"          -> "Steve"        ("Last, First")
//   "STEVE ROGERS"           -> "Steve"        (single-case names re-cased)
//   "Steve & Peggy Rogers"   -> "Steve"
//   "Mr. and Mrs. Smith"     -> ""
//   "Rogers Holdings LLC"    -> ""             (business names)
//   "steve@mail.com", "555-1234", "N/A" -> ""

const TITLES = new Set([
  "mr", "mrs", "ms", "miss", "mx", "dr", "prof", "professor", "sir", "madam", "madame",
  "mme", "mlle", "rev", "reverend", "fr", "father", "pastor", "rabbi", "imam", "hon",
  "honorable", "judge", "capt", "captain", "col", "colonel", "maj", "major", "lt",
  "sgt", "sergeant", "gen", "general", "cpl", "pvt", "adm", "cmdr", "atty", "attorney",
]);

// Titles that are written with a trailing period ("Dr.", "Mrs.").
const ABBREVIATED_TITLES = new Set([
  "mr", "mrs", "ms", "dr", "prof", "rev", "hon", "capt", "col", "maj", "lt",
  "sgt", "gen", "fr", "atty", "cpl", "pvt", "adm", "cmdr",
]);

const BUSINESS_WORDS = new Set([
  "llc", "llp", "lp", "pllc", "inc", "incorporated", "corp", "corporation", "ltd",
  "limited", "company", "trust", "holdings", "holding", "realty", "properties",
  "investments", "capital", "ventures", "enterprises", "associates", "partners",
  "partnership", "group", "fund", "bank", "homes", "development", "management",
  "solutions", "services", "construction", "church", "foundation",
]);

const PLACEHOLDERS = new Set([
  "na", "unknown", "none", "null", "undefined", "anonymous", "guest", "customer",
  "user", "lead", "homeowner", "owner", "buyer", "seller", "investor", "resident",
  "occupant",
]);

const MAX_NAME_LENGTH = 25;

// Lowercase, letters only: "L.L.C." -> "llc", "Dr." -> "dr".
const norm = (t) => t.toLowerCase().replace(/[^\p{L}]/gu, "");

// "J", "J." or "J.R." (cased letters only, so a one-character name like "李" is not an initial)
const isInitial = (t) => /^[\p{Lu}\p{Ll}]\.?$/u.test(t) || /^(?:[\p{Lu}\p{Ll}]\.){2,}$/u.test(t);

const isConjunction = (t) => /^(?:&|and|y|et)$/i.test(t);

// Trim punctuation off both ends; reject anything with digits or no letters.
function cleanWord(token) {
  if (/\d/.test(token)) return "";
  const w = token.replace(/^[^\p{L}]+/u, "").replace(/[^\p{L}]+$/u, "");
  if (!w || w.length > MAX_NAME_LENGTH) return "";
  // All caps or all lowercase ("STEVE", "o'brien") -> proper case, keeping
  // hyphens and apostrophes ("Mary-Jane", "O'Brien"). Mixed case ("DeShawn") is left alone.
  if (w.length > 1 && (w === w.toUpperCase() || w === w.toLowerCase())) {
    return w.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (_, p, c) => p + c.toUpperCase());
  }
  return w;
}

function formatTitle(token) {
  const key = norm(token);
  const word = key.charAt(0).toUpperCase() + key.slice(1);
  return ABBREVIATED_TITLES.has(key) ? `${word}.` : word;
}

function firstNameOf(name) {
  let tokens = String(name == null ? "" : name).trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return "";

  // An email address or a business name is not a person to say "Hi" to.
  if (tokens.some((t) => t.includes("@"))) return "";
  if (tokens.some((t) => BUSINESS_WORDS.has(norm(t)))) return "";

  // "Rogers, Steve" -> read it as "Last, First". (A comma after a later word,
  // as in "Steve Rogers, Jr.", is just a suffix and is ignored.)
  let lastFirst = false;
  if (tokens.length > 1 && tokens[0].endsWith(",")) {
    tokens = tokens.slice(1);
    lastFirst = true;
  }

  // Skip leading titles ("Dr.", "Mrs") and initials ("J.").
  let title = "";
  let skippedInitial = false;
  let i = 0;
  while (i < tokens.length) {
    if (TITLES.has(norm(tokens[i]))) {
      if (!title) title = tokens[i];
      i += 1;
    } else if (isInitial(tokens[i])) {
      skippedInitial = true;
      i += 1;
    } else {
      break;
    }
  }

  const rest = tokens.slice(i);
  if (!rest.length) return "";
  if (isConjunction(rest[0])) return ""; // "Mr. and Mrs. Smith"

  const word = cleanWord(rest[0]);
  if (!word || PLACEHOLDERS.has(norm(word))) return "";

  if (rest.length === 1 && !lastFirst) {
    // Only one word is left. With a title it is a last name ("Dr. Rogers", greet
    // as written); with only an initial ("J. Smith") there is no first name.
    if (title) return `${formatTitle(title)} ${word}`;
    if (skippedInitial) return "";
  }
  return word;
}

module.exports = { firstNameOf };
