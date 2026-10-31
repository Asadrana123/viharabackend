const test = require("node:test");
const assert = require("node:assert/strict");
const { storage, cleanCut, uploadUrl, viewUrl } = require("./cutStorage");

const SHA = "a".repeat(64);
const ENV = { SPACES_KEY: "test-key", SPACES_SECRET: "test-secret", SPACES_REGION: "nyc3", SPACES_BUCKET: "cuts-test" };

test("is off until all four settings exist", async () => {
  assert.equal(storage({}), null);
  assert.equal(storage({ ...ENV, SPACES_SECRET: "" }), null);
  assert.equal(await viewUrl("cuts/x.mp4", {}), null);
  assert.equal(await uploadUrl("cuts/x.mp4", {}), null);
});

test("names a cut by its content under its video", () => {
  const c = cleanCut("LV18753-V01", { sha256: SHA, name: "AP-LV18753-V01.mp4", bytes: 30_000_000 });
  assert.equal(c.key, `cuts/LV18753-V01/${SHA}.mp4`);
});

test("refuses a cut it cannot trust", () => {
  const ok = { sha256: SHA, name: "CR-X-V01.mp4", bytes: 10 };
  assert.throws(() => cleanCut("X", { ...ok, sha256: "abc" }), /SHA-256/);
  assert.throws(() => cleanCut("X", { ...ok, name: "../../secret.mp4" }), /plain file name/);
  assert.throws(() => cleanCut("X", { ...ok, name: "cut.exe" }), /plain file name/);
  assert.throws(() => cleanCut("X", { ...ok, bytes: 0 }), /MB/);
  assert.throws(() => cleanCut("X", { ...ok, bytes: 501_000_000 }), /MB/);
});

test("signed links expire and carry no secret", async () => {
  const watch = new URL(await viewUrl("cuts/X/a.mp4", ENV));
  assert.equal(watch.hostname, "cuts-test.nyc3.digitaloceanspaces.com");
  assert.equal(watch.searchParams.get("X-Amz-Expires"), "7200");
  const up = new URL(await uploadUrl("cuts/X/a.mp4", ENV));
  assert.equal(up.searchParams.get("X-Amz-Expires"), "900");
  assert.equal(up.searchParams.has("x-amz-checksum-crc32"), false);
  assert.equal(`${watch}${up}`.includes("test-secret"), false);
});
