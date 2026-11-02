// SA-028: with the secret set, the right secret passes and a wrong one is refused (now compared in constant time).
// Brevo, Vapi and RB2B read their secrets when loaded, so they're set before anything is required.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

process.env.BREVO_WEBHOOK_SECRET = "brevo-secret-123";
process.env.VAPI_WEBHOOK_SECRET = "vapi-secret-456";
process.env.RB2B_WEBHOOK_TOKEN = "rb2b-token-789";
console.log = console.warn = () => {};

// No database: the work after the secret check is stubbed (the controllers destructure these when loaded).
const emailEvents = require("../services/integrations/emailEventsService");
emailEvents.ingestBrevoEvents = async () => ({ saved: 0 });
const propertyEmail = require("../services/propertyEmail/propertyEmailService");
propertyEmail.handleDeliverabilityEvents = async () => {};
const RB2BVisitor = require("../model/leads/rb2bVisitorModel");
RB2BVisitor.findOne = async () => null;
RB2BVisitor.create = async () => ({});
RB2BVisitor.findOneAndUpdate = async () => ({});
RB2BVisitor.updateOne = async () => ({});

const app = express();
app.use(express.json());
app.use("/api/webhooks/brevo", require("./integrations/brevoWebhookRoutes"));
app.use("/api/v1/voice-callback", require("./calling/voiceCallbackRoutes"));
app.use("/api/v1/rb2b", require("./leads/rb2bRoutes"));
app.use(require("../middleware/error"));

let server, base;
test.before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const post = (path, headers = {}) =>
  fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ message: { type: "status-update" } }),
    signal: AbortSignal.timeout(5000),
  }).then((r) => r.status);

test("Brevo: right token passes (query or header), wrong token refused", async () => {
  assert.equal(await post("/api/webhooks/brevo/email?token=brevo-secret-123"), 200);
  assert.equal(await post("/api/webhooks/brevo/email", { "x-webhook-token": "brevo-secret-123" }), 200);
  assert.equal(await post("/api/webhooks/brevo/email?token=brevo-secret-12X"), 401);
  assert.equal(await post("/api/webhooks/brevo/email"), 401);
});

test("Vapi: right secret passes (header or query), wrong secret refused", async () => {
  assert.equal(await post("/api/v1/voice-callback/webhook", { "x-vapi-secret": "vapi-secret-456" }), 200);
  assert.equal(await post("/api/v1/voice-callback/webhook?secret=vapi-secret-456"), 200);
  assert.equal(await post("/api/v1/voice-callback/webhook", { "x-vapi-secret": "vapi-secret-45" }), 401);
  assert.equal(await post("/api/v1/voice-callback/webhook"), 401);
});

test("RB2B: right token passes, wrong token refused", async () => {
  assert.equal(await post("/api/v1/rb2b/ingest/rb2b-token-789"), 200);
  assert.equal(await post("/api/v1/rb2b/ingest/rb2b-token-78"), 401);
});
