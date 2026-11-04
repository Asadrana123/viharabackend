// SA-026: admin panel "Create User" makes a real site account and leaves the admin signed in.
const test = require("node:test");
const assert = require("node:assert/strict");
const userModel = require("../../model/users/userModel");
// adminController loads the auction/socket code, which starts timers; unref them so the test can exit.
const realSetInterval = global.setInterval;
global.setInterval = (...args) => realSetInterval(...args).unref();
const { CreateAdmin } = require("./adminController");
global.setInterval = realSetInterval;

// catchAsyncError doesn't return its promise, so resolve on the response (or on next(err)).
function run(body) {
  return new Promise((resolve) => {
    const out = { status: 200, cookies: [], json: null, err: null };
    const res = {
      status(code) { out.status = code; return this; },
      cookie(name) { out.cookies.push(name); return this; },
      json(b) { out.json = b; resolve(out); return this; },
    };
    CreateAdmin({ body, user: { _id: "64b000000000000000000009", role: "admin" } }, res, (err) => { out.err = err; resolve(out); });
  });
}

let created;
const realCreate = userModel.create;
test.beforeEach(() => {
  created = null;
  userModel.create = async (data) => { created = data; return { _id: "64b00000000000000000000a", ...data }; };
});
test.after(() => { userModel.create = realCreate; });

const FORM = {
  name: "New", last_name: "Person", email: "new@example.test", password: "Long-Pass-1",
  businessPhone: "+15555550100", address: "1 Main St", city: "Austin", state: "TX", zipCode: "78701", country: "US", userType: "Agent",
};

test("creates a user-role account in the users collection, with only account fields, and sets no cookie", async () => {
  const out = await run({ ...FORM, role: "user", isQaAccount: true, email_verified_at: "2020-01-01" });
  assert.equal(out.status, 201);
  assert.deepEqual(out.cookies, [], "the admin's own login cookie is left alone");
  assert.deepEqual(created, {
    role: "user", name: "New", last_name: "Person", email: "new@example.test", password: "Long-Pass-1",
    businessPhone: "+15555550100", city: "Austin", state: "TX", userType: "Agent",
  });
  assert.equal(out.json.success, true);
  assert.equal(out.json.user.email, "new@example.test");
  assert.equal("password" in out.json.user, false);
});

test("the form's Admin choice makes an admin account; missing role means user", async () => {
  await run({ ...FORM, role: "admin" });
  assert.equal(created.role, "admin");
  await run({ ...FORM, role: undefined });
  assert.equal(created.role, "user");
});

test("any other role is refused before anything is saved", async () => {
  for (const role of ["seller", "editor", "superadmin", { $ne: "x" }]) {
    const out = await run({ ...FORM, role });
    assert.equal(out.err.statuscode, 400, JSON.stringify(role));
  }
  assert.equal(created, null);
});
