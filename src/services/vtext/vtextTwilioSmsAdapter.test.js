// The Twilio SMS channel (channels/twilioSms): config validation, send, error mapping, webhook signature and parsing.
// Pure: a fake Twilio client replaces the SDK, so nothing here touches the network, Mongo or Redis.
const test = require("node:test");
const assert = require("node:assert/strict");
const twilio = require("twilio");

const adapter = require("./channels/twilioSms/adapter");
const { setClientFactoryForTests } = require("./channels/twilioSms/client");
const { mapSendError, errorKindForStatusCode } = require("./channels/twilioSms/mapErrors");
const { ChannelError } = require("./channels/channelError");
const { encryptCredentials } = require("../../utils/secretBox");
const { CHANNEL_TYPES } = require("../../model/vtext/vtextLineModel");
const { assertRegistryMatchesEnum, getAdapter } = require("./channels/registry");
const { resolveChannelCandidates } = require("./vtextRouter");
const { getRedisClient, getSubscriberClient } = require("./queue/connection");

const SERVICE_SID = `MG${"a".repeat(32)}`;
const ACCOUNT_SID = `AC${"b".repeat(32)}`;
const AUTH_TOKEN = "test-auth-token";
const BASE_URL = "https://api.example.test";

process.env.VTEXT_SECRETS_KEY = "00".repeat(32); // throwaway key, test process only

const goodConfig = { messagingServiceSid: SERVICE_SID };
const goodCreds = { accountSid: ACCOUNT_SID, authToken: AUTH_TOKEN };

function makeLine(overrides = {}) {
  return {
    _id: "line-1",
    channelType: "twilio-sms",
    webhookKey: "key123",
    config: goodConfig,
    credentials: encryptCredentials(goodCreds),
    ...overrides,
  };
}

test.after(async () => {
  setClientFactoryForTests(null);
  // loading the router pulls in the Redis helpers; close their sockets so the test process can exit
  await getRedisClient().quit().catch(() => {});
  await getSubscriberClient().quit().catch(() => {});
});

test("twilio-sms is in the channel enum and registered", () => {
  assert.ok(CHANNEL_TYPES.includes("twilio-sms"));
  assert.equal(getAdapter("twilio-sms"), adapter);
  assertRegistryMatchesEnum(); // throws if any enum entry has no adapter
});

test("twilio-sms is fallback-only: default routing leaves it out, an explicit policy keeps it", () => {
  assert.equal(adapter.capabilities.fallbackOnly, true);
  assert.ok(!resolveChannelCandidates({ mode: "any", channels: [] }).includes("twilio-sms"));
  assert.ok(!resolveChannelCandidates(undefined).includes("twilio-sms"));
  assert.ok(resolveChannelCandidates({ mode: "any", channels: [] }).includes("imessage-bluebubbles"));
  assert.deepEqual(resolveChannelCandidates({ mode: "only", channels: ["twilio-sms"] }), ["twilio-sms"]);
});

test("validateConfig accepts a complete line and explains each missing piece", () => {
  assert.deepEqual(adapter.validateConfig(goodConfig, goodCreds), { ok: true, errors: [] });
  assert.deepEqual(adapter.validateConfig({ ...goodConfig, manageServiceWebhooks: true }, goodCreds).ok, true);

  const cases = [
    [null, goodCreds, "config is required"],
    [{}, goodCreds, "messagingServiceSid"],
    [{ messagingServiceSid: "MGshort" }, goodCreds, "messagingServiceSid"],
    [{ messagingServiceSid: `AC${"a".repeat(32)}` }, goodCreds, "messagingServiceSid"],
    [{ ...goodConfig, manageServiceWebhooks: "yes" }, goodCreds, "manageServiceWebhooks"],
    [goodConfig, null, "credentials are required"],
    [goodConfig, { authToken: AUTH_TOKEN }, "accountSid"],
    [goodConfig, { accountSid: "ACnope", authToken: AUTH_TOKEN }, "accountSid"],
    [goodConfig, { accountSid: ACCOUNT_SID }, "authToken"],
    [goodConfig, { ...goodCreds, apiKeySid: `SK${"c".repeat(32)}` }, "together"],
    [goodConfig, { ...goodCreds, apiKeySid: "SKbad", apiKeySecret: "x" }, "apiKeySid"],
  ];
  for (const [config, creds, expected] of cases) {
    const result = adapter.validateConfig(config, creds);
    assert.equal(result.ok, false, `expected failure for ${expected}`);
    assert.ok(result.errors.join(" ").includes(expected), `"${expected}" not in ${JSON.stringify(result.errors)}`);
  }
  assert.equal(adapter.validateConfig(goodConfig, { ...goodCreds, apiKeySid: `SK${"c".repeat(32)}`, apiKeySecret: "secret" }).ok, true);
});

