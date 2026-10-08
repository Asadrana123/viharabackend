// services/adminAsk/askQueryService.js
//
// The only code that touches the database on behalf of the admin "Ask AI" and
// the global search box. Everything here is READ-ONLY and every input coming
// from Claude is treated as untrusted:
//   - collections must be in the askCollections catalog
//   - filters may only use the operators in ALLOWED_OPERATORS (no $where,
//     $expr, $function… nothing that runs code)
//   - sensitive fields (passwords, reset tokens) can't be read, filtered,
//     sorted or grouped on
//   - every query has a row cap and a server-side time limit
const mongoose = require("mongoose");
const {
  COLLECTIONS,
  getCollection: lookupCollection,
  isSensitivePath,
  SENSITIVE_FIELDS,
} = require("./askCollections");

const MAX_TIME_MS = 8000;
const MAX_FIND_LIMIT = 50;
const DEFAULT_FIND_LIMIT = 20;
const MAX_GROUPS = 50;
const MAX_STRING_IN_LIST = 400;
const MAX_STRING_IN_RECORD = 4000;
// Keep one tool result small enough that a long chat stays cheap.
const MAX_RESULT_CHARS = 40000;

const ALLOWED_OPERATORS = new Set([
  "$eq", "$ne", "$gt", "$gte", "$lt", "$lte", "$in", "$nin", "$exists",
  "$regex", "$options", "$and", "$or", "$nor", "$not", "$elemMatch", "$size", "$all",
]);

class AskQueryError extends Error {}

function getCollection(key) {
  try {
    return lookupCollection(key);
  } catch (err) {
    throw new AskQueryError(err.message);
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);
}

function checkFieldName(field) {
  if (typeof field !== "string" || !field || field.startsWith("$")) {
    throw new AskQueryError(`Invalid field name "${field}"`);
  }
  if (isSensitivePath(field)) {
    throw new AskQueryError(`Field "${field}" is not available`);
  }
}

function sanitizeFilter(value, depth = 0) {
  if (depth > 10) throw new AskQueryError("Filter is nested too deeply");
  if (Array.isArray(value)) return value.map((v) => sanitizeFilter(v, depth + 1));
  if (!isPlainObject(value)) return value;

  const out = {};
  for (const [key, inner] of Object.entries(value)) {
    if (key.startsWith("$")) {
      if (!ALLOWED_OPERATORS.has(key)) {
        throw new AskQueryError(`Operator ${key} is not allowed. Allowed: ${[...ALLOWED_OPERATORS].join(", ")}`);
      }
      if (key === "$regex" && (typeof inner !== "string" || inner.length > 200)) {
        throw new AskQueryError("$regex must be a string of at most 200 characters");
      }
      if (key === "$options" && !/^[imsx]*$/.test(String(inner))) {
        throw new AskQueryError("$options may only contain i, m, s, x");
      }
    } else {
      checkFieldName(key);
    }
    out[key] = sanitizeFilter(inner, depth + 1);
  }
  return out;
}

// Mongoose casts find() filters to the schema (date strings -> Date, id strings
// -> ObjectId); aggregate() doesn't, so cast explicitly for $match.
function castFilter(model, filter) {
  try {
    return model.find(filter).cast(model);
  } catch (err) {
    throw new AskQueryError(`Filter doesn't match the schema: ${err.message}`);
  }
}

function sanitizeSort(sort) {
  if (sort == null) return { _id: -1 };
  if (!isPlainObject(sort)) throw new AskQueryError("sort must be an object like {\"createdAt\": -1}");
  const out = {};
  for (const [field, dir] of Object.entries(sort)) {
    checkFieldName(field);
    if (dir !== 1 && dir !== -1) throw new AskQueryError("sort directions must be 1 or -1");
    out[field] = dir;
  }
  return Object.keys(out).length ? out : { _id: -1 };
}

function projectionFor(entry, fields, { full = false } = {}) {
  if (Array.isArray(fields) && fields.length) {
    const inc = {};
    for (const f of fields) {
      checkFieldName(f);
      inc[f] = 1;
    }
    return inc;
  }
  const exc = {};
  for (const f of SENSITIVE_FIELDS) exc[f] = 0;
  if (!full) for (const f of entry.defaultExclude || []) exc[f] = 0;
  return exc;
}

// Strip sensitive keys at any depth (belt and braces: projections already drop
// top-level ones, but Mixed blobs could hold anything) and clip long strings.
function cleanValue(value, maxString) {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (Buffer.isBuffer(value)) return "[binary]";
  if (Array.isArray(value)) return value.map((v) => cleanValue(v, maxString));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_FIELDS.has(k)) continue;
      out[k] = cleanValue(v, maxString);
    }
    return out;
  }
  if (typeof value === "string" && value.length > maxString) {
    return `${value.slice(0, maxString)}… [${value.length - maxString} more chars]`;
  }
  return value;
}

// Drop records from the end until the JSON fits, and say so.
function fitRecords(records) {
  let kept = records;
  while (kept.length > 1 && JSON.stringify(kept).length > MAX_RESULT_CHARS) {
    kept = kept.slice(0, Math.ceil(kept.length / 2));
  }
  return { records: kept, truncated: kept.length < records.length };
}

function refFor(entry, doc) {
  return {
    collection: entry.key,
    id: String(doc._id),
    title: entry.title(doc) || "(untitled)",
    subtitle: entry.subtitle(doc) || "",
    link: entry.link(doc),
  };
}

