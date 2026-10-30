// utils/logPath.js
//
// The request path for log lines, without anything secret: the query string is
// dropped (Brevo's ?token=, Vapi's ?secret=, unsubscribe emails, ...) and path
// segments that are keys are replaced with ***.
const SECRET_SEGMENTS = [
  /^(\/api\/v1\/rb2b\/ingest\/)[^/]+/, // RB2B webhook token
  /^(\/api\/webhooks\/vtext\/[^/]+\/)[^/]+/, // Vtext line key
  /^(\/api\/v1\/(?:user|realtor)\/password\/reset\/)[^/]+/, // password reset token
];

const logPath = (req) => {
  let path = String(req.originalUrl || req.url || "").split("?")[0];
  for (const re of SECRET_SEGMENTS) path = path.replace(re, "$1***");
  return path;
};

module.exports = { logPath };
