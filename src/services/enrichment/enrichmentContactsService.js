// services/enrichment/enrichmentContactsService.js
//
// CSV parsing and normalizing for the Enrichment Lists feature. Written
// fresh with papaparse — does NOT import parseContactsCsv from
// src/services/calling/vapiCampaignService.js or the non-exported
// normalizeRow from src/services/outbound/outboundContactsService.js (see
// enrich.md §5.1, "written fresh" note).
//
// Also home to effectiveContact(), the one function everything downstream
// (review table, the channel adapters, the research summary, email merge
// tags) uses to read a row's "current" value for a field — see enrich.md
// §4.3.

const Papa = require("papaparse");
const Errorhandler = require("../../utils/errorhandler");

// Same ceiling as the calling campaign and Outbound (decision #10). Not an
// env var — raising it is a deliberate code change.
const MAX_ROWS_CEILING = 500;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// One alias table drives all header matching, so adding a column name is a
// one-line change. The confirmed real SFR header comes first in each entry;
// the rest are fallbacks so a PropStream-shaped or lead-list-shaped file
// still works (enrich.md §5.3, §2.7).
const FIELD_ALIASES = {
  fullName: ["full name", "name"],
  firstName: ["first name"],
  lastName: ["last name"],
  company: ["company", "company name", "llc name", "entity name"],
  phones: ["phones", "phone", "phone number"],
  emails: ["emails", "email"],
  address: ["address", "street"],
  city: ["city"],
  state: ["state"],
  zip: ["zip code", "zip", "zipcode"],
  activeMarket: ["active market", "market"],
  contactType: ["contact type", "lead type", "owner type", "role"],
};

// Fields the admin can edit on a row, stored under `overrides`. Editing
// name/firstName/lastName/company/email marks the row's enrichment stale
// (enrich.md §7.4, applied by the caller in enrichmentListService).
const EDITABLE_FIELDS = [
  { key: "fullName", label: "Full name", type: "string" },
  { key: "firstName", label: "First name", type: "string" },
  { key: "lastName", label: "Last name", type: "string" },
  { key: "company", label: "Company", type: "string" },
  { key: "email", label: "Primary email", type: "email" },
  { key: "phones", label: "Phones", type: "string[]" },
  { key: "address", label: "Address", type: "string" },
  { key: "city", label: "City", type: "string" },
  { key: "state", label: "State", type: "string" },
  { key: "zip", label: "Zip", type: "string" },
  { key: "contactType", label: "Contact type", type: "enum" },
  { key: "jobTitle", label: "Job title", type: "string" },
  { key: "industry", label: "Industry", type: "string" },
  { key: "notes", label: "Notes", type: "string" },
];

const CONTACT_TYPE_VALUES = ["buyer", "seller", "llc_owner", "unknown"];

// Fields whose edit marks the row's enrichment stale — they're the identity
// fields the FullEnrich lookup was actually keyed on (enrich.md §7.4).
const STALE_TRIGGER_FIELDS = ["fullName", "firstName", "lastName", "company", "email"];

const normalizeHeaderKey = (key) =>
  String(key || "").trim().toLowerCase().replace(/\s+/g, " ");

// Lowercased, trimmed, internal whitespace collapsed to one space — the
// normalization used for both halves of the name+company dedupe key
// (enrich.md §4.1).
const normalizeText = (v) =>
  String(v || "").trim().toLowerCase().replace(/\s+/g, " ");

const isValidEmail = (raw) => {
  const trimmed = String(raw || "").trim().toLowerCase();
  return EMAIL_RE.test(trimmed) ? trimmed : null;
};

