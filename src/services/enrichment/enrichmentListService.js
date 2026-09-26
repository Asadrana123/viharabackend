// services/enrichment/enrichmentListService.js
//
// List lifecycle for the Enrichment Lists feature: parse-preview, create,
// read (list + detail + rows, with lazy stale detection), edit a row, and
// delete. See enrich.md §5.1/§6.
//
// Phase 1 scope only: createList does NOT start the enrichment job — that's
// enrichmentJobService, added in Phase 2. Rows with a lookup key just sit
// "pending" until then. See enrich.md §9, Phase 1.

const EnrichmentList = require("../../model/enrichment/enrichmentListModel");
const EnrichmentListRow = require("../../model/enrichment/enrichmentListRowModel");
const EnrichedPerson = require("../../model/enrichment/enrichedPersonModel");
const Errorhandler = require("../../utils/errorhandler");
const { toUsSmsNumber } = require("../../utils/usPhone");
const {
  MAX_ROWS_CEILING,
  parseCsv,
  effectiveContact,
  validateOverrides,
  isValidEmail,
  STALE_TRIGGER_FIELDS,
} = require("./enrichmentContactsService");

// Same lazy-stale rule as outboundCampaignService: an "enriching" list whose
// updatedAt hasn't moved in this long is treated as abandoned (e.g. a Render
// restart mid-run) and flipped to "interrupted" on the next read.
const STALE_MS = 10 * 60 * 1000;

const applyStaleCheck = async (doc) => {
  if (!doc || doc.status !== "enriching") return doc;
  const updatedAt = new Date(doc.updatedAt || 0).getTime();
  if (Date.now() - updatedAt > STALE_MS) {
    await EnrichmentList.updateOne(
      { _id: doc._id, status: "enriching" },
      { $set: { status: "interrupted" } }
    );
    doc.status = "interrupted";
  }
  return doc;
};

/**
 * POST /lists/parse — parses and checks against the shared enrichment store,
 * but saves nothing and calls FullEnrich for nothing.
 */
const parseList = async (csvData) => {
  const parsed = parseCsv(csvData);

  const dedupeKeys = [...new Set(parsed.rows.map((r) => r.keys.nameCompany).filter(Boolean))];
  const emailKeys = [...new Set(parsed.rows.map((r) => r.keys.email).filter(Boolean))];

  let existing = [];
  if (dedupeKeys.length || emailKeys.length) {
    const or = [];
    if (dedupeKeys.length) or.push({ dedupeKey: { $in: dedupeKeys } });
    if (emailKeys.length) or.push({ lookupEmail: { $in: emailKeys } }, { knownEmails: { $in: emailKeys } });
    existing = await EnrichedPerson.find({ $or: or })
      .select("dedupeKey lookupEmail knownEmails")
      .lean();
  }
  const existingDedupeKeys = new Set(existing.map((p) => p.dedupeKey).filter(Boolean));
  const existingEmails = new Set(
    existing.flatMap((p) => [p.lookupEmail, ...(p.knownEmails || [])].filter(Boolean))
  );

  let alreadyEnriched = 0;
  let byNameCompany = 0;
  let byEmail = 0;
  for (const row of parsed.rows) {
    if (row.keys.nameCompany) {
      if (existingDedupeKeys.has(row.keys.nameCompany)) alreadyEnriched += 1;
      else byNameCompany += 1;
    } else if (row.keys.email) {
      if (existingEmails.has(row.keys.email)) alreadyEnriched += 1;
      else byEmail += 1;
    }
  }

  return {
    total: parsed.total,
    skipped: parsed.skipped,
    noLookupKey: parsed.noLookupKey,
    alreadyEnriched,
    toLookUp: { byNameCompany, byEmail },
    sample: parsed.rows.slice(0, 20).map((r) => ({
      rowNumber: r.rowNumber,
      fullName: r.csv.fullName,
      company: r.csv.company,
      phones: r.csv.phones,
      emails: r.csv.emails,
      activeMarket: r.csv.activeMarket,
      contactType: r.csv.contactType,
      hasNameCompanyKey: Boolean(r.keys.nameCompany),
      hasEmailKey: Boolean(r.keys.email),
    })),
    headersSeen: parsed.headersSeen,
    headersUnmapped: parsed.headersUnmapped,
  };
};

