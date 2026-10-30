// middleware/stripMongoOperators.js
//
// Removes object keys that start with "$" from the request body and query
// string, so a visitor can't slip MongoDB operators into our queries, e.g.
// {"email": {"$regex": "^a"}} or ?email[$ne]=x. Nothing we send from the
// website uses such keys.
//
// Not mongoose's global sanitizeFilter: that would also wrap the operators in
// our own queries ($in, $gte, ...) and break them. req.rawBody (used for
// webhook signature checks) is untouched. Multipart bodies are parsed later by
// multer per route, so they aren't covered here.

const MAX_DEPTH = 20;

function strip(value, depth, removed) {
  if (!value || typeof value !== "object" || depth > MAX_DEPTH) return;
  for (const key of Object.keys(value)) {
    if (key.startsWith("$")) {
      delete value[key];
      removed.push(key);
    } else {
      strip(value[key], depth + 1, removed);
    }
  }
}

function stripMongoOperators(req, res, next) {
  const removed = [];
  strip(req.body, 0, removed);
  strip(req.query, 0, removed);
  if (removed.length) {
    console.warn(`[stripMongoOperators] removed ${[...new Set(removed)].join(", ")} from ${req.method} ${req.path}`);
  }
  next();
}

module.exports = stripMongoOperators;
