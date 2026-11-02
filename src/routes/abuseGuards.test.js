// SA-034 (renovation image must be the property's own photo), SA-011 (CoreLogic
// rate limit + cache) and SA-013 (webhooks refuse requests when their secret
// isn't set). No database: the models' lookups are stubbed.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

// The renovation controller keeps logging after it has answered; output written while the test runner
// reads results occasionally fails the whole file ("Unable to deserialize cloned data"), so keep it quiet.
console.log = console.info = () => {};

delete process.env.RECAPTCHA_API_KEY; // captcha off: these tests are about what comes after it
delete process.env.VAPI_WEBHOOK_SECRET;
delete process.env.BREVO_WEBHOOK_SECRET;

const Product = require("../model/property/productModel");
const RenovationRequest = require("../model/property/renovationRequestModel");
const BflService = require("../services/shared/bflService");
const coreLogicService = require("../services/property/coreLogicService");

const PROPERTY = {
  _id: "64b7f0f0f0f0f0f0f0f0f0f0", street: "101 Test Oak St", city: "Austin", state: "TX", zipCode: "78701",
  productName: "101 Test Oak St", startBid: 250000,
  image: "https://res.cloudinary.com/demo/image/upload/front.jpg",
  otherImages: ["https://res.cloudinary.com/demo/image/upload/kitchen.jpg"],
};
Product.findById = async (id) => (id === PROPERTY._id ? PROPERTY : null);
const saved = [];
RenovationRequest.prototype.save = async function () { saved.push(this.selectedImage); return this; };
RenovationRequest.findByIdAndUpdate = async () => null;
const downloaded = [];
BflService.generateRenovationImage = async (url) => { downloaded.push(url); return { imageUrl: "x", model: "test" }; };
let coreLogicCalls = 0;
coreLogicService.getCoreLogicInvestmentData = async () => { coreLogicCalls++; return { status: "success", clipId: "c1", valuation: {}, rental: null, taxData: {} }; };

const app = express();
app.use(express.json());
app.use("/api/property-renovation", require("./property/renovationRoutes"));
app.use("/api/v1/corelogic", require("./property/coreLogicRoutes"));
app.use("/api/v1/voice-callback", require("./calling/voiceCallbackRoutes"));
app.use("/api/webhooks/brevo", require("./integrations/brevoWebhookRoutes"));
app.use(require("../middleware/error")); // the real error middleware, as in app.js

let server, base;
test.before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const post = (path, body, ip = "198.51.100.1") =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: JSON.stringify(body) });

test("renovation: any URL that isn't one of the property's photos is refused before download", async () => {
  const renovationData = { area: "Exterior", style: "modern" };
  for (const selectedImage of ["http://169.254.169.254/latest/meta-data/", "https://evil.example/huge.jpg", { $ne: null }]) {
    const res = await post("/api/property-renovation/generate-renovation-images", { propertyId: PROPERTY._id, selectedImage, renovationData }, "198.51.100.2");
    assert.equal(res.status, 400, JSON.stringify(selectedImage));
  }
  assert.deepEqual(saved, []);
  assert.deepEqual(downloaded, []);
});

test("renovation: the property's own photos still work", async () => {
  const renovationData = { area: "Exterior", style: "modern" };
  for (const selectedImage of [PROPERTY.image, PROPERTY.otherImages[0]]) {
    const res = await post("/api/property-renovation/generate-renovation-images", { propertyId: PROPERTY._id, selectedImage, renovationData }, "198.51.100.3");
    assert.equal(res.status, 200);
  }
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(saved, [PROPERTY.image, PROPERTY.otherImages[0]]);
  assert.deepEqual(downloaded, [PROPERTY.image, PROPERTY.otherImages[0]]);
});

test("CoreLogic: one paid lookup per property per day, and a per-visitor limit", async () => {
  const statuses = [];
  for (let i = 0; i < 22; i++) {
    const res = await fetch(`${base}/api/v1/corelogic/${PROPERTY._id}`, { headers: { "cf-connecting-ip": "198.51.100.4" } });
    statuses.push(res.status);
    if (i === 0) assert.equal((await res.json()).data.coreLogicData.clipId, "c1");
  }
  assert.equal(coreLogicCalls, 1, "repeat requests are served from the cache");
  assert.deepEqual(statuses.slice(0, 20), Array(20).fill(200));
  assert.deepEqual(statuses.slice(20), [429, 429]);
});

test("Vapi and Brevo webhooks refuse everything when their secret isn't set", async () => {
  const vapi = await post("/api/v1/voice-callback/webhook?secret=anything", { message: { type: "end-of-call-report" } });
  assert.equal(vapi.status, 401);
  const brevo = await post("/api/webhooks/brevo/email?token=anything", { event: "unsubscribed", email: "a@example.test" });
  assert.equal(brevo.status, 401);
});