/**
 * POST /lists — parses, saves the list + every row, and returns. Does NOT
 * start enrichment (Phase 2).
 */
const createList = async ({ csvData, csvFileName, name, createdBy }) => {
  const parsed = parseCsv(csvData);

  const list = new EnrichmentList({
    name: name || csvFileName || `Upload ${new Date().toISOString().slice(0, 10)}`,
    csvFileName: csvFileName || "",
    status: "queued",
    counts: {
      total: parsed.total,
      // Rows with nothing to look up by are already "finished" — they'll
      // never be picked up by the enrichment job.
      processed: parsed.noLookupKey,
      enriched: 0,
      reused: 0,
      notFound: 0,
      noLookupKey: parsed.noLookupKey,
      failed: 0,
    },
    parseSkipped: parsed.skipped,
    createdBy: {
      id: createdBy?._id,
      email: createdBy?.email || "",
      name: createdBy?.name || "",
    },
  });
  await list.save();

  const rowDocs = parsed.rows.map((r) => ({
    listId: list._id,
    rowNumber: r.rowNumber,
    raw: r.raw,
    csv: r.csv,
    keys: r.keys,
    enrichment: {
      status: r.keys.nameCompany || r.keys.email ? "pending" : "no_lookup_key",
    },
  }));
  await EnrichmentListRow.insertMany(rowDocs);

  // Phase 2 wires startEnrichment(list._id) in here, called after the HTTP
  // response has gone out (same fire-and-forget shape as Outbound/calling).

  return { list, total: parsed.total, noLookupKey: parsed.noLookupKey, skipped: parsed.skipped };
};

/** GET /lists?page=&limit= — newest first, without rows. */
const listLists = async (page = 1, limit = 20) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  const [docs, total] = await Promise.all([
    EnrichmentList.find().sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
    EnrichmentList.countDocuments(),
  ]);

  await Promise.all(
    docs.filter((d) => d.status === "enriching").map((d) => applyStaleCheck(d))
  );

  return {
    lists: docs,
    pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) },
  };
};

/** GET /lists/:id — the list document with counts and dispatches, no rows. */
const getList = async (id) => {
  const doc = await EnrichmentList.findById(id).lean();
  if (!doc) return null;
  return applyStaleCheck(doc);
};

// SMS takes the first phone that's actually a valid US number, not
// necessarily phones[0] literally (enrich.md §7.1) — a row can have a non-US
// number listed first and a valid US one second.
const hasUsSmsNumber = (phones) => (phones || []).some((p) => Boolean(toUsSmsNumber(p)));

const CHANNEL_REQUIREMENTS = {
  call: (effective) => effective.phones.length > 0,
  sms: (effective) => hasUsSmsNumber(effective.phones) && Boolean(effective.email),
  email: (effective) => Boolean(effective.email),
};

/**
 * GET /lists/:id/rows — paginated, with effective values computed against
 * each row's linked enrichedPerson (Phase 1: usually none yet).
 */
