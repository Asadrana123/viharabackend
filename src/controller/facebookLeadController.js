const crypto = require("crypto");
const { processLead } = require("../services/facebookLeadService");

const FB_APP_SECRET = process.env.FB_APP_SECRET;
const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;

/**
 * GET /api/facebook/webhook
 * One-time subscription handshake. Meta echoes hub.challenge back when the
 * verify token matches the value configured in the App dashboard.
 */
const verifyWebhook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token && token === FB_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

/**
 * Validate X-Hub-Signature-256 against the raw request body so forged POSTs
 * are rejected. Requires req.rawBody, captured by the json body-parser in
 * app.js. Signing the parsed-then-restringified body would not match, which
 * is why the raw buffer is needed.
 */
const isValidSignature = (req) => {
  if (!FB_APP_SECRET) return false;

  const header = req.get("x-hub-signature-256") || "";
  if (!header.startsWith("sha256=") || !req.rawBody) return false;

  const expected = crypto
    .createHmac("sha256", FB_APP_SECRET)
    .update(req.rawBody)
    .digest("hex");
  const received = header.slice("sha256=".length);

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/**
 * Pull every leadgen_id out of a Meta webhook payload. A single delivery can
 * carry more than one change.
 */
const extractLeadgenIds = (body) => {
  const ids = [];
  const entries = Array.isArray(body?.entry) ? body.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      if (change.field === "leadgen" && change.value?.leadgen_id) {
        ids.push(String(change.value.leadgen_id));
      }
    }
  }

  return ids;
};

/**
 * POST /api/facebook/webhook
 * Acknowledge Meta immediately (it has a short timeout and will retry on
 * delay, causing duplicate calls), then fetch each lead and dispatch Maya's
 * call in the background.
 */
const receiveWebhook = (req, res) => {
  if (!isValidSignature(req)) {
    return res.sendStatus(403);
  }

  if (req.body?.object !== "page") {
    return res.sendStatus(200);
  }

  const leadgenIds = extractLeadgenIds(req.body);

  // Ack first — never make Meta wait on the Graph fetch + call dispatch.
  res.sendStatus(200);

  // Fire and forget.
  for (const id of leadgenIds) {
    processLead(id).catch((err) =>
      console.error(`❌ FB lead ${id} processing failed:`, err.message)
    );
  }
};

module.exports = {
  verifyWebhook,
  receiveWebhook,
};
