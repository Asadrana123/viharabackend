// SA-035: only www.vihara.ai and localhost:3000 may use the login cookie. Vercel previews can still call the API for public data, but
// always as a logged-out visitor, over HTTP and over Socket.IO.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const jwt = require("jsonwebtoken");

process.env.secret = "cors-test-secret";
delete process.env.NODE_ENV;

const userModel = require("../model/users/userModel");
const USER = { _id: "64b7f0f0f0f0f0f0f0f0f0f3", name: "Test", email: "u@example.test", role: "user" };
userModel.findById = (id) => {
  const doc = String(id) === USER._id ? USER : null;
  const p = Promise.resolve(doc);
  p.select = () => Promise.resolve(doc); // the socket server chains .select()
  return p;
};

const { expressCorsOptions, dropPreviewCookies, isPreviewOrigin } = require("../config/corsConfig");
const { isAuthenticated } = require("../middleware/auth");

const app = express();
app.use(dropPreviewCookies);
app.use(cookieParser());
app.use(cors(expressCorsOptions));
app.get("/public", (req, res) => res.json({ ok: true }));
app.get("/me", isAuthenticated, (req, res) => res.json({ id: String(req.user._id) }));
app.post("/login", (req, res) => res.cookie("token", "new-session").json({ ok: true }));
app.use(require("../middleware/error"));

const server = http.createServer(app);
// Unref the socket rate limiter's cleanup interval so the test can exit.
const realSetInterval = global.setInterval;
global.setInterval = (...args) => realSetInterval(...args).unref();
require("../socket/socketServer")(server);
global.setInterval = realSetInterval;

let base;
test.before(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const TOKEN = jwt.sign({ id: USER._id, role: "user" }, process.env.secret, { expiresIn: "1h" });
const SITE = "https://www.vihara.ai";
const PREVIEW = "https://vihara-next-abc123xyz-nodifys-projects.vercel.app";
const get = (path, origin, extra = {}) => fetch(base + path, { headers: { origin, cookie: `token=${TOKEN}`, ...extra } });

test("which addresses count as previews", () => {
  assert.equal(isPreviewOrigin(PREVIEW), true);
  assert.equal(isPreviewOrigin("https://vihara-next-git-main-nodifys-projects.vercel.app"), true);
  assert.equal(isPreviewOrigin("https://vihara-new-website-nodifys-projects.vercel.app"), true);
  assert.equal(isPreviewOrigin(SITE), false);
  assert.equal(isPreviewOrigin("https://vihara-next-evil-otherteam.vercel.app"), false);
  assert.equal(isPreviewOrigin(undefined), false);
});

test("the live website is signed in as before", async () => {
  const res = await get("/me", SITE);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), SITE);
});

test("a preview can load public data but is always logged out", async () => {
  const pub = await get("/public", PREVIEW);
  assert.equal(pub.status, 200);
  assert.equal(pub.headers.get("access-control-allow-origin"), PREVIEW);
  assert.equal(pub.headers.get("access-control-allow-credentials"), "true");

  const me = await get("/me", PREVIEW);
  assert.equal(me.status, 401, "the login cookie is ignored for previews");
});

test("a preview can't set the login cookie", async () => {
  const fromPreview = await fetch(base + "/login", { method: "POST", headers: { origin: PREVIEW } });
  assert.equal(fromPreview.headers.get("set-cookie"), null);
  const fromSite = await fetch(base + "/login", { method: "POST", headers: { origin: SITE } });
  assert.match(fromSite.headers.get("set-cookie"), /token=new-session/);
});

test("unknown sites are refused", async () => {
  const res = await get("/public", "https://evil.example");
  assert.equal(res.status, 403);
});

// Socket.IO over plain HTTP polling: open, send the connect packet, read the answer.
async function socketConnect(origin) {
  const headers = { origin, cookie: `token=${TOKEN}` };
  const open = await (await fetch(`${base}/socket.io/?EIO=4&transport=polling`, { headers })).text();
  const sid = JSON.parse(open.slice(1)).sid;
  await fetch(`${base}/socket.io/?EIO=4&transport=polling&sid=${sid}`, { method: "POST", headers: { ...headers, "content-type": "text/plain" }, body: "40" });
  return (await fetch(`${base}/socket.io/?EIO=4&transport=polling&sid=${sid}`, { headers })).text();
}

test("live auctions: the site connects signed in, a preview is refused like a logged-out visitor", async () => {
  assert.match(await socketConnect(SITE), /^40\{"sid"/);
  assert.match(await socketConnect(PREVIEW), /^44.*Cookies missing/);
});

test("the local website (localhost:3000) is signed in like the live site", async () => {
  const res = await get("/me", "http://localhost:3000");
  assert.equal(res.status, 200);
});