test("send goes through the Messaging Service, carries the status-callback URL, and returns the SID and segments", async () => {
  process.env.VTEXT_PUBLIC_BASE_URL = `${BASE_URL}/`;
  const calls = [];
  setClientFactoryForTests((creds) => {
    assert.equal(creds.accountSid, ACCOUNT_SID);
    return { sendText: async (params) => (calls.push(params), { sid: "SM123", status: "queued", numSegments: "2" }) };
  });

  const result = await adapter.send({ line: makeLine(), to: "+15551234567", body: "Hi there", clientMessageId: "msg-9" });

  assert.deepEqual(result, { providerMessageId: "SM123", providerStatus: "queued", segments: 2 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].messagingServiceSid, SERVICE_SID);
  assert.equal(calls[0].to, "+15551234567");
  assert.equal(calls[0].body, "Hi there");
  assert.equal(calls[0].statusCallback, `${BASE_URL}/api/webhooks/vtext/twilio-sms/key123?cb=status&mid=msg-9`);
  assert.equal(calls[0].validityPeriod, 14400);
  assert.equal(calls[0].smartEncoded, true);
});

test("send refuses to run without a public URL (delivery receipts would be lost) or a messaging service", async () => {
  setClientFactoryForTests(() => ({ sendText: async () => assert.fail("must not send") }));

  delete process.env.VTEXT_PUBLIC_BASE_URL;
  await assert.rejects(adapter.send({ line: makeLine(), to: "+15551234567", body: "x", clientMessageId: "m" }), (e) => e instanceof ChannelError && e.kind === "config" && e.code === "NO_PUBLIC_URL");

  process.env.VTEXT_PUBLIC_BASE_URL = BASE_URL;
  await assert.rejects(adapter.send({ line: makeLine({ config: {} }), to: "+15551234567", body: "x", clientMessageId: "m" }), (e) => e.kind === "config" && e.code === "NO_MESSAGING_SERVICE");
});

test("send maps a Twilio failure to a ChannelError", async () => {
  process.env.VTEXT_PUBLIC_BASE_URL = BASE_URL;
  setClientFactoryForTests(() => ({
    sendText: async () => {
      throw Object.assign(new Error("The 'To' number is not a valid phone number"), { status: 400, code: 21211 });
    },
  }));
  await assert.rejects(adapter.send({ line: makeLine(), to: "+1555", body: "x", clientMessageId: "m" }), (e) => e.kind === "recipient" && e.code === "TWILIO_21211");
});

test("mapSendError: each class of failure lands on the right kind and code", () => {
  const rest = (status, code, message = "boom") => Object.assign(new Error(message), { status, code });
  const table = [
    [rest(401, 20003), "config", "TWILIO_20003"],
    [rest(401, undefined), "config", "AUTH_FAILED"],
    [rest(400, 21606), "config", "TWILIO_21606"],
    [rest(400, 30034), "config", "TWILIO_30034"],
    [rest(400, 21211), "recipient", "TWILIO_21211"],
    [rest(400, 21614), "recipient", "TWILIO_21614"],
    [rest(400, 21610), "recipient", "OPTED_OUT"],
    [rest(429, 20429), "transient", "RATE_LIMITED"],
    [rest(500, undefined), "recipient", "UNCERTAIN"], // may have been queued; never retried
    [rest(503, undefined), "recipient", "UNCERTAIN"],
    [Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }), "transient", "NETWORK_ERROR"], // provably never sent
    [Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }), "recipient", "UNCERTAIN"],
    [new Error("timeout"), "recipient", "UNCERTAIN"],
    [rest(400, 99999), "line", "TWILIO_99999"],
  ];
  for (const [err, kind, code] of table) {
    const mapped = mapSendError(err);
    assert.ok(mapped instanceof ChannelError);
    assert.equal(mapped.kind, kind, `${err.status}/${err.code}: kind`);
    assert.equal(mapped.code, code, `${err.status}/${err.code}: code`);
  }
  assert.equal(mapSendError(rest(429, 20429)).retryAfterMs, 30000);
  const already = new ChannelError("line", "X", "x");
  assert.equal(mapSendError(already), already);
});

test("errorKindForStatusCode: handset problems are the recipient's, carrier filtering counts against the line", () => {
  for (const code of ["30003", "30005", "30006", "21610", 30003]) assert.equal(errorKindForStatusCode(code), "recipient");
  for (const code of ["30007", "30008", "99999", undefined]) assert.equal(errorKindForStatusCode(code), "line");
});

