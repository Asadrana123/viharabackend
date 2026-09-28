// services/enrichment/enrichmentJobService.js
//
// The background enrichment job — see enrich.md §5.5. State lives in Mongo
// (the list + row + enrichedPerson documents themselves), not an in-memory
// Map, so a redeploy mid-run can be resumed instead of losing progress or
// paying FullEnrich twice.
//
// Flow per pass: for every "pending" row, first check the shared
// enrichedPerson store (reuse a result already paid for — no FullEnrich
// call); otherwise atomically claim it (so two lists enriching the same
// person at once only pay once) and submit claimed rows in batches of up to
// 100 to FullEnrich's name+company endpoint (or, for the rare row with an
// email but no usable name+company, the reverse-email fallback, one at a
// time). Poll every 10s until every batch finishes or the 30-minute cap
// is hit.

const EnrichmentList = require("../../model/enrichment/enrichmentListModel");
const EnrichmentListRow = require("../../model/enrichment/enrichmentListRowModel");
const EnrichedPerson = require("../../model/enrichment/enrichedPersonModel");
const fullenrichClient = require("./fullenrichClient");

const BATCH_SIZE = 100;
const POLL_MS = 10 * 1000;
const HARD_STOP_MS = 30 * 60 * 1000; // per pass, matches enrich.md §5.4's 30-minute cap
const CLAIM_STALE_MS = 10 * 60 * 1000; // same threshold as list-level stale detection

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// ─── Store lookups ──────────────────────────────────────────────────────────

/** Finds an existing enrichedPerson for a row, by name+company first, then email (enrich.md §4.1). */
const resolveExisting = async (row) => {
  if (row.keys?.nameCompany) {
    const person = await EnrichedPerson.findOne({ dedupeKey: row.keys.nameCompany });
    if (person) return person;
  }
  if (row.keys?.email) {
    const person = await EnrichedPerson.findOne({
      $or: [{ lookupEmail: row.keys.email }, { knownEmails: row.keys.email }],
    });
    if (person) return person;
  }
  return null;
};

/**
 * Atomically claims a person record for lookup: upserts with status
 * "pending" using a filter that excludes an already-pending record, so the
 * unique index on dedupeKey/lookupEmail turns a concurrent claim attempt
 * into a duplicate-key error instead of a second paid lookup. Returns the
 * claimed doc, or null if someone else holds it.
 */
const tryClaim = async (row) => {
  const isNameCompany = Boolean(row.keys?.nameCompany);
  const filter = isNameCompany
    ? { dedupeKey: row.keys.nameCompany, status: { $ne: "pending" } }
    : { lookupEmail: row.keys.email, status: { $ne: "pending" } };
  const setOnInsert = isNameCompany
    ? {
        dedupeKey: row.keys.nameCompany,
        lookupMethod: "name_company",
        lookupInput: {
          firstName: row.csv?.firstName || "",
          lastName: row.csv?.lastName || "",
          companyName: row.csv?.company || "",
        },
        firstSeenListId: row.listId,
      }
    : {
        lookupEmail: row.keys.email,
        lookupMethod: "email",
        lookupInput: { email: row.keys.email },
        firstSeenListId: row.listId,
      };

  try {
    return await EnrichedPerson.findOneAndUpdate(
      filter,
      { $set: { status: "pending" }, $setOnInsert: setOnInsert },
      { upsert: true, new: true }
    );
  } catch (err) {
    if (err.code === 11000) return null; // already claimed elsewhere
    throw err;
  }
};

// ─── Per-row / per-list bookkeeping ─────────────────────────────────────────

const ROW_STATUS_BY_OUTCOME = { found: "enriched", not_found: "not_found", failed: "failed" };
const LIST_COUNT_BY_OUTCOME = { found: "enriched", not_found: "notFound", failed: "failed" };

/** Marks a row against an already-resolved person (reuse path — no FullEnrich call). */
const linkReusedRow = async (row, person) => {
  const rowStatus = person.status === "found" ? "reused" : person.status === "not_found" ? "not_found" : "failed";
  const listCount = person.status === "found" ? "reused" : person.status === "not_found" ? "notFound" : "failed";

  await EnrichmentListRow.updateOne(
    { _id: row._id },
    {
      $set: {
        "enrichment.status": rowStatus,
        "enrichment.method": person.lookupMethod,
        "enrichment.personId": person._id,
        "enrichment.providerRequestId": "",
        "enrichment.error": person.status === "failed" ? person.error || "" : "",
        "enrichment.processedAt": new Date(),
      },
    }
  );
  await EnrichmentList.updateOne(
    { _id: row.listId },
    { $inc: { "counts.processed": 1, [`counts.${listCount}`]: 1 } }
  );
};

