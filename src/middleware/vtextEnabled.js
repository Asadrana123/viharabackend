// middleware/vtextEnabled.js
//
// D6 (sendify-infra.md §2): "When false (the default), ... Vtext routes
// return 503, and the server boots as today." Found this wasn't actually
// true for every Vtext route — only the /health handler checked the flag;
// POST /lines and /messages had no such check at all and would have happily
// hit Mongo/Redis even with the feature nominally "off." Centralizing the
// check here, applied once per router, is what actually makes the "stays
// fully inert" promise hold for every route, not just the one someone
// remembered to guard.
function requireVtextEnabled(req, res, next) {
  if (process.env.VTEXT_ENABLED !== "true") {
    return res.status(503).json({ success: false, message: "Vtext is disabled (VTEXT_ENABLED is not 'true')" });
  }
  next();
}

module.exports = { requireVtextEnabled };
