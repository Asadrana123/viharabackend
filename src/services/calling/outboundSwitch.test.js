const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const { outboundDisabled, OUTBOUND_DISABLED_ERROR } = require("../../config/outboundSwitch");
const { dispatchCall } = require("./vapiService");

const withEnv = async (value, fn) => {
  const before = process.env.OUTBOUND_DISABLED;
  if (value == null) delete process.env.OUTBOUND_DISABLED; else process.env.OUTBOUND_DISABLED = value;
  try { return await fn(); } finally {
    if (before == null) delete process.env.OUTBOUND_DISABLED; else process.env.OUTBOUND_DISABLED = before;
  }
};

test("the switch is on only for the exact value true", async () => {
  await withEnv(null, () => assert.equal(outboundDisabled(), false));
  await withEnv("false", () => assert.equal(outboundDisabled(), false));
  await withEnv("1", () => assert.equal(outboundDisabled(), false));
  await withEnv("true", () => assert.equal(outboundDisabled(), true));
});

test("with OUTBOUND_DISABLED=true, dispatchCall refuses before touching the database or Vapi", async () => {
  const post = axios.post;
  let posted = false;
  axios.post = async () => { posted = true; throw new Error("must not be called"); };
  try {
    const r = await withEnv("true", () => dispatchCall("+14105552291", { fullName: "Test Person", timezone: "America/New_York" }));
    assert.deepEqual(r, { success: false, phone: "+14105552291", error: OUTBOUND_DISABLED_ERROR });
    assert.equal(posted, false);
  } finally {
    axios.post = post;
  }
});
