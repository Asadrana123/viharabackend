// OUTBOUND_DISABLED=true (local runs): no calls, texts, emails or Slack posts leave the server.
// Nothing here touches the network: https.request is replaced with a recorder before the guard wraps it.
const test = require("node:test");
const assert = require("node:assert/strict");
const https = require("https");
const { EventEmitter } = require("events");

// A fake network: records each request and answers 200 {} so callers finish.
const sent = [];
https.request = function fakeRequest(...args) {
  const opts = args.find((a) => a && typeof a === "object" && !(a instanceof URL)) || {};
  sent.push({ host: opts.hostname || opts.host, method: (opts.method || "GET").toUpperCase() });
  const req = new EventEmitter();
  req.setTimeout = () => req; req.write = () => true; req.destroy = () => req;
  req.end = () => {
    const res = new EventEmitter();
    Object.assign(res, { statusCode: 200, headers: { "content-type": "application/json" } });
    const cb = args.find((a) => typeof a === "function");
    process.nextTick(() => { cb && cb(res); req.emit("response", res); res.emit("data", Buffer.from("{}")); res.emit("end"); });
  };
  return req;
};

const axios = require("axios");
const { outboundDisabled, OUTBOUND_DISABLED_ERROR, installOutboundGuards, isBlockedHost } = require("../../config/outboundSwitch");
installOutboundGuards();
const { dispatchCall } = require("./vapiService");
const { sendEmailAsync } = require("../../utils/sendEmail");
const sendEmail = require("../../utils/sendEmail");

const withEnv = async (value, fn) => {
  const before = process.env.OUTBOUND_DISABLED;
  if (value == null) delete process.env.OUTBOUND_DISABLED; else process.env.OUTBOUND_DISABLED = value;
  try { return await fn(); } finally {
    if (before == null) delete process.env.OUTBOUND_DISABLED; else process.env.OUTBOUND_DISABLED = before;
  }
};

test("the switch is on only for the exact value true", async () => {
  await withEnv(null, () => assert.equal(outboundDisabled(), false));
  await withEnv("false", () => assert.equal(outboundDisabled(), false));
  await withEnv("1", () => assert.equal(outboundDisabled(), false));
  await withEnv("true", () => assert.equal(outboundDisabled(), true));
});

test("with the switch on, dispatchCall refuses before touching the database or Vapi", async () => {
  sent.length = 0;
  const r = await withEnv("true", () => dispatchCall("+14105552291", { fullName: "Test Person", timezone: "America/New_York" }));
  assert.deepEqual(r, { success: false, phone: "+14105552291", error: OUTBOUND_DISABLED_ERROR });
  assert.equal(sent.length, 0);
});

test("blocked hosts: Brevo, Slack, Twilio, Sendblue, Vapi and their subdomains; nothing else", () => {
  for (const h of ["api.brevo.com", "hooks.slack.com", "slack.com", "api.twilio.com", "api.sendblue.co", "api.vapi.ai", "API.BREVO.COM:443"]) assert.ok(isBlockedHost(h), h);
  for (const h of ["zernio.com", "analyticsdata.googleapis.com", "t8hiw68l.api.sanity.io", "www.clarity.ms", "notslack.com"]) assert.ok(!isBlockedHost(h), h);
});

test("with the switch on, sends to Brevo and Slack fail and never reach the network", async () => {
  sent.length = 0;
  await withEnv("true", async () => {
    await assert.rejects(axios.post("https://api.brevo.com/v3/smtp/email", { to: [{ email: "x@example.test" }] }), /OUTBOUND_DISABLED/);
    await assert.rejects(axios.post("https://hooks.slack.com/services/T000/B000/XXX", { text: "hi" }), /OUTBOUND_DISABLED/);
    assert.throws(() => https.request({ hostname: "hooks.slack.com", method: "POST", path: "/services/x" }), /OUTBOUND_DISABLED/);
  });
  assert.deepEqual(sent, []);
});

test("with the switch on, reads still work and other hosts are untouched", async () => {
  sent.length = 0;
  await withEnv("true", async () => {
    await axios.get("https://api.brevo.com/v3/contacts/x%40example.test");
    await axios.post("https://zernio.com/api/v1/analytics/googleanalytics/report", {});
  });
  assert.deepEqual(sent.map((s) => `${s.method} ${s.host}`), ["GET api.brevo.com", "POST zernio.com"]);
});

test("with the switch off, nothing is blocked", async () => {
  sent.length = 0;
  await withEnv(null, () => axios.post("https://hooks.slack.com/services/T000/B000/XXX", { text: "hi" }));
  assert.deepEqual(sent.map((s) => `${s.method} ${s.host}`), ["POST hooks.slack.com"]);
});

test("with the switch on, Gmail emails are not sent", async () => {
  await withEnv("true", async () => {
    await assert.rejects(sendEmailAsync("x@example.test", "Subject", "<p>hi</p>"), /OUTBOUND_DISABLED/);
    assert.doesNotThrow(() => sendEmail("x@example.test", "X", "Subject", "<p>hi</p>"));
  });
});
