const test = require("node:test");
const assert = require("node:assert/strict");
const userModel = require("../../model/users/userModel");
const productModel = require("../../model/property/productModel");
const { updateUserDetails, Login, saveProperty, removeProperty, allsavedProperties } = require("./userController");

const ME = "64b000000000000000000001";
const OTHER = "64b000000000000000000002";

const realFindByIdAndUpdate = userModel.findByIdAndUpdate;
test.afterEach(() => { userModel.findByIdAndUpdate = realFindByIdAndUpdate; });

// Records the findByIdAndUpdate call instead of touching the database.
function mockUpdate() {
  const call = {};
  userModel.findByIdAndUpdate = (id, update, opts) => {
    Object.assign(call, { id, update, opts });
    return { select: async (projection) => { call.projection = projection; return { _id: id, ...update.$set }; } };
  };
  return call;
}

async function run(req) {
  const out = { status: 200, json: null };
  const res = {
    status(code) { out.status = code; return this; },
    json(body) { out.json = body; return this; },
  };
  await updateUserDetails(req, res);
  return out;
}

test("updateUserDetails: refuses to update another user's account", async () => {
  const call = mockUpdate();
  const out = await run({ params: { userId: OTHER }, user: { _id: ME }, body: { name: "Hacked" } });
  assert.equal(out.status, 403);
  assert.equal(call.id, undefined, "no database write");
});

test("updateUserDetails: ignores role, password and other protected fields", async () => {
  const call = mockUpdate();
  const out = await run({
    params: { userId: ME },
    user: { _id: ME },
    body: {
      name: "Asha", role: "admin", password: "plaintext", isQaAccount: true,
      resetPasswordToken: "x", savedProperties: [OTHER], governmentId: { uploadedAt: new Date() },
      "consents.dataProcessing.granted": true,
    },
  });
  assert.equal(out.status, 200);
  assert.equal(call.id, ME);
  assert.deepEqual(call.update, { $set: { name: "Asha" } });
  assert.match(call.projection, /-resetPasswordToken/);
});

test("updateUserDetails: saves the profile fields the portal sends, plus consent", async () => {
  const call = mockUpdate();
  const out = await run({
    params: { userId: ME },
    user: { _id: ME },
    body: {
      name: "Asha", last_name: "Rao", email: "asha@example.com", communication_email: "x@example.com",
      businessPhone: "5551234567", city: "Austin", state: "TX", notificationConsent: true,
    },
  });
  assert.equal(out.status, 200);
  const { $set } = call.update;
  assert.equal($set.name, "Asha");
  assert.equal($set.last_name, "Rao");
  assert.equal($set.email, "asha@example.com");
  assert.equal($set.businessPhone, "5551234567");
  assert.equal($set.city, "Austin");
  assert.equal($set.state, "TX");
  assert.equal($set["consents.dataProcessing.granted"], true);
  assert.equal("communication_email" in $set, false);
  assert.deepEqual(call.opts, { new: true, runValidators: true });
});

test("updateUserDetails: rejects non-text values (no Mongo operators)", async () => {
  const call = mockUpdate();
  const out = await run({ params: { userId: ME }, user: { _id: ME }, body: { email: { $ne: null } } });
  assert.equal(out.status, 400);
  assert.equal(call.id, undefined);
});

test("updateUserDetails: invalid id is a 400", async () => {
  const out = await run({ params: { userId: "nope" }, user: { _id: ME }, body: {} });
  assert.equal(out.status, 400);
});

test("user routes no longer expose the OTP senders, and the controller has no sendOTP", () => {
  const router = require("../../routes/users/userRoutes");
  const paths = router.stack.filter((l) => l.route).map((l) => l.route.path);
  assert.equal(paths.includes("/send-otp"), false);
  assert.equal(paths.includes("/send-sms-otp"), false);
  assert.equal(paths.includes("/login"), true, "sanity: other routes still there");
  assert.equal(require("./userController").sendOTP, undefined);
});