/** Marks a row + its enrichedPerson from a fresh FullEnrich outcome. */
const applyOutcome = async (row, person, outcome) => {
  const summary = {
    workEmail: outcome.workEmail || "",
    workEmailStatus: outcome.workEmailStatus || "",
    emails: outcome.emails || [],
    jobTitle: outcome.profile?.employment?.current?.title || "",
    companyName: outcome.profile?.employment?.current?.company?.name || "",
    industry: outcome.profile?.employment?.current?.company?.industry?.main_industry || "",
    linkedinUrl: outcome.profile?.linkedin_url || "",
  };
  const knownEmails = [...new Set([...(outcome.emails || []), outcome.workEmail].filter(Boolean))];

  await EnrichedPerson.updateOne(
    { _id: person._id },
    {
      $set: {
        status: outcome.outcome,
        result: outcome.result || null,
        summary,
        knownEmails,
        error: outcome.error || "",
        enrichedAt: new Date(),
      },
      $inc: { attempts: 1 },
    }
  );

  await EnrichmentListRow.updateOne(
    { _id: row._id },
    {
      $set: {
        "enrichment.status": ROW_STATUS_BY_OUTCOME[outcome.outcome],
        "enrichment.method": person.lookupMethod,
        "enrichment.personId": person._id,
        "enrichment.providerRequestId": "",
        "enrichment.error": outcome.error || "",
        "enrichment.processedAt": new Date(),
      },
    }
  );
  await EnrichmentList.updateOne(
    { _id: row.listId },
    { $inc: { "counts.processed": 1, [`counts.${LIST_COUNT_BY_OUTCOME[outcome.outcome]}`]: 1 } }
  );
};

/** A batch or row that couldn't be submitted/finished at all — recorded as failed, never silently dropped. */
const markItemFailed = async (row, person, message) => {
  await EnrichedPerson.updateOne(
    { _id: person._id },
    { $set: { status: "failed", error: message }, $inc: { attempts: 1 } }
  );
  await EnrichmentListRow.updateOne(
    { _id: row._id },
    {
      $set: {
        "enrichment.status": "failed",
        "enrichment.method": person.lookupMethod,
        "enrichment.personId": person._id,
        "enrichment.providerRequestId": "",
        "enrichment.error": message,
        "enrichment.processedAt": new Date(),
      },
    }
  );
  await EnrichmentList.updateOne(
    { _id: row.listId },
    { $inc: { "counts.processed": 1, "counts.failed": 1 } }
  );
};

// ─── Batch submit/poll ───────────────────────────────────────────────────────

/** items: [{ row, person }]. Submits one batch and writes providerRequestId everywhere. */
const submitBatch = async (listId, method, items) => {
  const label = `Vihara Enrichment ${listId} ${method} ${Date.now()}`;
  try {
    const enrichmentId =
      method === "name_company"
        ? await fullenrichClient.submitNameCompanyBatch(
            items.map(({ row, person }) => ({
              ref: person._id,
              firstName: row.csv.firstName,
              lastName: row.csv.lastName,
              companyName: row.csv.company,
            })),
            label
          )
        : await fullenrichClient.submitEmailLookup(items[0].person._id, items[0].row.keys.email, label);

    await Promise.all([
      EnrichedPerson.updateMany(
        { _id: { $in: items.map((i) => i.person._id) } },
        { $set: { providerRequestId: enrichmentId } }
      ),
      EnrichmentListRow.updateMany(
        { _id: { $in: items.map((i) => i.row._id) } },
        { $set: { "enrichment.providerRequestId": enrichmentId } }
      ),
    ]);

    return { method, providerRequestId: enrichmentId, items, submittedAt: Date.now() };
  } catch (err) {
    // Submit itself failed (bad key, network, rejected batch) — record every
    // item in it as failed right away rather than leaving them pending forever.
    const message = err.response?.data?.message || err.message || String(err);
    await Promise.all(items.map(({ row, person }) => markItemFailed(row, person, message)));
    return null;
  }
};

