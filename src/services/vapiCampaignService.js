const Papa = require("papaparse");
const crypto = require("crypto");
const { enrichPerson, buildResearchSummary } = require("./fullenrichService");
const { parsePhones, dispatchCall } = require("./vapiService");

// ─── Config ───────────────────────────────────────────────────────────────────
const JOB_TTL_MS = 24 * 60 * 60 * 1000; // keep finished jobs queryable for 24h
const DELAY_BETWEEN_CALLS_MS = 2000;    // gap between phones of same contact
const DELAY_BETWEEN_CONTACTS_MS = 6000; // gap between contacts
const MAX_CONTACTS_PER_CAMPAIGN = 500;

// In-memory job store. Lost on process restart — acceptable for admin-triggered
// campaigns. Move to Mongo if the API ever runs on more than one instance.
const CAMPAIGN_JOBS = new Map();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Contact normalisation ────────────────────────────────────────────────────

/**
 * Normalise a raw contact (from CSV row or admin form) into the shape
 * dispatchCall expects. Phones are accepted either as a pipe-delimited
 * string or as an already-parsed array.
 */
const buildContact = (raw = {}) => ({
  fullName: (raw.fullName || "").trim(),
  address: (raw.address || "").trim(),
  city: (raw.city || "").trim(),
  state: (raw.state || "").trim(),
  zip: (raw.zip || "").trim(),
  email: (raw.email || "").trim() || null,
  phones: Array.isArray(raw.phones) ? raw.phones : parsePhones(raw.phones),
});

/**
 * Parse a PropStream-style CSV export into normalised contacts.
 * Throws if the payload contains no usable rows.
 */
const parseContactsCsv = (csvData) => {
  const parsed = Papa.parse(csvData, { header: true, skipEmptyLines: true });

  if (!parsed.data || parsed.data.length === 0) {
    throw new Error("No contacts found in CSV");
  }

  const contacts = parsed.data
    .map((row) =>
      buildContact({
        fullName: row["Full Name"],
        address: row["Address"],
        city: row["City"],
        state: row["State"],
        zip: row["Zip Code"],
        phones: row["Phones"],
        email: row["Emails"] ? row["Emails"].split("|")[0] : null,
      })
    )
    .filter((c) => c.fullName);

  if (contacts.length === 0) {
    throw new Error("CSV parsed but no rows contained a 'Full Name' value");
  }

  if (contacts.length > MAX_CONTACTS_PER_CAMPAIGN) {
    throw new Error(
      `Campaign exceeds the ${MAX_CONTACTS_PER_CAMPAIGN} contact limit (received ${contacts.length})`
    );
  }

  return contacts;
};

// ─── Enrichment ───────────────────────────────────────────────────────────────

/**
 * Enrichment is best-effort — a FullEnrich failure must never abort a call.
 */
const safeResearchSummary = async (contact, enrich) => {
  if (!enrich) return "";
  try {
    const enrichment = await enrichPerson(contact);
    return buildResearchSummary(contact, enrichment);
  } catch (err) {
    console.error(`⚠️  Enrichment failed for ${contact.fullName}:`, err.message);
    return "";
  }
};

// ─── Single call ──────────────────────────────────────────────────────────────

/**
 * Dispatch calls for one contact immediately and return the outcome.
 * Used by the admin "call one person" form.
 */
const runSingleCall = async (rawContact, { enrich = true } = {}) => {
  const contact = buildContact(rawContact);
  const researchSummary = await safeResearchSummary(contact, enrich);

  const calls = [];
  for (let i = 0; i < contact.phones.length; i++) {
    calls.push(await dispatchCall(contact.phones[i], contact, researchSummary));
    if (i < contact.phones.length - 1) await delay(DELAY_BETWEEN_CALLS_MS);
  }

  return {
    name: contact.fullName,
    enriched: Boolean(researchSummary),
    calls,
  };
};

// ─── Campaign jobs ────────────────────────────────────────────────────────────

const pruneExpiredJobs = () => {
  const now = Date.now();
  for (const [id, job] of CAMPAIGN_JOBS.entries()) {
    if (now - job.createdAtMs > JOB_TTL_MS) CAMPAIGN_JOBS.delete(id);
  }
};

/**
 * Register a campaign job. Does NOT start it — call runCampaign(jobId) after
 * the HTTP response has been sent.
 */
const createCampaign = (contacts, { enrich = true } = {}) => {
  pruneExpiredJobs();

  const id = crypto.randomUUID();
  const job = {
    id,
    status: "queued", // queued | running | completed | failed
    enrich,
    total: contacts.length,
    processed: 0,
    dispatched: 0,
    skipped: 0,
    failed: 0,
    currentContact: null,
    results: [],
    error: null,
    createdAt: new Date().toISOString(),
    createdAtMs: Date.now(),
    finishedAt: null,
    _contacts: contacts, // internal — never serialised to the client
  };

  CAMPAIGN_JOBS.set(id, job);
  return job;
};

/**
 * Background worker. Intentionally not awaited by the controller.
 */
const runCampaign = async (jobId) => {
  const job = CAMPAIGN_JOBS.get(jobId);
  if (!job || job.status !== "queued") return;

  job.status = "running";

  try {
    for (const contact of job._contacts) {
      job.currentContact = contact.fullName;

      if (!contact.phones.length) {
        job.skipped += 1;
        job.processed += 1;
        job.results.push({
          name: contact.fullName,
          status: "skipped",
          reason: "no valid phone numbers",
          calls: [],
        });
        continue;
      }

      const researchSummary = await safeResearchSummary(contact, job.enrich);

      const calls = [];
      for (const phone of contact.phones) {
        calls.push(await dispatchCall(phone, contact, researchSummary));
        await delay(DELAY_BETWEEN_CALLS_MS);
      }

      const anySuccess = calls.some((c) => c.success);
      if (anySuccess) job.dispatched += 1;
      else job.failed += 1;

      job.processed += 1;
      job.results.push({
        name: contact.fullName,
        status: anySuccess ? "dispatched" : "failed",
        enriched: Boolean(researchSummary),
        calls,
      });

      await delay(DELAY_BETWEEN_CONTACTS_MS);
    }

    job.status = "completed";
  } catch (err) {
    console.error(`❌ Campaign ${jobId} aborted:`, err);
    job.status = "failed";
    job.error = err.message;
  } finally {
    job.currentContact = null;
    job.finishedAt = new Date().toISOString();
    delete job._contacts;
  }
};

/**
 * Client-safe view of a job.
 */
const getCampaign = (jobId) => {
  const job = CAMPAIGN_JOBS.get(jobId);
  if (!job) return null;

  const { _contacts, createdAtMs, ...safe } = job;
  return {
    ...safe,
    progress: job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0,
  };
};

module.exports = {
  buildContact,
  parseContactsCsv,
  runSingleCall,
  createCampaign,
  runCampaign,
  getCampaign,
  MAX_CONTACTS_PER_CAMPAIGN,
};