test("Login never writes the password to the logs (right or wrong password)", async () => {
  const realFindOne = userModel.findOne;
  const realExists = productModel.exists;
  const logged = [];
  const saved = {};
  for (const k of ["log", "info", "warn", "error", "debug"]) {
    saved[k] = console[k];
    console[k] = (...a) => logged.push(a.map(String).join(" "));
  }
  try {
    const PASSWORD = "Sup3r-Secret-Pass";
    const user = {
      _id: ME, name: "Mina", email: "mina@example.test", role: "user",
      comparePassword: async (p) => p === PASSWORD,
      getJWTToken: () => "jwt",
    };
    userModel.findOne = () => ({ select: () => ({ populate: async () => user }) });
    productModel.exists = async () => null;
    const res = { status() { return this; }, cookie() { return this; }, json() { return this; } };
    for (const password of [PASSWORD, "Wrong-" + PASSWORD]) {
      await new Promise((done) => {
        Login({ body: { email: user.email, password } }, { ...res, json() { done(); return this; } }, () => done());
      });
    }
    assert.equal(logged.some((line) => line.includes(PASSWORD)), false, logged.join("\n"));
  } finally {
    Object.assign(console, saved);
    userModel.findOne = realFindOne;
    productModel.exists = realExists;
  }
});

// Runs a catchAsyncError-wrapped handler and resolves with what it sent (or the error passed to next).
function runHandler(handler, req) {
  return new Promise((resolve) => {
    const out = { status: 200, json: null, error: null };
    const res = {
      status(code) { out.status = code; return this; },
      json(body) { out.json = body; resolve(out); return this; },
    };
    handler(req, res, (err) => { out.error = err; resolve(out); });
  });
}

function mockSavedPropertyModels() {
  const real = { update: userModel.findByIdAndUpdate, findById: userModel.findById, product: productModel.findById };
  const calls = [];
  const chain = (value) => ({ select() { return this; }, populate: async () => value });
  productModel.findById = (id) => ({ select: async () => ({ _id: id }) });
  userModel.findByIdAndUpdate = (id, update) => { calls.push({ id: String(id), update }); return chain({ _id: id }); };
  userModel.findById = (id) => { calls.push({ id: String(id), read: true }); return chain({ savedProperties: [] }); };
  const restore = () => { userModel.findByIdAndUpdate = real.update; userModel.findById = real.findById; productModel.findById = real.product; };
  return { calls, restore };
}

const PRODUCT = "64b0000000000000000000aa";

test("saveProperty / removeProperty act on the logged-in user, never the user_id sent", async () => {
  const { calls, restore } = mockSavedPropertyModels();
  try {
    let out = await runHandler(saveProperty, { user: { _id: ME }, body: { user_id: OTHER, product_id: PRODUCT } });
    assert.equal(out.status, 200);
    assert.deepEqual(calls.at(-1), { id: ME, update: { $addToSet: { savedProperties: PRODUCT } } });
    out = await runHandler(removeProperty, { user: { _id: ME }, body: { user_id: OTHER, product_id: PRODUCT } });
    assert.equal(out.status, 200);
    assert.deepEqual(calls.at(-1), { id: ME, update: { $pull: { savedProperties: PRODUCT } } });
    assert.equal(calls.some((c) => c.id === OTHER), false);
  } finally { restore(); }
});

test("allsavedProperties reads the logged-in user, ignoring ?user_id", async () => {
  const { calls, restore } = mockSavedPropertyModels();
  try {
    const out = await runHandler(allsavedProperties, { user: { _id: ME }, query: { user_id: OTHER } });
    assert.equal(out.status, 200);
    assert.deepEqual(calls, [{ id: ME, read: true }]);
  } finally { restore(); }
});

test("saveProperty rejects a non-id product_id", async () => {
  const { calls, restore } = mockSavedPropertyModels();
  try {
    const out = await runHandler(saveProperty, { user: { _id: ME }, body: { product_id: { $ne: null } } });
    assert.equal(out.error.statuscode, 400);
    assert.equal(calls.length, 0);
  } finally { restore(); }
});