// ── Global text search ────────────────────────────────────────────────────────

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// "5551234567" -> /5\D*5\D*5…/ so "(555) 123-4567" and "+1 555.123.4567" match.
function phoneRegex(text) {
  const digits = text.replace(/\D/g, "");
  if (digits.length < 7) return null;
  const tail = digits.length > 10 ? digits.slice(-10) : digits;
  return new RegExp(tail.split("").join("\\D*"));
}

async function searchAll(text, { collections, limitPerCollection = 5 } = {}) {
  const q = String(text || "").trim();
  if (q.length < 2) return { query: q, groups: [] };
  if (q.length > 100) throw new AskQueryError("Search text is too long");

  const wordRegex = new RegExp(escapeRegex(q), "i");
  const phone = phoneRegex(q);
  const isId = mongoose.Types.ObjectId.isValid(q) && /^[a-f0-9]{24}$/i.test(q);

  const targets = collections && collections.length
    ? collections.map(getCollection)
    : COLLECTIONS;

  const groups = await Promise.all(
    targets.map(async (entry) => {
      const or = (entry.searchFields || []).map((f) => ({ [f]: wordRegex }));
      if (phone) for (const f of entry.phoneFields || []) or.push({ [f]: phone });
      if (isId) or.push({ _id: new mongoose.Types.ObjectId(q) });
      if (!or.length) return null;

      const docs = await entry.model
        .find({ $or: or })
        .select(projectionFor(entry, null))
        .sort({ _id: -1 })
        .limit(limitPerCollection)
        .maxTimeMS(MAX_TIME_MS)
        .lean();
      if (!docs.length) return null;
      return { collection: entry.key, results: docs.map((d) => refFor(entry, d)) };
    })
  );

  return { query: q, groups: groups.filter(Boolean) };
}

// ── Tool executors (input = Claude's tool_use.input) ──────────────────────────

async function findRecords({ collection, filter = {}, sort, limit, fields }) {
  const entry = getCollection(collection);
  const cleanFilter = sanitizeFilter(filter || {});
  const n = Math.min(Math.max(parseInt(limit, 10) || DEFAULT_FIND_LIMIT, 1), MAX_FIND_LIMIT);

  const [total, docs] = await Promise.all([
    entry.model.countDocuments(cleanFilter).maxTimeMS(MAX_TIME_MS),
    entry.model
      .find(cleanFilter)
      .select(projectionFor(entry, fields))
      .sort(sanitizeSort(sort))
      .limit(n)
      .maxTimeMS(MAX_TIME_MS)
      .lean(),
  ]);

  const { records, truncated } = fitRecords(docs.map((d) => cleanValue(d, MAX_STRING_IN_LIST)));
  return {
    collection,
    totalMatching: total,
    returned: records.length,
    ...(truncated && { note: "Result was too large; only the first records are shown. Ask for fewer fields." }),
    records,
  };
}

async function countRecords({ collection, filter = {} }) {
  const entry = getCollection(collection);
  const count = await entry.model.countDocuments(sanitizeFilter(filter || {})).maxTimeMS(MAX_TIME_MS);
  return { collection, count };
}

const DATE_UNITS = new Set(["day", "week", "month", "year"]);

async function groupCount({ collection, filter = {}, group_by, date_unit, sum_field, limit }) {
  const entry = getCollection(collection);
  checkFieldName(group_by);
  if (sum_field != null) checkFieldName(sum_field);
  if (date_unit != null && !DATE_UNITS.has(date_unit)) {
    throw new AskQueryError("date_unit must be day, week, month or year");
  }
  const match = castFilter(entry.model, sanitizeFilter(filter || {}));
  const key = date_unit
    ? { $dateTrunc: { date: `$${group_by}`, unit: date_unit } }
    : `$${group_by}`;
  const group = { _id: key, count: { $sum: 1 } };
  if (sum_field) group.sum = { $sum: `$${sum_field}` };

  const n = Math.min(Math.max(parseInt(limit, 10) || MAX_GROUPS, 1), MAX_GROUPS);
  const rows = await entry.model
    .aggregate([
      { $match: match },
      { $group: group },
      { $sort: date_unit ? { _id: 1 } : { count: -1 } },
      { $limit: n },
    ])
    .option({ maxTimeMS: MAX_TIME_MS });

  return {
    collection,
    group_by,
    ...(date_unit && { date_unit }),
    groups: rows.map((r) => ({ value: cleanValue(r._id, MAX_STRING_IN_LIST), count: r.count, ...(sum_field && { sum: r.sum }) })),
  };
}

async function getRecord({ collection, id }) {
  const entry = getCollection(collection);
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AskQueryError(`"${id}" is not a valid id`);
  const doc = await entry.model
    .findById(id)
    .select(projectionFor(entry, null, { full: true }))
    .maxTimeMS(MAX_TIME_MS)
    .lean();
  if (!doc) return { collection, id, found: false };
  return { collection, found: true, record: cleanValue(doc, MAX_STRING_IN_RECORD) };
}

async function searchRecords({ text, collections }) {
  const { groups } = await searchAll(text, { collections });
  return {
    query: text,
    matches: groups.map((g) => ({ collection: g.collection, records: g.results.map(({ id, title, subtitle }) => ({ id, title, subtitle })) })),
  };
}

const EXECUTORS = {
  search_records: searchRecords,
  find_records: findRecords,
  count_records: countRecords,
  group_count: groupCount,
  get_record: getRecord,
};

module.exports = {
  AskQueryError,
  EXECUTORS,
  searchAll,
};
