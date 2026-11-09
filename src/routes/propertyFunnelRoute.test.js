// Property Funnel route (AC-7, our version): only admins can read GET /api/v1/admin-analytics/property-funnel.
// No database: the user lookup is stubbed.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");

process.env.secret = "property-funnel-test-secret";

const userModel = require("../model/users/userModel");

const ADMIN = { _id: "64b7f0f0f0f0f0f0f0f0f0a1", role: "admin" };
const BUYER = { _id: "64b7f0f0f0f0f0f0f0f0a2", role: "user" };
userModel.findById = async (id) => [ADMIN, BUYER].find((u) => u._id === String(id)) || null;

const app = express();
app.use(cookieParser());
app.use("/api/v1/admin-analytics", require("./analytics/adminAnalyticsRoutes"));
app.use(require("../middleware/error"));

let server, base;
test.before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const URL_PATH = "/api/v1/admin-analytics/property-funnel";
const as = (user) => ({ cookie: `token=${jwt.sign({ id: user._id }, process.env.secret)}` });
const get = (headers = {}) => fetch(base + URL_PATH, { headers });

test("signed out: 401, no data", async () => {
  const res = await get();
  assert.equal(res.status, 401);
  assert.equal((await res.json()).source, undefined);
});

test("signed in but not an admin: 403, no data", async () => {
  const res = await get(as(BUYER));
  assert.equal(res.status, 403);
  assert.equal((await res.json()).source, undefined);
});

test("admin, PROPERTY_FUNNEL_SOURCE unset: tells the tab to show its sample", async () => {
  delete process.env.PROPERTY_FUNNEL_SOURCE;
  const res = await get(as(ADMIN));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await res.json(), { success: true, source: "sample" });
});