const splitMultiValue = (raw) =>
  String(raw || "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

const buildRowLookup = (row) => {
  const lookup = {};
  for (const [rawKey, value] of Object.entries(row || {})) {
    lookup[normalizeHeaderKey(rawKey)] = value;
  }
  return lookup;
};

const firstAliasValue = (lookup, aliases) => {
  for (const alias of aliases) {
    if (lookup[alias] !== undefined && lookup[alias] !== null && String(lookup[alias]).trim() !== "") {
      return String(lookup[alias]).trim();
    }
  }
  return "";
};

// First word is the first name, the rest is the last name
// ("Lakshmi Medapati" -> "Lakshmi" / "Medapati"). A one-word name gets no
// last name and can't use the name+company lookup (enrich.md §4.1, §5.3).
const splitFullName = (fullName) => {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
};

const inferContactType = (raw) => {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return "unknown";
  if (v.includes("buyer")) return "buyer";
  if (v.includes("seller")) return "seller";
  if (v.includes("llc") || v.includes("owner")) return "llc_owner";
  return "unknown";
};

const nameCompanyKey = (firstName, lastName, company) => {
  if (!firstName || !lastName || !company) return "";
  return `${normalizeText(`${firstName} ${lastName}`)}|${normalizeText(company)}`;
};

const firstValidEmail = (emails) => {
  for (const e of emails || []) {
    const v = isValidEmail(e);
    if (v) return v;
  }
  return "";
};

/**
 * Parses raw CSV text into normalized enrichment-list rows.
 *
 * @returns {{
 *   rows: Array<{ rowNumber, raw, csv, keys }>,
 *   skipped: Array<{ row, name, reason }>,
 *   total: number,
 *   noLookupKey: number,
 *   headersSeen: string[],
 *   headersUnmapped: string[],
 * }}
 */
const parseCsv = (csvData) => {
  if (typeof csvData !== "string" || !csvData.trim()) {
    throw new Errorhandler("csvData is required", 400);
  }

  const parsed = Papa.parse(csvData, { header: true, skipEmptyLines: true });
  const rawRows = parsed.data || [];

  if (rawRows.length === 0) {
    throw new Errorhandler("No rows found in CSV", 400);
  }

  // Which normalized headers appeared, and which of those we recognize.
  const headersSeen = new Set();
  (parsed.meta?.fields || []).forEach((h) => headersSeen.add(normalizeHeaderKey(h)));
  const mappedHeaders = new Set();
  Object.values(FIELD_ALIASES).forEach((aliases) => aliases.forEach((a) => mappedHeaders.add(a)));
  const headersUnmapped = [...headersSeen].filter((h) => !mappedHeaders.has(h));

  const skipped = [];
  const accepted = [];
  const seenNameCompany = new Set();
  const seenEmail = new Set();
  let noLookupKey = 0;

  rawRows.forEach((raw, idx) => {
    const rowNumber = idx + 1; // 1-based data row, header line not counted
    const lookup = buildRowLookup(raw);

    const fullNameCol = firstAliasValue(lookup, FIELD_ALIASES.fullName);
    let firstName = firstAliasValue(lookup, FIELD_ALIASES.firstName);
    let lastName = firstAliasValue(lookup, FIELD_ALIASES.lastName);
    let fullName = fullNameCol;

    if (firstName || lastName) {
      // Explicit first/last columns win; build a full name from them if
      // there's no full-name column.
      if (!fullName) fullName = [firstName, lastName].filter(Boolean).join(" ");
    } else if (fullName) {
      ({ firstName, lastName } = splitFullName(fullName));
    }

    const company = firstAliasValue(lookup, FIELD_ALIASES.company);
    const phones = splitMultiValue(firstAliasValue(lookup, FIELD_ALIASES.phones));
    const emails = splitMultiValue(firstAliasValue(lookup, FIELD_ALIASES.emails)).map((e) =>
      e.toLowerCase()
    );
    const address = firstAliasValue(lookup, FIELD_ALIASES.address);
    const city = firstAliasValue(lookup, FIELD_ALIASES.city);
    const state = firstAliasValue(lookup, FIELD_ALIASES.state);
    const zip = firstAliasValue(lookup, FIELD_ALIASES.zip);
    const activeMarket = firstAliasValue(lookup, FIELD_ALIASES.activeMarket);
    const contactType = inferContactType(firstAliasValue(lookup, FIELD_ALIASES.contactType));

    if (!fullName && phones.length === 0 && emails.length === 0) {
      skipped.push({ row: rowNumber, name: "", reason: "no name, phone, or email" });
      return;
    }

    const keys = {
      nameCompany: nameCompanyKey(firstName, lastName, company),
      email: firstValidEmail(emails),
    };

    if (keys.nameCompany) {
      if (seenNameCompany.has(keys.nameCompany)) {
        skipped.push({ row: rowNumber, name: fullName, reason: "duplicate within this file" });
        return;
      }
      seenNameCompany.add(keys.nameCompany);
    } else if (keys.email) {
      if (seenEmail.has(keys.email)) {
        skipped.push({ row: rowNumber, name: fullName, reason: "duplicate within this file" });
        return;
      }
      seenEmail.add(keys.email);
    }

    if (!keys.nameCompany && !keys.email) noLookupKey += 1;

    accepted.push({
      rowNumber,
      raw,
      csv: {
        fullName,
        firstName,
        lastName,
        company,
        address,
        city,
        state,
        zip,
        activeMarket,
        contactType,
        phones,
        emails,
      },
      keys,
    });
  });

  if (accepted.length === 0) {
    throw new Errorhandler("CSV parsed but no usable rows were found", 400);
  }

  if (accepted.length > MAX_ROWS_CEILING) {
    throw new Errorhandler(
      `Enrichment lists are capped at ${MAX_ROWS_CEILING} rows (received ${accepted.length})`,
      400
    );
  }

  return {
    rows: accepted,
    skipped,
    total: accepted.length,
    noLookupKey,
    headersSeen: [...headersSeen],
    headersUnmapped,
  };
};

/**
 * Computes the "effective" value of every editable field for a row, using
 * the admin's overrides where set, otherwise the CSV value, otherwise
 * FullEnrich's summary (enrich.md §4.3). `person` is the row's linked
 * enrichedPersonModel doc (or null — Phase 1 rows have no lookup yet).
 *
 * CSV wins over FullEnrich wherever both have a value (decision #12).
 * Email is the one field that's additive rather than either/or: CSV emails
 * first, then FullEnrich's found email appended if new.
 */
const effectiveContact = (row, person) => {
  const overrides = row.overrides || {};
  const csv = row.csv || {};
  const summary = person?.summary || {};

  const pick = (field, csvValue, enrichedValue) => {
    if (overrides[field] !== undefined && overrides[field] !== null) return overrides[field];
    if (csvValue !== undefined && csvValue !== null && csvValue !== "") return csvValue;
    return enrichedValue !== undefined ? enrichedValue : "";
  };

  const csvEmails = csv.emails || [];
  const enrichedEmails = (summary.emails || []).filter((e) => !csvEmails.includes(e));
  const allEmails = [...csvEmails, ...enrichedEmails];
  const email =
    overrides.email !== undefined && overrides.email !== null
      ? overrides.email
      : allEmails[0] || "";

  return {
    fullName: pick("fullName", csv.fullName, ""),
    firstName: pick("firstName", csv.firstName, ""),
    lastName: pick("lastName", csv.lastName, ""),
    company: pick("company", csv.company, summary.companyName),
    email,
    emails: allEmails,
    phones: overrides.phones !== undefined && overrides.phones !== null ? overrides.phones : csv.phones || [],
    address: pick("address", csv.address, ""),
    city: pick("city", csv.city, ""),
    state: pick("state", csv.state, ""),
    zip: pick("zip", csv.zip, ""),
    contactType: pick("contactType", csv.contactType, ""),
    activeMarket: csv.activeMarket || "",
    jobTitle: pick("jobTitle", "", summary.jobTitle),
    industry: pick("industry", "", summary.industry),
    linkedinUrl: summary.linkedinUrl || "",
    notes: overrides.notes || "",
  };
};

/**
 * Validates a PATCH .../rows/:rowId body's `overrides` against the editable
 * field whitelist. Throws a 400 Errorhandler on an unknown key or a bad
 * email. Returns the patch unchanged (Mongoose stores raw strings/arrays as
 * given) — the caller decides whether this patch touches a stale-trigger
 * field.
 */
const validateOverrides = (overrides) => {
  if (overrides === undefined || overrides === null) return {};
  if (typeof overrides !== "object" || Array.isArray(overrides)) {
    throw new Errorhandler("overrides must be an object", 400);
  }

  const allowedKeys = new Set(EDITABLE_FIELDS.map((f) => f.key));
  for (const key of Object.keys(overrides)) {
    if (!allowedKeys.has(key)) {
      throw new Errorhandler(`"${key}" is not an editable field`, 400);
    }
    const value = overrides[key];
    if (value === null) continue; // null clears the override
    if (key === "email" && value !== "" && !isValidEmail(value)) {
      throw new Errorhandler("email override is not a valid email address", 400);
    }
    if (key === "contactType" && !CONTACT_TYPE_VALUES.includes(value)) {
      throw new Errorhandler(`contactType must be one of ${CONTACT_TYPE_VALUES.join(", ")}`, 400);
    }
    if (key === "phones" && !Array.isArray(value)) {
      throw new Errorhandler("phones override must be an array of strings", 400);
    }
  }

  return overrides;
};

module.exports = {
  MAX_ROWS_CEILING,
  EDITABLE_FIELDS,
  STALE_TRIGGER_FIELDS,
  CONTACT_TYPE_VALUES,
  isValidEmail,
  parseCsv,
  effectiveContact,
  validateOverrides,
};