/** Polls one open batch once. Returns true if it's finished (handled), false if still in progress. */
const pollBatch = async (batch) => {
  const poll =
    batch.method === "name_company"
      ? () => fullenrichClient.pollNameCompanyBatch(batch.providerRequestId)
      : () => fullenrichClient.pollEmailLookup(batch.providerRequestId, String(batch.items[0].person._id));

  let outcome;
  try {
    outcome = await poll();
  } catch (err) {
    const message = err.response?.data?.message || err.message || String(err);
    await Promise.all(batch.items.map(({ row, person }) => markItemFailed(row, person, message)));
    return true;
  }

  if (!outcome.done) return false;

  for (const { row, person } of batch.items) {
    const result = outcome.results.get(String(person._id));
    if (result) {
      await applyOutcome(row, person, result);
    } else {
      // silentFail dropped it, or the batch-level status wasn't FINISHED.
      const message =
        outcome.status && outcome.status !== "FINISHED"
          ? `FullEnrich batch status: ${outcome.status}`
          : "rejected by FullEnrich";
      await markItemFailed(row, person, message);
    }
  }
  return true;
};

// ─── The pass ────────────────────────────────────────────────────────────────

/**
 * Runs one full enrichment pass over every currently-pending row in a list,
 * to completion (or the 30-minute cap). Does not change list.status itself
 * — the caller (startEnrichment/resumeEnrichment/retryFailed) does that.
 */
const runEnrichmentPass = async (listId) => {
  const pendingRows = await EnrichmentListRow.find({ listId, "enrichment.status": "pending" }).lean();

  let openBatches = [];
  const deferred = new Map(); // rowId -> row
  const toSubmit = { name_company: [], email: [] };

  for (const row of pendingRows) {
    const existing = await resolveExisting(row);
    // Only found/not_found are permanently resolved and reused. A "failed"
    // record (or none at all) goes into the to-look-up set (enrich.md §5.5,
    // step 3) — a failed lookup must stay retryable, not get stuck reused
    // forever. tryClaim's upsert filter (status !== "pending") matches an
    // existing failed doc fine and flips it back to pending for reclaiming.
    if (existing && (existing.status === "found" || existing.status === "not_found")) {
      await linkReusedRow(row, existing);
      continue;
    }
    if (existing && existing.status === "pending") {
      deferred.set(String(row._id), row);
      continue;
    }
    const claimed = await tryClaim(row);
    if (!claimed) {
      deferred.set(String(row._id), row);
      continue;
    }
    toSubmit[claimed.lookupMethod].push({ row, person: claimed });
  }

  for (const items of chunk(toSubmit.name_company, BATCH_SIZE)) {
    const batch = await submitBatch(listId, "name_company", items);
    if (batch) openBatches.push(batch);
  }
  // Email fallback batches are one contact each (fullenrichClient's proven
  // batch size) — should be rare to nonexistent on SFR-style data.
  for (const item of toSubmit.email) {
    const batch = await submitBatch(listId, "email", [item]);
    if (batch) openBatches.push(batch);
  }

  const startedAt = Date.now();
  while (openBatches.length > 0 || deferred.size > 0) {
    if (Date.now() - startedAt > HARD_STOP_MS) {
      await Promise.all(
        openBatches.flatMap((b) =>
          b.items.map(({ row, person }) => markItemFailed(row, person, "FullEnrich pass timed out after 30 minutes"))
        )
      );
      for (const row of deferred.values()) {
        await EnrichmentListRow.updateOne(
          { _id: row._id },
          {
            $set: {
              "enrichment.status": "failed",
              "enrichment.error": "blocked on another list's lookup for too long",
              "enrichment.processedAt": new Date(),
            },
          }
        );
        await EnrichmentList.updateOne({ _id: listId }, { $inc: { "counts.processed": 1, "counts.failed": 1 } });
      }
      break;
    }

    await delay(POLL_MS);
    await EnrichmentList.updateOne({ _id: listId }, { $set: { lastPolledAt: new Date() } });

    const stillOpen = [];
    for (const batch of openBatches) {
      const done = await pollBatch(batch);
      if (!done) stillOpen.push(batch);
    }
    openBatches = stillOpen;

    for (const [rowId, row] of [...deferred.entries()]) {
      const existing = await resolveExisting(row);
      // Same rule as the first pass: only found/not_found are reused.
      if (existing && (existing.status === "found" || existing.status === "not_found")) {
        await linkReusedRow(row, existing);
        deferred.delete(rowId);
        continue;
      }
      if (existing && existing.status === "failed") {
        // Whoever held it gave up — retry it ourselves. Atomically flip it
        // to pending first (same claim guard as tryClaim, matched by _id so
        // there's no duplicate-key path to worry about) so a concurrent
        // list processing the same person can't also retry it at once.
        const reclaimed = await EnrichedPerson.findOneAndUpdate(
          { _id: existing._id, status: { $ne: "pending" } },
          { $set: { status: "pending" } },
          { new: true }
        );
        if (reclaimed) {
          const batch = await submitBatch(listId, reclaimed.lookupMethod, [{ row, person: reclaimed }]);
          if (batch) openBatches.push(batch);
          deferred.delete(rowId);
        }
        // else: lost the race to another list just now — leave it deferred,
        // it'll resolve to found/not_found on a later poll round.
        continue;
      }
      if (existing && existing.status === "pending") {
        const age = Date.now() - new Date(existing.updatedAt || existing.createdAt).getTime();
        if (age > CLAIM_STALE_MS) {
          // Abandoned by whoever claimed it — reclaim and submit ourselves.
          const reclaimed = await EnrichedPerson.findOneAndUpdate(
            { _id: existing._id },
            { $set: { status: "pending" } },
            { new: true }
          );
          const batch = await submitBatch(listId, reclaimed.lookupMethod, [{ row, person: reclaimed }]);
          if (batch) openBatches.push(batch);
          deferred.delete(rowId);
        }
        continue;
      }
      // Record vanished (shouldn't normally happen) — claim fresh.
      const claimed = await tryClaim(row);
      if (claimed) {
        const batch = await submitBatch(listId, claimed.lookupMethod, [{ row, person: claimed }]);
        if (batch) openBatches.push(batch);
        deferred.delete(rowId);
      }
    }
  }
};

