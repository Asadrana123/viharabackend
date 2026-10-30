// SA-016: raw internal error text on 500s goes to the log, not to visitors. Admins and our agents still see it.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const Errorhandler = require("../utils/errorhandler");
const hideServerErrors = require("./hideServerErrors");
const { GENERIC } = hideServerErrors;

const RAW = "MongoServerError: connection to 10.0.3.4:27017 closed";

const app = express();
app.use(hideServerErrors);
// Stand-in for the route's own auth: ?as=admin / ?as=user / ?as=qa
app.use((req, res, next) => {
  if (req.query.as === "admin") req.user = { role: "admin" };
  if (req.query.as === "user") req.user = { role: "user" };
  if (req.query.as === "qa") req.isQaTest = true;
  next();
});
app.get("/thrown", () => { throw new Error(RAW); });
app.get("/wrapped", (req, res, next) => next(new Errorhandler(RAW, 500)));
app.get("/direct", (req, res) => res.status(500).json({ success: false, message: "Failed to load", error: RAW, details: { host: "10.0.3.4" }, requestId: "r1" }));
app.get("/bad-gateway", (req, res) => res.status(502).json({ success: false, message: RAW }));
app.get("/client-error", (req, res, next) => next(new Errorhandler("Please enter email and password", 400)));
app.get("/ok", (req, res) => res.json({ success: true, message: "Saved" }));
app.get("/list", (req, res) => res.status(500).json(["x"]));
app.use(require("./error"));

let base, server;
const logged = [];
const realError = console.error, realLog = console.log;
test.before(async () => {
  console.error = (...a) => logged.push(a.join(" "));
  console.log = () => {};
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); console.error = realError; console.log = realLog; });

const get = async (p) => { const res = await fetch(base + p); return { status: res.status, body: await res.json() }; };

test("visitors and normal users get a plain message on 500s, with the status kept", async () => {
  for (const p of ["/thrown", "/wrapped", "/direct", "/bad-gateway", "/thrown?as=user"]) {
    const { status, body } = await get(p);
    assert.ok(status >= 500, p);
    assert.equal(body.message, GENERIC, p);
    assert.equal(body.error, GENERIC, p);
    assert.equal(body.success, false, p);
    assert.ok(!JSON.stringify(body).includes("10.0.3.4"), `${p} leaks nothing`);
  }
});

test("other fields stay, detail fields go", async () => {
  const { body } = await get("/direct");
  assert.deepEqual(body, { success: false, message: GENERIC, error: GENERIC, requestId: "r1" });
});

test("the original text is in the server log", async () => {
  logged.length = 0;
  await get("/direct");
  assert.ok(logged.some((l) => l.includes("/direct 500") && l.includes(RAW)));
});

test("admins and the QA agent still see the real message", async () => {
  assert.equal((await get("/wrapped?as=admin")).body.message, RAW);
  assert.equal((await get("/direct?as=admin")).body.error, RAW);
  assert.equal((await get("/thrown?as=qa")).body.message, RAW);
});

test("4xx and normal answers are untouched", async () => {
  assert.deepEqual(await get("/client-error"), { status: 400, body: { success: false, message: "Please enter email and password", error: "Please enter email and password" } });
  assert.deepEqual(await get("/ok"), { status: 200, body: { success: true, message: "Saved" } });
  assert.deepEqual(await get("/list"), { status: 500, body: ["x"] });
});
