const test = require("node:test");
const assert = require("node:assert/strict");
const formRateLimit = require("./formRateLimit");
const { clientIp } = require("../utils/clientIp");

const makeReq = (headers = {}, ip = "10.0.0.1") => ({ headers, ip });

// Sends n requests through the limiter and returns the status of each (200 = passed).
function send(limiter, reqs) {
  return reqs.map((req) => {
    let status = 200;
    const res = { status(code) { status = code; return this; }, json() { return this; } };
    limiter(req, res, () => {});
    return status;
  });
}

test("visitor IP comes from Cloudflare's header, not X-Forwarded-For", () => {
  assert.equal(clientIp(makeReq({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1, 203.0.113.7" })), "203.0.113.7");
  assert.equal(clientIp(makeReq({ "true-client-ip": "203.0.113.8", "x-forwarded-for": "1.1.1.1" })), "203.0.113.8");
  // No Cloudflare (local dev): the socket address, never the visitor-supplied header.
  assert.equal(clientIp(makeReq({ "x-forwarded-for": "1.1.1.1" }, "127.0.0.1")), "127.0.0.1");
});

test("a random X-Forwarded-For on every request doesn't get a fresh limit", () => {
  const limiter = formRateLimit({ name: "t-spoof", max: 3 });
  const reqs = Array.from({ length: 5 }, (_, i) =>
    makeReq({ "cf-connecting-ip": "198.51.100.1", "x-forwarded-for": `9.9.9.${i}` })
  );
  assert.deepEqual(send(limiter, reqs), [200, 200, 200, 429, 429]);
});

test("different visitors and different named limiters have their own counts", () => {
  const a = formRateLimit({ name: "t-a", max: 1 });
  const b = formRateLimit({ name: "t-b", max: 1 });
  const visitor1 = makeReq({ "cf-connecting-ip": "198.51.100.2" });
  const visitor2 = makeReq({ "cf-connecting-ip": "198.51.100.3" });
  assert.deepEqual(send(a, [visitor1, visitor2, visitor1]), [200, 200, 429]);
  assert.deepEqual(send(b, [visitor1]), [200]);
});