// ─── Public entry points ─────────────────────────────────────────────────────

/** Fast: flips the list to "enriching" so a concurrent double-click can't restart it twice. */
const markEnriching = async (listId) => {
  await EnrichmentList.updateOne(
    { _id: listId },
    { $set: { status: "enriching", lastPolledAt: new Date() } }
  );
  // Only set enrichStartedAt the first time (resume/retry shouldn't reset it).
  await EnrichmentList.updateOne(
    { _id: listId, enrichStartedAt: null },
    { $set: { enrichStartedAt: new Date() } }
  );
};

/**
 * Slow: runs a pass over whatever's currently pending and flips the list to
 * "ready" (or "failed" if the pass itself threw). Assumes markEnriching (or
 * equivalent) already ran. Callers awaiting this directly should expect it
 * to take a while — every controller below instead calls this
 * fire-and-forget, after its own fast precondition-check-and-mark step,
 * matching createList's shape (a FullEnrich round trip took 60-100s+ in
 * Phase 0 testing).
 */
const finishPass = async (listId) => {
  try {
    await runEnrichmentPass(listId);
    await EnrichmentList.updateOne(
      { _id: listId, status: "enriching" },
      { $set: { status: "ready", enrichFinishedAt: new Date() } }
    );
  } catch (err) {
    await EnrichmentList.updateOne(
      { _id: listId },
      { $set: { status: "failed", error: err.message || String(err) } }
    );
  }
};

/** Called after POST /lists responds — not awaited by the controller. */
const startEnrichment = async (listId) => {
  const list = await EnrichmentList.findById(listId);
  if (!list || (list.status !== "queued" && list.status !== "interrupted")) return;
  await markEnriching(listId);
  return finishPass(listId);
};

/** Fast precondition check + mark for POST /lists/:id/resume. Throws on a bad precondition. */
const prepareResume = async (listId) => {
  const list = await EnrichmentList.findById(listId);
  if (!list) { const err = new Error("List not found"); err.statuscode = 404; throw err; }
  if (list.status !== "interrupted") {
    const err = new Error(`List is "${list.status}", not "interrupted"`);
    err.statuscode = 409;
    throw err;
  }
  await markEnriching(listId);
};

/** Convenience wrapper that awaits the whole thing (e.g. for tests/scripts, not the HTTP path). */
const resumeEnrichment = async (listId) => {
  await prepareResume(listId);
  return finishPass(listId);
};

/**
 * Fast precondition check + row reset for POST /lists/:id/retry-failed.
 * Returns { retried, started } — started is false when there was nothing to
 * retry, so the controller knows not to kick off finishPass.
 */
const prepareRetryFailed = async (listId) => {
  const list = await EnrichmentList.findById(listId);
  if (!list) { const err = new Error("List not found"); err.statuscode = 404; throw err; }
  if (list.status === "enriching") {
    const err = new Error("List is already enriching");
    err.statuscode = 409;
    throw err;
  }

  const failedRows = await EnrichmentListRow.find({ listId, "enrichment.status": "failed" });
  if (failedRows.length === 0) return { retried: 0, started: false };

  await EnrichmentListRow.updateMany(
    { _id: { $in: failedRows.map((r) => r._id) } },
    { $set: { "enrichment.status": "pending", "enrichment.error": "" } }
  );
  await EnrichmentList.updateOne(
    { _id: listId },
    { $inc: { "counts.failed": -failedRows.length, "counts.processed": -failedRows.length } }
  );
  await markEnriching(listId);

  return { retried: failedRows.length, started: true };
};

