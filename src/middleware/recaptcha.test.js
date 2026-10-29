const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const { verifyRecaptcha } = require("./recaptcha");

const realPost = axios.post;
const QA_TOKEN = "q".repeat(40);

const makeReq = ({ body = {}, headers = {} } = {}) => ({
  body,
  headers,
  ip: "1.2.3.4",
  get: (name) => headers[name.toLowerCase()],
});

// Runs the middleware and reports whether next() was called and what was sent.
async function run(req) {
  const out = { nextCalled: false, status: null, json: null };
  const res = {
    status(code) { out.status = code; return this; },
    json(body) { out.json = body; return this; },
  };
  await verifyRecaptcha(req, res, () => { out.nextCalled = true; });
  return out;
}

test.beforeEach(() => {
  process.env.RECAPTCHA_API_KEY = "api-key";
  process.env.RECAPTCHA_PROJECT_ID = "vihara-next-website";
  process.env.RECAPTCHA_SITE_KEY = "site-key";
  delete process.env.QA_AGENT_TOKEN;
});
test.afterEach(() => { axios.post = realPost; });

test("off when RECAPTCHA_API_KEY is not set, and still strips the body field", async () => {
  delete process.env.RECAPTCHA_API_KEY;
  const req = makeReq({ body: { email: "a@b.com", recaptchaToken: "t" } });
  const out = await run(req);
  assert.equal(out.nextCalled, true);
  assert.deepEqual(req.body, { email: "a@b.com" });
});

test("rejects a request with no token", async () => {
  const out = await run(makeReq());
  assert.equal(out.nextCalled, false);
  assert.equal(out.status, 400);
});

test("passes when Google says the token is valid, and sends project, key, site key and token", async () => {
  let call;
  axios.post = async (url, body, config) => { call = { url, body, config }; return { data: { tokenProperties: { valid: true } } }; };
  const req = makeReq({ body: { recaptchaToken: "good" } });
  const out = await run(req);
  assert.equal(out.nextCalled, true);
  assert.equal(call.url, "https://recaptchaenterprise.googleapis.com/v1/projects/vihara-next-website/assessments");
  assert.equal(call.config.params.key, "api-key");
  assert.equal(call.body.event.token, "good");
  assert.equal(call.body.event.siteKey, "site-key");
  assert.equal("recaptchaToken" in req.body, false);
});

test("reads the token from the header too", async () => {
  let body;
  axios.post = async (url, b) => { body = b; return { data: { tokenProperties: { valid: true } } }; };
  const out = await run(makeReq({ headers: { "x-recaptcha-token": "hdr" } }));
  assert.equal(out.nextCalled, true);
  assert.equal(body.event.token, "hdr");
});

test("rejects when Google says the token is bad or used", async () => {
  axios.post = async () => ({ data: { tokenProperties: { valid: false, invalidReason: "DUPE" } } });
  const out = await run(makeReq({ body: { recaptchaToken: "old" } }));
  assert.equal(out.nextCalled, false);
  assert.equal(out.status, 400);
});

test("returns 503 when Google can't be reached", async () => {
  axios.post = async () => { throw new Error("ECONNRESET"); };
  const out = await run(makeReq({ body: { recaptchaToken: "t" } }));
  assert.equal(out.nextCalled, false);
  assert.equal(out.status, 503);
});

test("QA agent requests skip the check", async () => {
  process.env.QA_AGENT_TOKEN = QA_TOKEN;
  axios.post = async () => { throw new Error("should not be called"); };
  const out = await run(makeReq({ headers: { "x-qa-agent-token": QA_TOKEN } }));
  assert.equal(out.nextCalled, true);
});
