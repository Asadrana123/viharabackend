// Public routes that start a Maya call (or send data on to a paid service)
// must hit the rate limit and the captcha before the controller runs.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

process.env.RECAPTCHA_API_KEY = "api-key";
delete process.env.QA_AGENT_TOKEN;

const app = express();
app.use(express.json());
app.use("/api/v1/lead", require("./calling/leadCallRoutes"));
app.use("/api/v1/georgia-st", require("./leads/georgiaStLeadRoutes"));
app.use("/api/v1/rensselaer-ave", require("./leads/rensselaerAveLeadRoutes"));
app.use("/api/landing", require("./leads/landingPageLeadRoutes"));
app.use("/api/ebook", require("./integrations/eBookRoutes"));
app.use("/api/sellProperty", require("./property/sellPropertyRoutes"));
app.use("/api/capi", require("./integrations/metaCapiRoutes"));
app.use("/api/facebook", require("./leads/facebookRoutes"));
app.use(require("../middleware/error")); // the real error middleware, as in app.js

let server;
let base;
test.before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const post = (path, ip, body = { phone: "+15555550100", consent: true }) =>
  fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify(body),
  });

const CALL_ROUTES = [
  "/api/v1/lead/register",
  "/api/v1/georgia-st/register",
  "/api/v1/rensselaer-ave/register",
  "/api/landing/register",
  "/api/ebook/request",
  "/api/sellProperty",
];

for (const [i, path] of CALL_ROUTES.entries()) {
  test(`${path} needs a captcha and is rate limited`, async () => {
    const ip = `198.51.100.${i + 10}`;
    const statuses = [];
    for (let n = 0; n < 6; n++) statuses.push((await post(path, ip)).status);
    // No captcha token: refused before the controller. The 6th is over the limit.
    assert.deepEqual(statuses, [400, 400, 400, 400, 400, 429]);
  });
}

test("CAPI tracking is rate limited", async () => {
  const statuses = [];
  for (let n = 0; n < 31; n++) statuses.push((await post("/api/capi/track", "198.51.100.50", {})).status);
  // event_name missing, so the controller answers 400; the limit kicks in after 30.
  assert.equal(statuses.filter((s) => s === 429).length, 1);
  assert.equal(statuses.at(-1), 429);
});

test("the Facebook test-call route is gone", async () => {
  const res = await fetch(`${base}/api/facebook/test-call?token=x&phone=%2B15555550100`);
  assert.equal(res.status, 404);
});
