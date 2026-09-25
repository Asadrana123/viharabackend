// services/outbound/outboundContactsService.js
//
// Parses and normalizes contacts for an outbound campaign — either a CSV
// upload or a single manually-entered contact. Both go through the same
// normalizer (normalizeRow) so there's exactly one validation code path.
//
// Written fresh with papaparse (already a dependency, used by the calling
// campaign service). Does NOT import anything from
// src/services/calling/vapiCampaignService.js — the outbound feature is a
// separate build from the calling path (see outboundplan.md, hard
// constraint).

const Papa = require("papaparse");
const Errorhandler = require("../../utils/errorhandler");
const { toUsSmsNumber } = require("../../utils/usPhone");

// Single hard ceiling shared by SMS and email (outboundplan.md §11 #12,
// follow-up correction: NOT split per channel). The admin sets a lower
// `maxContacts` per campaign under this; raising the ceiling itself is a
// deliberate code change, not an env var.
const MAX_CONTACTS_CEILING = 500;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NAME_ALIASES = ["full name", "name", "first name"];
const PHONE_ALIASES = ["phone", "phones", "phone number"];
const EMAIL_ALIASES = ["email", "emails"];

const normalizeHeaderKey = (key) =>
  String(key || "").trim().toLowerCase().replace(/\s+/g, " ");

// Some CSV exports (PropStream, generic lead-list exports) put more than one
// phone/email in a single cell, pipe-separated. Take the first candidate that
// actually validates.
const firstValid = (raw, validate) => {
  if (!raw) return null;
  const candidates = String(raw).split("|").map((s) => s.trim()).filter(Boolean);
  for (const c of candidates) {
    const v = validate(c);
    if (v) return v;
  }
  return null;
};

const isValidEmail = (raw) => {
  const trimmed = String(raw || "").trim().toLowerCase();
  return EMAIL_RE.test(trimmed) ? trimmed : null;
};

/**
 * Throws a 400 Errorhandler unless maxContacts is a positive integer no
 * greater than the shared ceiling. Returns the validated integer.
 */
const validateMaxContacts = (maxContacts) => {
  const n = Number(maxContacts);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Errorhandler("maxContacts is required and must be a positive integer", 400);
  }
  if (n > MAX_CONTACTS_CEILING) {
    throw new Errorhandler(
      `Max contacts per campaign is ${MAX_CONTACTS_CEILING}; you asked for ${n}`,
      400
    );
  }
  return n;
};

// Builds a lookup from normalized header name -> raw row value, so a row
// object with arbitrary header casing/spacing can be read by canonical key.
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
      return lookup[alias];
    }
  }
  return "";
};

/**
 * Normalizes one raw row (from CSV or a single-contact form) into
 * { name, phone, email, ok, reason }. `channel` decides what's required:
 *   sms   -> both a phone that passes toUsSmsNumber AND a valid email
 *   email -> a valid email only
 */
const normalizeRow = (raw, channel) => {
  const lookup = buildRowLookup(raw);
  const name = String(firstAliasValue(lookup, NAME_ALIASES) || "").trim();
  const phoneRaw = firstAliasValue(lookup, PHONE_ALIASES);
  const emailRaw = firstAliasValue(lookup, EMAIL_ALIASES);

  const phone = firstValid(phoneRaw, toUsSmsNumber);
  const email = firstValid(emailRaw, isValidEmail);

  if (channel === "sms") {
    const missing = [];
    if (!phone) missing.push("valid US phone");
    if (!email) missing.push("email");
    if (missing.length) {
      return { name, phone: phone || "", email: email || "", ok: false, reason: `missing ${missing.join(" and ")}` };
    }
    return { name, phone, email, ok: true, reason: "" };
  }

  // channel === "email"
  if (!email) {
    return { name, phone: phone || "", email: "", ok: false, reason: "missing valid email" };
  }
  return { name, phone: phone || "", email, ok: true, reason: "" };
};

/**
 * Parses and validates contacts for a campaign. Exactly one of `csvData` /
 * `contact` should be given (CSV mode vs. single-contact mode) — both flow
 * through normalizeRow.
 *
 * @param {Object} params
 * @param {"sms"|"email"} params.channel
 * @param {string} [params.csvData] - raw CSV text (posted as JSON, not multipart)
 * @param {Object} [params.contact] - a single manually-entered contact row
 * @param {number} [params.maxContacts] - if given, flags overLimit when the
 *   ready count exceeds it. Contacts are never silently truncated — the
 *   caller decides what to do with overLimit (reject the launch).
 * @returns {{ contacts: Array, skipped: Array<{row:number,name:string,reason:string}>, total: number, overLimit: boolean }}
 */
const parseContacts = ({ channel, csvData, contact, maxContacts }) => {
  if (channel !== "sms" && channel !== "email") {
    throw new Errorhandler('channel must be "sms" or "email"', 400);
  }

  const skipped = [];
  const rawRows = [];

  if (contact && typeof contact === "object") {
    rawRows.push(contact);
  } else if (typeof csvData === "string" && csvData.trim()) {
    const parsed = Papa.parse(csvData, { header: true, skipEmptyLines: true });
    (parsed.data || []).forEach((row) => rawRows.push(row));
  } else {
    throw new Errorhandler("Provide either csvData or contact", 400);
  }

  const accepted = [];
  const seenPhones = new Set();
  const seenEmails = new Set();

  rawRows.forEach((raw, idx) => {
    const rowNum = idx + 1; // 1-based data row, header line not counted
    const { name, phone, email, ok, reason } = normalizeRow(raw, channel);

    if (!ok) {
      skipped.push({ row: rowNum, name, reason });
      return;
    }

    // De-dup within this batch only: by normalized phone for SMS, by
    // lowercased email for Email.
    const dedupeKey = channel === "sms" ? phone : email;
    const seenSet = channel === "sms" ? seenPhones : seenEmails;
    if (seenSet.has(dedupeKey)) {
      skipped.push({ row: rowNum, name, reason: "duplicate within this list" });
      return;
    }
    seenSet.add(dedupeKey);
    if (phone) seenPhones.add(phone);
    if (email) seenEmails.add(email);

    accepted.push({ name, phone, email });
  });

  const total = accepted.length;
  const overLimit = typeof maxContacts === "number" && total > maxContacts;

  return { contacts: accepted, skipped, total, overLimit };
};

module.exports = {
  MAX_CONTACTS_CEILING,
  validateMaxContacts,
  parseContacts,
};
