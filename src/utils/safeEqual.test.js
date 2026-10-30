// SA-028: secrets compared in constant time; secrets kept out of our own log lines.
const test = require("node:test");
const assert = require("node:assert/strict");
const { safeEqual } = require("./safeEqual");
const { logPath } = require("./logPath");

test("safeEqual: only the exact secret matches; empty or missing never does", () => {
  assert.equal(safeEqual("s3cret-value", "s3cret-value"), true);
  assert.equal(safeEqual("s3cret-valuX", "s3cret-value"), false);
  assert.equal(safeEqual("s3cret", "s3cret-value"), false);
  assert.equal(safeEqual("", "s3cret-value"), false);
  assert.equal(safeEqual(undefined, "s3cret-value"), false);
  assert.equal(safeEqual("anything", ""), false);
  assert.equal(safeEqual("anything", undefined), false);
  assert.equal(safeEqual(undefined, undefined), false);
  assert.equal(safeEqual(["s3cret-value"], "s3cret-value"), true, "Express may give an array; String() of a one-item array is the value");
});

test("logPath: no query string, and key segments hidden", () => {
  const p = (originalUrl) => logPath({ originalUrl });
  assert.equal(p("/api/webhooks/brevo/email?token=abc123"), "/api/webhooks/brevo/email");
  assert.equal(p("/api/v1/voice-callback?secret=xyz"), "/api/v1/voice-callback");
  assert.equal(p("/api/v1/rb2b/ingest/tok3n?x=1"), "/api/v1/rb2b/ingest/***");
  assert.equal(p("/api/webhooks/vtext/imessage-bluebubbles/abcdef0123"), "/api/webhooks/vtext/imessage-bluebubbles/***");
  assert.equal(p("/api/v1/user/password/reset/rawtoken"), "/api/v1/user/password/reset/***");
  assert.equal(p("/api/v1/realtor/password/reset/rawtoken"), "/api/v1/realtor/password/reset/***");
  assert.equal(p("/api/v1/product/slug/test-home-1"), "/api/v1/product/slug/test-home-1");
});
