// SA-010 (unsubscribe page: escaped, plain email only, old links still work) and
// SA-037 (the Google Slides connect state can't be used as a login cookie).
// No database: model lookups are stubbed.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");

process.env.secret = "page-token-test-secret";

const Unsubscribe = require("../model/integrations/unsubscribeModel");
const userModel = require("../model/users/userModel");
const googleAuth = require("../services/slides/googleAuthService");
const { isAuthenticated } = require("../middleware/auth");
const { connect, callback } = require("../controller/slides/googleSlidesController");

const unsubscribed = new Set(["already@example.test"]);
const lookups = [];
Unsubscribe.findOne = async (q) => { lookups.push(q); return unsubscribed.has(q.email) ? { email: q.email } : null; };
Unsubscribe.create = async ({ email }) => { unsubscribed.add(email); return { email }; };

const ADMIN = { _id: "64b7f0f0f0f0f0f0f0f0f0f2", name: "Test", last_name: "Admin", role: "admin" };
userModel.findById = async (id) => (String(id) === ADMIN._id ? ADMIN : null);
googleAuth.getAuthUrl = (state) => `https://accounts.google.test/o/oauth2/auth?state=${encodeURIComponent(state)}`;
const savedConnections = [];
googleAuth.saveConnectionFromCode = async (code, admin) => { savedConnections.push(admin.id); };

const app = express();
app.use(cookieParser());
app.use("/api", require("./integrations/unsubscribeRoutes"));
app.get("/me", isAuthenticated, (req, res) => res.json({ id: String(req.user._id) }));
app.get("/slides/connect", (req, res, next) => { req.user = ADMIN; next(); }, connect);
app.get("/slides/callback", callback);
app.use(require("../middleware/error"));

let server, base;
test.before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const get = (path, headers = {}) => fetch(base + path, { headers: { "cf-connecting-ip": "198.51.100.20", ...headers }, redirect: "manual" });

test("unsubscribe: script in the link is shown as text, never run", async () => {
  const evil = `x"><script>alert(document.cookie)</script>@example.test`;
  const res = await get(`/api/unsubscribe?email=${encodeURIComponent(evil)}`);
  const html = await res.text();
  assert.equal(res.status, 400);
  assert.ok(!html.includes("<script>alert"), "no live script tag in the page");
});

test("unsubscribe: database operators in the link are refused", async () => {
  lookups.length = 0;
  const res = await get("/api/unsubscribe?email[$ne]=x");
  assert.equal(res.status, 400);
  assert.equal(lookups.length, 0, "nothing reached the database");
});

test("unsubscribe: old one-click links still work, including + addresses", async () => {
  let res = await get("/api/unsubscribe?email=jane@example.test");
  assert.equal(res.status, 200);
  assert.match(await res.text(), /jane@example\.test/);
  assert.ok(unsubscribed.has("jane@example.test"));

  // Old links didn't encode "+", so it arrives as a space.
  res = await get("/api/unsubscribe?email=jane+news@example.test");
  assert.equal(res.status, 200);
  assert.ok(unsubscribed.has("jane+news@example.test"));

  res = await get("/api/unsubscribe?email=already@example.test");
  assert.equal(res.status, 200);
  assert.match(await res.text(), /already@example\.test/);
});

test("Slides: the connect state is refused as a login cookie, but still works for the callback", async () => {
  const { url } = await (await get("/slides/connect")).json();
  const state = new URL(url).searchParams.get("state");

  const asLogin = await get("/me", { cookie: `token=${state}` });
  assert.equal(asLogin.status, 401);

  const back = await get(`/slides/callback?code=abc&state=${encodeURIComponent(state)}`);
  assert.equal(back.status, 302);
  assert.match(back.headers.get("location"), /connected/);
  assert.deepEqual(savedConnections, [ADMIN._id]);

  // A real login token is still accepted.
  const login = jwt.sign({ id: ADMIN._id, role: "admin" }, process.env.secret, { expiresIn: "1h" });
  const me = await get("/me", { cookie: `token=${login}` });
  assert.equal(me.status, 200);
});

test("Slides: a login token can't be used as a connect state", async () => {
  const login = jwt.sign({ purpose: "google-slides-connect", id: ADMIN._id }, process.env.secret, { expiresIn: "1h" });
  const back = await get(`/slides/callback?code=abc&state=${encodeURIComponent(login)}`);
  assert.match(back.headers.get("location"), /expired/);
});

test("unsubscribe pages escape the email even on their own", () => {
  const evil = `<img src=x onerror=alert(1)>`;
  for (const page of [require("../htmlPages/shared/successPage"), require("../htmlPages/integrations/alreadyUnsubscribedPage"), require("../htmlPages/shared/errorPage")]) {
    const html = page(evil);
    assert.ok(!html.includes("<img src=x"), page.name);
    assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"), page.name);
  }
});
