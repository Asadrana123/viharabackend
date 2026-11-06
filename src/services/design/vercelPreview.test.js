const test = require("node:test");
const assert = require("node:assert/strict");
const { previewFromDeployments } = require("./vercelPreview");

const SHA = "a".repeat(40);
const dep = (fields) => ({ url: "vihara-next-abc123-nodifys-projects.vercel.app", createdAt: 1, meta: { githubCommitSha: SHA }, ...fields });

test("no deployment yet → pending", () => {
  assert.deepEqual(previewFromDeployments([], SHA), { state: "pending" });
  assert.deepEqual(previewFromDeployments(undefined, SHA), { state: "pending" });
});

test("still building → pending", () => {
  assert.deepEqual(previewFromDeployments([dep({ readyState: "BUILDING" })], SHA), { state: "pending" });
  assert.deepEqual(previewFromDeployments([dep({ readyState: "QUEUED" })], SHA), { state: "pending" });
});

test("ready → success with the https preview link", () => {
  assert.deepEqual(previewFromDeployments([dep({ readyState: "READY" })], SHA), {
    state: "success",
    url: "https://vihara-next-abc123-nodifys-projects.vercel.app",
  });
});

test("falls back to `state` when readyState is missing", () => {
  assert.equal(previewFromDeployments([dep({ state: "READY" })], SHA).state, "success");
});

test("build error or cancelled → failure", () => {
  assert.equal(previewFromDeployments([dep({ readyState: "ERROR", inspectorUrl: "https://vercel.com/x" })], SHA).state, "failure");
  assert.equal(previewFromDeployments([dep({ readyState: "CANCELED" })], SHA).state, "failure");
});

test("newest deployment of the commit wins (a rebuild after a failure)", () => {
  const result = previewFromDeployments(
    [dep({ readyState: "ERROR", createdAt: 1 }), dep({ readyState: "READY", createdAt: 2 })],
    SHA
  );
  assert.equal(result.state, "success");
});

test("ignores production deployments and other commits", () => {
  assert.deepEqual(previewFromDeployments([dep({ readyState: "READY", target: "production" })], SHA), { state: "pending" });
  assert.deepEqual(
    previewFromDeployments([dep({ readyState: "READY", meta: { githubCommitSha: "b".repeat(40) } })], SHA),
    { state: "pending" }
  );
});
