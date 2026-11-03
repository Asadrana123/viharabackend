// The Cal.com webhook: a bad or missing signature is refused; a good one gets 200 and is handed on.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const express = require("express");

process.env.CALCOM_WEBHOOK_SECRET = "cal-secret-1";
console.log = console.warn = () => {};

// No database: the route destructures handleCalWebhook when loaded, so stub it first.
const handled = [];
require("../services/calcom/calcomBookingService").handleCalWebhook = async (body) => handled.push(body);

const app = express();
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use("/api/webhooks/calcom", require("./integrations/calcomWebhookRoutes"));

let server, base;
test.before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/api/webhooks/calcom`;
});
test.after(() => server.close());

const raw = JSON.stringify({ triggerEvent: "BOOKING_CREATED", payload: { uid: "u1" } });
const sign = (s, secret = "cal-secret-1") => crypto.createHmac("sha256", secret).update(s).digest("hex");
const post = (headers) => fetch(base, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: raw });

test("no signature -> 401", async () => {
  assert.equal((await post({})).status, 401);
});

test("signature with the wrong secret -> 401", async () => {
  assert.equal((await post({ "X-Cal-Signature-256": sign(raw, "nope") })).status, 401);
});

test("right signature -> 200, and the booking is handled", async () => {
  const res = await post({ "X-Cal-Signature-256": sign(raw) });
  assert.equal(res.status, 200);
  await new Promise((r) => setImmediate(r));
  assert.equal(handled.length, 1);
  assert.equal(handled[0].payload.uid, "u1");
});