const getRows = async (
  listId,
  { page = 1, limit = 50, status, search, excluded, activeMarket, channel } = {}
) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  const skip = (safePage - 1) * safeLimit;

  const query = { listId };
  if (status) query["enrichment.status"] = status;
  if (excluded !== undefined) query.excluded = excluded === true || excluded === "true";
  if (activeMarket) query["csv.activeMarket"] = activeMarket;
  if (search) {
    const re = new RegExp(String(search).trim(), "i");
    query.$or = [{ "csv.fullName": re }, { "csv.company": re }, { "keys.email": re }];
  }

  const check = channel ? CHANNEL_REQUIREMENTS[channel] : null;
  if (channel && !check) throw new Errorhandler('channel must be "call", "sms", or "email"', 400);

  // Channel qualification depends on the computed effective contact (CSV +
  // FullEnrich + overrides), which only exists after joining enrichedPerson
  // in JS — it can't be expressed as a Mongo query. So with a channel
  // filter, page in JS over every matching row instead of at the DB level
  // (lists are capped at MAX_ROWS_CEILING, so this is at most 500 docs).
  // Without one, paginate at the DB level as usual — cheaper for the common
  // case (the plain review table).
  const fetchAll = Boolean(channel);
  const findQuery = EnrichmentListRow.find(query).sort({ rowNumber: 1 });
  if (!fetchAll) findQuery.skip(skip).limit(safeLimit);

  const [rows, dbTotal] = await Promise.all([
    findQuery.lean(),
    fetchAll ? Promise.resolve(null) : EnrichmentListRow.countDocuments(query),
  ]);

  const personIds = [...new Set(rows.map((r) => r.enrichment?.personId).filter(Boolean))];
  const people = personIds.length
    ? await EnrichedPerson.find({ _id: { $in: personIds } }).lean()
    : [];
  const peopleById = new Map(people.map((p) => [String(p._id), p]));

  let mapped = rows.map((row) => {
    const person = row.enrichment?.personId ? peopleById.get(String(row.enrichment.personId)) : null;
    const effective = effectiveContact(row, person);
    return { ...row, effective };
  });

  let total = dbTotal;
  if (channel) {
    mapped = mapped.filter((r) => check(r.effective));
    total = mapped.length;
    mapped = mapped.slice(skip, skip + safeLimit);
  }

  return {
    rows: mapped,
    pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) },
  };
};

/**
 * PATCH /lists/:id/rows/:rowId — body { overrides?, excluded? }. Validates
 * overrides against the editable-field whitelist, marks the row's
 * enrichment stale if an identity field changed (§7.4), and never touches
 * enrichedPersonModel (decision #13).
 */
const updateRow = async (listId, rowId, { overrides, excluded }, user) => {
  const row = await EnrichmentListRow.findOne({ _id: rowId, listId });
  if (!row) throw new Errorhandler("Row not found", 404);

  const validated = validateOverrides(overrides);
  const setOps = {};
  let touchedIdentityField = false;

  for (const [key, value] of Object.entries(validated)) {
    if (value === null) {
      setOps[`overrides.${key}`] = undefined;
    } else {
      setOps[`overrides.${key}`] = value;
    }
    if (STALE_TRIGGER_FIELDS.includes(key)) touchedIdentityField = true;
  }

  if (Object.keys(validated).length > 0) {
    setOps.editedBy = { id: user?._id, email: user?.email || "" };
    setOps.editedAt = new Date();
    if (touchedIdentityField) setOps["enrichment.stale"] = true;
  }

  if (excluded !== undefined) setOps.excluded = excluded === true;

  // $set with an `undefined` value doesn't clear a field in Mongo — unset it
  // properly for any override the caller cleared with `null`.
  const unsetOps = {};
  Object.keys(setOps).forEach((k) => {
    if (setOps[k] === undefined) {
      unsetOps[k] = "";
      delete setOps[k];
    }
  });

  const update = {};
  if (Object.keys(setOps).length) update.$set = setOps;
  if (Object.keys(unsetOps).length) update.$unset = unsetOps;
  if (Object.keys(update).length === 0) return row.toObject();

  await EnrichmentListRow.updateOne({ _id: rowId }, update);
  return EnrichmentListRow.findById(rowId).lean();
};

/**
 * DELETE /lists/:id — deletes the list and its rows. The shared
 * enrichedPerson records are kept (decision #21). Refused while the job is
 * actively running.
 */
const deleteList = async (listId) => {
  const list = await getList(listId);
  if (!list) throw new Errorhandler("List not found", 404);
  if (list.status === "enriching") {
    throw new Errorhandler("Can't delete a list while it's enriching", 409);
  }

  await EnrichmentListRow.deleteMany({ listId });
  await EnrichmentList.deleteOne({ _id: listId });
};

module.exports = {
  MAX_ROWS_CEILING,
  parseList,
  createList,
  listLists,
  getList,
  getRows,
  updateRow,
  deleteList,
};
