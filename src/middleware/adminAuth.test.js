const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const adminModel = require("../model/users/adminModel");
const userModel = require("../model/users/userModel");
const { resolveAdvisor } = require("./adminAuth");

process.env.secret = "admin-auth-test-secret";
const ID = "64b000000000000000000001";

const realAdminFind = adminModel.findById;
const realUserFind = userModel.findById;
test.afterEach(() => { adminModel.findById = realAdminFind; userModel.findById = realUserFind; });

// adminModel finds nothing; userModel returns `user` (or null).
function mockUser(user) {
  adminModel.findById = () => ({ select: async () => null });
  userModel.findById = () => ({ select: async () => user });
}

function run({ method = "POST", token = jwt.sign({ id: ID }, process.env.secret) } = {}) {
  return new Promise((resolve) => {
    const req = { method, cookies: token ? { token } : {} };
    resolveAdvisor(req, {}, (err) => resolve({ err, advisor: req.advisor }));
  });
}

test("resolveAdvisor: a normal user account is refused (403)", async () => {
  mockUser({ _id: ID, name: "Buyer", email: "b@example.test", role: "user" });
  const { err, advisor } = await run();
  assert.equal(err.statuscode, 403);
  assert.equal(advisor, undefined);
});

test("resolveAdvisor: a seller account is refused (403), reads included", async () => {
  mockUser({ _id: ID, name: "Seller", email: "s@example.test", role: "seller" });
  const { err } = await run({ method: "GET" });
  assert.equal(err.statuscode, 403);
});

test("resolveAdvisor: an admin user passes and becomes the advisor", async () => {
  mockUser({ _id: ID, name: "Ada", email: "ada@example.test", role: "admin" });
  const { err, advisor } = await run();
  assert.equal(err, undefined);
  assert.deepEqual(advisor, { id: ID, name: "Ada" });
});

test("resolveAdvisor: QA admin accounts can read but not write", async () => {
  mockUser({ _id: ID, name: "QA", email: "qa@example.test", role: "admin", isQaAccount: true });
  assert.equal((await run({ method: "GET" })).err, undefined);
  assert.equal((await run({ method: "POST" })).err.statuscode, 403);
});

test("resolveAdvisor: an account in the admin collection still passes", async () => {
  adminModel.findById = () => ({ select: async () => ({ _id: ID, name: "Old Admin", email: "o@example.test" }) });
  userModel.findById = () => { throw new Error("should not look in users"); };
  const { err, advisor } = await run();
  assert.equal(err, undefined);
  assert.equal(advisor.name, "Old Admin");
});

test("resolveAdvisor: no cookie or a bad token is 401", async () => {
  mockUser(null);
  assert.equal((await run({ token: null })).err.statuscode, 401);
  assert.equal((await run({ token: "garbage" })).err.statuscode, 401);
  assert.equal((await run()).err.statuscode, 401, "token for an account that doesn't exist");
});
