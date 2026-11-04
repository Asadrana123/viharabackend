const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const bodyParser = require("body-parser");
const stripMongoOperators = require("./stripMongoOperators");

const run = (req) => { stripMongoOperators(req, {}, () => {}); return req; };

test("operator keys are removed at any depth, normal data is untouched", () => {
  const req = run({
    method: "POST", path: "/x",
    body: { email: { $regex: "^a" }, password: { $ne: null }, name: "Jane", tags: ["a", { $gt: 1, ok: 2 }], nested: { deep: { $where: "1" }, keep: 1 } },
    query: { email: { $ne: "x" }, page: "2" },
  });
  assert.deepEqual(req.body, { email: {}, password: {}, name: "Jane", tags: ["a", { ok: 2 }], nested: { deep: {}, keep: 1 } });
  assert.deepEqual(req.query, { email: {}, page: "2" });
});

test("bodies without operators, and empty bodies, pass through unchanged", () => {
  const body = { email: "jane+news@example.test", price: "$500,000", note: "costs $5", list: [1, 2] };
  assert.deepEqual(run({ method: "POST", path: "/x", body: structuredClone(body), query: {} }).body, body);
  assert.doesNotThrow(() => run({ method: "GET", path: "/x", body: undefined, query: {} }));
});

test("through Express: JSON body and ?email[$ne]= query both arrive clean; the raw body is kept", async () => {
  const app = express();
  app.use(bodyParser.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
  app.use(stripMongoOperators);
  app.post("/echo", (req, res) => res.json({ body: req.body, query: req.query, raw: req.rawBody.toString() }));
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  try {
    const sent = JSON.stringify({ email: { $regex: "^a" }, password: "x" });
    const res = await fetch(`http://127.0.0.1:${server.address().port}/echo?email[$ne]=x&page=1`, {
      method: "POST", headers: { "content-type": "application/json" }, body: sent,
    });
    const out = await res.json();
    assert.deepEqual(out.body, { email: {}, password: "x" });
    assert.deepEqual(out.query, { email: {}, page: "1" });
    assert.equal(out.raw, sent, "webhook signature checks still see the exact bytes");
  } finally {
    server.close();
  }
});
