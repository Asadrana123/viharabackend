const crypto = require("crypto");
const {
  processLead,
  resolveFbPitch,
} = require("../services/facebookLeadService");
const { runSingleCall } = require("../services/vapiCampaignService");

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
 * app.js.
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
 * Pull every leadgen_id out of a Meta webhook payload.
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
 * Acknowledge Meta immediately, then fetch each lead and dispatch Maya's call
 * in the background.
 */
const receiveWebhook = (req, res) => {
  if (!isValidSignature(req)) {
    return res.sendStatus(403);
  }

  if (req.body?.object !== "page") {
    return res.sendStatus(200);
  }

  const leadgenIds = extractLeadgenIds(req.body);

  res.sendStatus(200);

  for (const id of leadgenIds) {
    processLead(id).catch((err) =>
      console.error(`❌ FB lead ${id} processing failed:`, err.message)
    );
  }
};

/**
 * GET /api/facebook/test-call?token=...&name=...&phone=...
 * TEMPORARY. Dispatches a real call to the supplied number using the FB
 * property + prompt, so the whole "lead → Maya calls" path can be tested from
 * a browser without waiting on Meta. Remove this route once live leads flow.
 */
const testCall = async (req, res) => {
  if (req.query.token !== FB_VERIFY_TOKEN) {
    return res.status(403).json({ ok: false, error: "bad token" });
  }

  const name = (req.query.name || "Test Lead").trim();
  const phone = (req.query.phone || "").trim();
  if (!phone) {
    return res.status(400).json({ ok: false, error: "phone is required" });
  }

  try {
    const { property, promptConfig } = await resolveFbPitch();
    const result = await runSingleCall(
      { fullName: name, phones: phone },
      { enrich: false, property, promptConfig }
    );
    const called = result.calls.some((c) => c.success);
    return res.status(200).json({ ok: called, calls: result.calls });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};

module.exports = {
  verifyWebhook,
  receiveWebhook,
  testCall,
};
