// middleware/hideServerErrors.js
//
// Server errors (status 500+) often carry raw internal text: database errors,
// service responses, URLs. Visitors and normal users get a plain message
// instead; the original goes to the server log. Admins, lead-note advisors and
// our own agents (QA agent, FaceTime Mac) still see the real message, so the
// admin panel and agents can show what went wrong.
//
// Covers both the central error handler and controllers that answer
// res.status(500).json({ message: error.message }) themselves.

const GENERIC = "Something went wrong on our side. Please try again.";
const DETAIL_KEYS = ["message", "error", "details", "stack"];

// Checked when the answer is sent, so the route's own auth has already run.
const maySeeDetails = (req) =>
  req.user?.role === "admin" || Boolean(req.advisor || req.facetimeLine || req.qaWorkerId || req.isQaTest);

function hideServerErrors(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 500 && body && typeof body === "object" && !Array.isArray(body) && !maySeeDetails(req)) {
      const original = DETAIL_KEYS.filter((k) => k in body).map((k) => `${k}=${typeof body[k] === "string" ? body[k] : JSON.stringify(body[k])}`);
      if (original.length) {
        console.error(`[hideServerErrors] ${req.method} ${req.originalUrl} ${res.statusCode}: ${original.join(" | ").slice(0, 2000)}`);
        body = { ...body };
        for (const k of DETAIL_KEYS) delete body[k];
        body.message = GENERIC;
        body.error = GENERIC;
      }
    }
    return json(body);
  };
  next();
}

module.exports = hideServerErrors;
module.exports.GENERIC = GENERIC;
