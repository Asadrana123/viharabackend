// SA-019: a password change or reset signs out older sessions; tokens and accounts from before this count as version 0,
// so nobody is signed out when it ships. Password reset enforces the 8-character rule.
const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.secret = "token-version-test-secret";

const userModel = require("../model/users/userModel");
const realtorModel = require("../model/users/realtorModel");
const adminModel = require("../model/users/adminModel");

const ID = "64b7f0f0f0f0f0f0f0f0f0f4";
let account; // what the "database" returns for ID
const lookup = (id) => {
  const doc = String(id) === ID ? account : null;
  const p = Promise.resolve(doc);
  p.select = () => Promise.resolve(doc);
  return p;
};
userModel.findById = lookup;
realtorModel.findById = lookup;
adminModel.findById = () => ({ select: () => Promise.resolve(null) });

const { isAuthenticated, optionalAuth } = require("./auth");
const { isRealtorAuthenticated } = require("./realtorAuth");
const { resolveAdvisor } = require("./adminAuth");
const { tokenVersionMatches } = require("../utils/tokenVersion");

const sign = (payload) => jwt.sign({ id: ID, ...payload }, process.env.secret, { expiresIn: "1h" });

// Runs a middleware and resolves with the error passed to next() (undefined when it let the request through).
const run = (mw, req) => new Promise((resolve) => {
  req.method = req.method || "GET";
  const out = mw(req, {}, (err) => resolve({ err, req }));
  if (out && typeof out.catch === "function") out.catch((e) => resolve({ err: e, req }));
});

test("version check: missing counts as 0 on both sides", () => {
  assert.equal(tokenVersionMatches({}, {}), true);
  assert.equal(tokenVersionMatches({ tv: 0 }, { tokenVersion: undefined }), true);
  assert.equal(tokenVersionMatches({}, { tokenVersion: 1 }), false);
  assert.equal(tokenVersionMatches({ tv: 1 }, { tokenVersion: 2 }), false);
  assert.equal(tokenVersionMatches({ tv: 2 }, { tokenVersion: 2 }), true);
});

test("site login: a token from before this change still works for an untouched account", async () => {
  account = { _id: ID, role: "user" }; // no tokenVersion stored yet
  const { err, req } = await run(isAuthenticated, { cookies: { token: sign({ role: "user" }) } });
  assert.equal(err, undefined);
  assert.equal(String(req.user._id), ID);
});

test("site login: after a password change, older tokens are refused and the new one works", async () => {
  account = { _id: ID, role: "user", tokenVersion: 1 };
  const old = await run(isAuthenticated, { cookies: { token: sign({ role: "user" }) } });
  assert.equal(old.err.statuscode, 401);
  assert.equal(old.req.user, undefined);
  const fresh = await run(isAuthenticated, { cookies: { token: sign({ role: "user", tv: 1 }) } });
  assert.equal(fresh.err, undefined);
});

test("optional login (public pages): an older token just counts as logged out", async () => {
  account = { _id: ID, role: "user", tokenVersion: 3 };
  const old = await run(optionalAuth, { cookies: { token: sign({ tv: 2 }) } });
  assert.equal(old.err, undefined);
  assert.equal(old.req.user, undefined);
  const fresh = await run(optionalAuth, { cookies: { token: sign({ tv: 3 }) } });
  assert.equal(String(fresh.req.user._id), ID);
});

test("lead notes (admin): an older token is refused", async () => {
  account = { _id: ID, role: "admin", name: "A", tokenVersion: 1 };
  assert.equal((await run(resolveAdvisor, { cookies: { token: sign({ tv: 0 }) } })).err.statuscode, 401);
  assert.equal((await run(resolveAdvisor, { cookies: { token: sign({ tv: 1 }) } })).err, undefined);
});

test("realtor login: older tokens are refused after a reset, old-format tokens work for untouched accounts", async () => {
  account = { _id: ID, status: "approved" };
  assert.equal((await run(isRealtorAuthenticated, { cookies: { realtorToken: sign({ kind: "realtor" }) } })).err, undefined);
  account = { _id: ID, status: "approved", tokenVersion: 1 };
  assert.equal((await run(isRealtorAuthenticated, { cookies: { realtorToken: sign({ kind: "realtor" }) } })).err.statuscode, 401);
  assert.equal((await run(isRealtorAuthenticated, { cookies: { realtorToken: sign({ kind: "realtor", tv: 1 }) } })).err, undefined);
});

test("new tokens carry the account's version", () => {
  process.env.expireTime = "1h";
  const u = new userModel({ name: "Test", email: "t@example.test", password: "x".repeat(8) });
  assert.equal(jwt.decode(u.getJWTToken()).tv, 0);
  u.tokenVersion = 4;
  assert.equal(jwt.decode(u.getJWTToken()).tv, 4);
  const r = new realtorModel({ name: "R", email: "r@example.test", password: "x".repeat(8), tokenVersion: 2 });
  assert.equal(jwt.decode(r.getJWTToken()).tv, 2);
});

test("password reset: short or missing passwords are refused before anything is saved", async () => {
  const { resetPassword } = require("../controller/users/userController");
  const { resetPasswordRealtor } = require("../controller/users/realtorController");
  let saved = 0;
  const doc = { tokenVersion: 0, save: async () => { saved++; } };
  userModel.findOne = async () => doc;
  realtorModel.findOne = async () => doc;
  for (const fn of [resetPassword, resetPasswordRealtor]) {
    for (const password of ["short", undefined, { $gt: "" }, 12345678]) {
      const { err } = await run(fn, { params: { token: "t" }, body: { password } });
      assert.equal(err.statuscode, 400, `${fn.name}: ${JSON.stringify(password)}`);
    }
  }
  assert.equal(saved, 0);
});