test("verifyWebhook accepts a correctly signed request and rejects tampering, wrong URLs and missing parts", () => {
  const line = makeLine();
  const url = `${BASE_URL}/api/webhooks/vtext/twilio-sms/key123?cb=status&mid=m1`;
  const body = { MessageSid: "SM1", MessageStatus: "delivered" };
  const signature = twilio.getExpectedTwilioSignature(AUTH_TOKEN, url, body);
  const call = (overrides) => adapter.verifyWebhook({ headers: { "x-twilio-signature": signature }, body, url, line, ...overrides });

  assert.equal(call({}), true);
  assert.equal(call({ body: { ...body, MessageStatus: "failed" } }), false); // tampered body
  assert.equal(call({ url: `${url}&x=1` }), false); // wrong URL
  assert.equal(call({ headers: { "x-twilio-signature": "AAAA" } }), false);
  assert.equal(call({ headers: {} }), false);
  assert.equal(call({ url: null }), false); // no public URL configured: fail closed
  assert.equal(call({ line: makeLine({ credentials: encryptCredentials({ ...goodCreds, authToken: "other-token" }) }) }), false);
});

test("parseWebhook: delivery receipts", () => {
  const query = { cb: "status", mid: "64f000000000000000000001" };
  const parse = (fields) => adapter.parseWebhook({ body: { MessageSid: "SM1", ...fields }, query });

  assert.deepEqual(parse({ MessageStatus: "queued" }), []);
  assert.deepEqual(parse({ MessageStatus: "sending" }), []);

  const [sent] = parse({ MessageStatus: "sent" });
  assert.equal(sent.type, "message.status");
  assert.equal(sent.status, "sent");
  assert.equal(sent.providerMessageId, "SM1");
  assert.equal(sent.providerEventId, "SM1:sent");
  assert.equal(sent.tempGuid, query.mid);

  assert.equal(parse({ MessageStatus: "delivered" })[0].status, "delivered");

  const [failed] = parse({ MessageStatus: "undelivered", ErrorCode: "30003" });
  assert.equal(failed.status, "failed");
  assert.equal(failed.errorCode, "30003");
  assert.equal(failed.errorKind, "recipient");

  const [filtered] = parse({ MessageStatus: "failed", ErrorCode: "30007" });
  assert.equal(filtered.errorKind, "line");

  assert.deepEqual(adapter.parseWebhook({ body: {}, query }), []);
  assert.deepEqual(adapter.parseWebhook({ body: null, query }), []);
});

test("parseWebhook: a reply from a person, and Twilio's keyword handling", () => {
  const [reply] = adapter.parseWebhook({ body: { MessageSid: "SM2", From: "+15551234567", To: "+15559876543", Body: "Yes please" }, query: {} });
  assert.equal(reply.type, "message.received");
  assert.equal(reply.from, "+15551234567");
  assert.equal(reply.to, "+15559876543");
  assert.equal(reply.body, "Yes please");
  assert.equal(reply.providerMessageId, "SM2");
  assert.equal(reply.optOutType, undefined);

  const [stop] = adapter.parseWebhook({ body: { MessageSid: "SM3", From: "+15551234567", To: "+15559876543", Body: "STOP", OptOutType: "stop" }, query: {} });
  assert.equal(stop.optOutType, "STOP");
  assert.equal(adapter.capabilities.providerHandlesKeywords, true);
});

test("webhookResponse is an empty TwiML document", () => {
  assert.deepEqual(adapter.webhookResponse(), { status: 200, contentType: "text/xml", body: "<Response></Response>" });
});

test("healthCheck reads the Messaging Service and reports failures without throwing", async () => {
  setClientFactoryForTests(() => ({ getMessagingService: async (sid) => ({ sid, friendlyName: "Vihara" }) }));
  assert.deepEqual(await adapter.healthCheck({ line: makeLine() }), { ok: true, details: { sid: SERVICE_SID, friendlyName: "Vihara" } });

  setClientFactoryForTests(() => ({
    getMessagingService: async () => {
      throw new Error("Authenticate");
    },
  }));
  const bad = await adapter.healthCheck({ line: makeLine() });
  assert.equal(bad.ok, false);
});

test("registerWebhooks only touches the Messaging Service when the line owns it", async () => {
  const updates = [];
  setClientFactoryForTests(() => ({ updateMessagingService: async (sid, params) => (updates.push([sid, params]), { inboundRequestUrl: params.inboundRequestUrl }) }));
  const publicUrl = `${BASE_URL}/api/webhooks/vtext/twilio-sms/key123`;

  const manual = await adapter.registerWebhooks({ line: makeLine(), publicUrl });
  assert.equal(manual.manual, true);
  assert.ok(manual.instructions.includes(publicUrl));
  assert.equal(updates.length, 0);

  const managed = await adapter.registerWebhooks({ line: makeLine({ config: { ...goodConfig, manageServiceWebhooks: true } }), publicUrl });
  assert.equal(managed.manual, false);
  assert.deepEqual(updates, [[SERVICE_SID, { inboundRequestUrl: publicUrl, inboundMethod: "POST", useInboundWebhookOnNumber: false }]]);
});
