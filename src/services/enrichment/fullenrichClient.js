// services/enrichment/fullenrichClient.js
//
// FullEnrich API client for the Enrichment Lists feature. Separate from
// src/services/shared/fullenrichService.js, which is left byte-for-byte as
// is (decision #5, enrich.md §5.4).
//
// Two lookup methods, confirmed live against the real API on 2026-09-26
// (enrich.md §2.9):
//   - enrichByNameCompany: the primary path — POST /contact/enrich/bulk,
//     up to 100 contacts/request, keyed by first/last name + company.
//   - lookupByEmail: the fallback path — the same reverse-email endpoint
//     shared/fullenrichService.js already uses, one email at a time (its
//     proven batch size), for the rare row that has an email but no usable
//     name + company.
//
// Both submit/poll pairs return a uniform outcome per contact instead of
// collapsing every failure mode to null: { ref, outcome: "found" |
// "not_found" | "failed", workEmail, workEmailStatus, emails, result,
// error }. Neither function throws on a per-contact problem — only on a
// request-level failure (bad API key, network error, etc.), which the
// caller (enrichmentJobService) catches per batch.

const axios = require("axios");

const FULLENRICH_API_KEY = process.env.FULLENRICH_API_KEY;
const BASE_URL = "https://app.fullenrich.com/api/v2";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const authHeaders = () => ({
  Authorization: `Bearer ${FULLENRICH_API_KEY}`,
  "Content-Type": "application/json",
});

// Retries once on a 429, waiting for the response's retry-after-shaped
// message if there is one, else 30s (enrich.md §5.4). Any other error, or a
// second 429, is rethrown for the caller to handle per batch.
const withRateLimitRetry = async (fn) => {
  try {
    return await fn();
  } catch (err) {
    if (err.response?.status !== 429) throw err;
    const waitMs = 30000;
    console.warn(`[fullenrichClient] 429 rate limited, waiting ${waitMs}ms and retrying once`);
    await delay(waitMs);
    return fn();
  }
};

// ─── Primary: name + company bulk ──────────────────────────────────────────

/**
 * @param {Array<{ref, firstName, lastName, companyName}>} contacts
 * @param {string} label - shown in FullEnrich's dashboard
 * @returns {Promise<string>} enrichment_id
 */
const submitNameCompanyBatch = async (contacts, label) => {
  if (!FULLENRICH_API_KEY) throw new Error("FULLENRICH_API_KEY is not set");

  const data = contacts.map((c) => ({
    first_name: c.firstName,
    last_name: c.lastName,
    company_name: c.companyName,
    enrich_fields: ["contact.work_emails"],
    custom: { ref: String(c.ref) },
  }));

  const res = await withRateLimitRetry(() =>
    axios.post(
      `${BASE_URL}/contact/enrich/bulk?silentFail=true`,
      { name: label, data },
      { headers: authHeaders() }
    )
  );

  const enrichmentId = res.data?.enrichment_id;
  if (!enrichmentId) throw new Error("FullEnrich submit returned no enrichment_id");
  return enrichmentId;
};

/**
 * Polls once. Returns { done: false } while in progress, or
 * { done: true, results: Map<ref, outcome> } once finished (or given up on).
 */
const pollNameCompanyBatch = async (enrichmentId) => {
  const res = await withRateLimitRetry(() =>
    axios.get(`${BASE_URL}/contact/enrich/bulk/${enrichmentId}`, { headers: authHeaders() })
  );

  const status = res.data?.status;
  if (status === "IN_PROGRESS" || status === "PENDING" || status === "PROCESSING") {
    return { done: false };
  }

  const results = new Map();

  if (status === "FINISHED") {
    for (const entry of res.data?.data || []) {
      const ref = entry.custom?.ref;
      if (!ref) continue;
      const contactInfo = entry.contact_info || {};
      const workEmailObj = contactInfo.most_probable_work_email;
      if (workEmailObj?.email) {
        results.set(ref, {
          outcome: "found",
          workEmail: workEmailObj.email,
          workEmailStatus: workEmailObj.status || "",
          emails: (contactInfo.work_emails || []).map((e) => e.email).filter(Boolean),
          result: entry,
          error: "",
        });
      } else {
        results.set(ref, {
          outcome: "not_found",
          workEmail: "",
          workEmailStatus: "",
          emails: [],
          result: entry,
          error: "",
        });
      }
    }
  } else {
    // Unexpected terminal status (e.g. a batch-level FAILED) — caller fills
    // in "failed" for every ref it submitted that isn't in this map.
  }

  return { done: true, status, results };
};

// ─── Fallback: reverse email, one at a time (matches the shared client's
// proven batch size — enrich.md §5.4) ───────────────────────────────────────

const submitEmailLookup = async (ref, email, label) => {
  if (!FULLENRICH_API_KEY) throw new Error("FULLENRICH_API_KEY is not set");

  const res = await withRateLimitRetry(() =>
    axios.post(
      `${BASE_URL}/contact/reverse/email/bulk`,
      { name: label, data: [{ email, custom: { ref: String(ref) } }] },
      { headers: authHeaders() }
    )
  );

  const enrichmentId = res.data?.enrichment_id;
  if (!enrichmentId) throw new Error("FullEnrich submit returned no enrichment_id");
  return enrichmentId;
};

const pollEmailLookup = async (enrichmentId, ref) => {
  const res = await withRateLimitRetry(() =>
    axios.get(`${BASE_URL}/contact/reverse/email/bulk/${enrichmentId}`, { headers: authHeaders() })
  );

  const status = res.data?.status;
  if (status !== "FINISHED" && status !== "FAILED") return { done: false };

  const results = new Map();
  const profile = res.data?.data?.[0]?.profile || null;

  if (status === "FINISHED" && profile) {
    results.set(ref, {
      outcome: "found",
      workEmail: "",
      workEmailStatus: "",
      emails: [],
      profile,
      result: res.data,
      error: "",
    });
  } else if (status === "FINISHED") {
    results.set(ref, {
      outcome: "not_found",
      workEmail: "",
      workEmailStatus: "",
      emails: [],
      profile: null,
      result: res.data,
      error: "",
    });
  }
  // status === "FAILED": leave out of the map; caller fills in "failed".

  return { done: true, status, results };
};

module.exports = {
  submitNameCompanyBatch,
  pollNameCompanyBatch,
  submitEmailLookup,
  pollEmailLookup,
};