/** Convenience wrapper that awaits the whole thing (e.g. for tests/scripts, not the HTTP path). */
const retryFailed = async (listId) => {
  const result = await prepareRetryFailed(listId);
  if (result.started) await finishPass(listId);
  return result;
};

/**
 * POST /lists/:id/rows/:rowId/re-enrich — forces a fresh lookup for one row
 * (decision #7), even if a stored result already exists. Split into a
 * synchronous precondition-check-and-claim step (prepareReEnrich, so a bad
 * request still gets an immediate, correct error) and this async run step
 * — the controller awaits the former, responds 202, then fires this one
 * without awaiting, matching createList's shape (a real FullEnrich round
 * trip took 60-100s in Phase 0 testing, too slow to hold a request open
 * for).
 *
 * Deliberately does NOT go through runEnrichmentPass/resolveExisting, which
 * would just find the existing result and reuse it — that's the opposite
 * of what this action means. prepareReEnrich instead forces the shared
 * enrichedPerson record itself back to "pending" (bypassing the
 * concurrency-claim guard, since this is an explicit single admin action,
 * not opportunistic batch claiming), and this function resubmits just that
 * one contact.
 */
const prepareReEnrich = async (listId, rowId) => {
  const list = await EnrichmentList.findById(listId);
  if (!list) { const err = new Error("List not found"); err.statuscode = 404; throw err; }
  if (list.status === "enriching") {
    const err = new Error("List is already enriching");
    err.statuscode = 409;
    throw err;
  }

  const row = await EnrichmentListRow.findOne({ _id: rowId, listId });
  if (!row) { const err = new Error("Row not found"); err.statuscode = 404; throw err; }
  if (!row.keys?.nameCompany && !row.keys?.email) {
    const err = new Error("This row has no name + company or email to look up by");
    err.statuscode = 400;
    throw err;
  }

  const isNameCompany = Boolean(row.keys.nameCompany);
  const filter = isNameCompany ? { dedupeKey: row.keys.nameCompany } : { lookupEmail: row.keys.email };
  const setOnInsert = isNameCompany
    ? {
        dedupeKey: row.keys.nameCompany,
        lookupMethod: "name_company",
        lookupInput: {
          firstName: row.csv.firstName,
          lastName: row.csv.lastName,
          companyName: row.csv.company,
        },
        firstSeenListId: row.listId,
      }
    : {
        lookupEmail: row.keys.email,
        lookupMethod: "email",
        lookupInput: { email: row.keys.email },
        firstSeenListId: row.listId,
      };

  const person = await EnrichedPerson.findOneAndUpdate(
    filter,
    { $set: { status: "pending" }, $setOnInsert: setOnInsert },
    { upsert: true, new: true }
  );

  const wasCounted = row.enrichment.status !== "pending";
  await EnrichmentListRow.updateOne(
    { _id: rowId },
    { $set: { "enrichment.status": "pending", "enrichment.error": "", "enrichment.stale": false } }
  );
  if (wasCounted) {
    await EnrichmentList.updateOne({ _id: listId }, { $inc: { "counts.processed": -1 } });
  }

  await EnrichmentList.updateOne(
    { _id: listId },
    { $set: { status: "enriching", lastPolledAt: new Date() } }
  );

  return { row, person };
};

/** The actual submit+poll, called after prepareReEnrich and the HTTP response. */
const runReEnrich = async (listId, row, person) => {
  try {
    const batch = await submitBatch(listId, person.lookupMethod, [{ row, person }]);
    if (batch) {
      const startedAt = Date.now();
      let done = false;
      while (!done) {
        if (Date.now() - startedAt > HARD_STOP_MS) {
          await markItemFailed(row, person, "FullEnrich re-enrich timed out after 30 minutes");
          break;
        }
        await delay(POLL_MS);
        await EnrichmentList.updateOne({ _id: listId }, { $set: { lastPolledAt: new Date() } });
        done = await pollBatch(batch);
      }
    }
  } finally {
    await EnrichmentList.updateOne(
      { _id: listId, status: "enriching" },
      { $set: { status: "ready", enrichFinishedAt: new Date() } }
    );
  }
};

/** Convenience wrapper for callers that don't need the split (e.g. tests). */
const reEnrichRow = async (listId, rowId) => {
  const { row, person } = await prepareReEnrich(listId, rowId);
  return runReEnrich(listId, row, person);
};

module.exports = {
  startEnrichment,
  prepareResume,
  resumeEnrichment,
  prepareRetryFailed,
  retryFailed,
  finishPass,
  prepareReEnrich,
  runReEnrich,
  reEnrichRow,
};
