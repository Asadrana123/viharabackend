// The iMessage (BlueBubbles) channel's send: which chat name it uses per macOS version, and how it
// handles a send that errored although the text went out (seen live on the macOS 27 Mac Mini).
// Pure: a fake BlueBubbles client replaces the HTTP one, so nothing here touches the network, Mongo or Redis.
const test = require("node:test");
const assert = require("node:assert/strict");

process.env.VTEXT_SECRETS_KEY = "00".repeat(32); // throwaway key, test process only

const adapter = require("./channels/imessageBluebubbles/adapter");
const { encryptCredentials } = require("../../utils/secretBox");

const { chatGuidFor, macosMajor, setClientFactoryForTests, setSleepForTests } = adapter._test;

let serverCount = 0;
function makeLine(overrides = {}) {
  serverCount += 1; // a fresh server URL per test, so the cached macOS version never leaks between tests
  return {
    _id: "line-1",
    channelType: "imessage-bluebubbles",
    config: { serverUrl: `https://mac-${serverCount}.example.test` },
    credentials: encryptCredentials({ password: "pw" }),
    ...overrides,
  };
}

function httpError(status, message) {
  const err = new Error(`Request failed with status code ${status}`);
  err.response = { status, data: { status, message } };
  return err;
}

function timeoutError() {
  const err = new Error("timeout of 30000ms exceeded");
  err.code = "ECONNABORTED";
  return err;
}

/** A fake client. `sendText` decides what the send does; `chats` holds what each chat contains afterwards. */
function fakeClient({ osVersion = "27.0.1", serverInfoError, sendText, chats = {} } = {}) {
  const calls = { serverInfo: 0, sendText: [], getChatMessages: [] };
  const client = {
    async getServerInfo() {
      calls.serverInfo += 1;
      if (serverInfoError) throw serverInfoError;
      return { status: 200, data: { os_version: osVersion, server_version: "1.9.12" } };
    },
    async sendText(args) {
      calls.sendText.push(args);
      if (sendText) return sendText(args);
      return { status: 200, data: { guid: "GUID-OK" } };
    },
    async getChatMessages(args) {
      calls.getChatMessages.push(args);
      return chats[args.chatGuid] || [];
    },
  };
  setClientFactoryForTests(() => client);
  return calls;
}

test.beforeEach(() => setSleepForTests(async () => {}));
test.after(() => {
  setClientFactoryForTests(null);
  setSleepForTests(null);
});

test("macosMajor reads BlueBubbles' os_version", () => {
  assert.equal(macosMajor({ data: { os_version: "27.0.1" } }), 27);
  assert.equal(macosMajor({ data: { os_version: "15.6" } }), 15);
  assert.equal(macosMajor({ data: {} }), null);
  assert.equal(macosMajor(undefined), null);
});

test("chatGuidFor builds <service>;-;<address>", () => {
  assert.equal(chatGuidFor("+12025550100"), "iMessage;-;+12025550100");
  assert.equal(chatGuidFor("+12025550100", "any"), "any;-;+12025550100");
});

test("macOS 26 and newer: sends to any;-;", async () => {
  const calls = fakeClient({ osVersion: "27.0.1" });
  const result = await adapter.send({ line: makeLine(), to: "+12025550100", body: "Hi", clientMessageId: "m1" });
  assert.equal(calls.sendText[0].chatGuid, "any;-;+12025550100");
  assert.deepEqual(result, { providerMessageId: "GUID-OK", providerStatus: "sent" });
});

test("macOS 15 and older: keeps iMessage;-;", async () => {
  const calls = fakeClient({ osVersion: "15.6" });
  await adapter.send({ line: makeLine(), to: "+12025550100", body: "Hi", clientMessageId: "m1" });
  assert.equal(calls.sendText[0].chatGuid, "iMessage;-;+12025550100");
});

test("the macOS version is asked once per Mac, not on every send", async () => {
  const calls = fakeClient({ osVersion: "27.0" });
  const line = makeLine();
  await adapter.send({ line, to: "+12025550100", body: "Hi", clientMessageId: "m1" });
  await adapter.send({ line, to: "+12025550101", body: "Hi", clientMessageId: "m2" });
  assert.equal(calls.serverInfo, 1);
});

test("when the Mac can't say its version, it falls back to iMessage;-; and still sends", async () => {
  const calls = fakeClient({ serverInfoError: new Error("boom") });
  await adapter.send({ line: makeLine(), to: "+12025550100", body: "Hi", clientMessageId: "m1" });
  assert.equal(calls.sendText[0].chatGuid, "iMessage;-;+12025550100");
});

test("a fixed config.guid on the line still wins", async () => {
  const calls = fakeClient({ osVersion: "27.0" });
  await adapter.send({ line: makeLine({ config: { serverUrl: "https://fixed.example.test", guid: "iMessage;-;fixed" } }), to: "+12025550100", body: "Hi" });
  assert.equal(calls.sendText[0].chatGuid, "iMessage;-;fixed");
});

test("400 after the text went out (the Doris case): recorded as sent and delivered, not failed", async () => {
  const sentAt = Date.now();
  const calls = fakeClient({
    osVersion: "15.6", // so the send goes to iMessage;-; while Messages made any;-;, like on 2026-11-05
    sendText: () => {
      throw httpError(400, "You've made a bad request! Please check your request params & body");
    },
    chats: {
      "any;-;+12025550100": [
        { guid: "OTHER", isFromMe: true, error: 0, text: "an older text", dateCreated: sentAt - 10 * 60 * 1000 },
        { guid: "REAL-GUID", isFromMe: true, error: 0, text: "Hey Doris,  it's Maya", dateCreated: sentAt + 1000, dateDelivered: sentAt + 4000 },
      ],
    },
  });
  const result = await adapter.send({ line: makeLine(), to: "+12025550100", body: "Hey Doris, it's Maya", clientMessageId: "m1" });
  assert.equal(result.providerMessageId, "REAL-GUID");
  assert.equal(result.recoveredFrom, "INVALID_RECIPIENT");
  assert.equal(result.deliveredAt.getTime(), sentAt + 4000);
  assert.ok(calls.getChatMessages.some((c) => c.chatGuid === "any;-;+12025550100"));
});

test("a timeout whose text went out is not retried (no second text)", async () => {
  fakeClient({
    sendText: () => {
      throw timeoutError();
    },
    chats: { "any;-;+12025550100": [{ guid: "G1", isFromMe: true, error: 0, text: "Hi", dateCreated: Date.now() }] },
  });
  const result = await adapter.send({ line: makeLine(), to: "+12025550100", body: "Hi", clientMessageId: "m1" });
  assert.equal(result.providerMessageId, "G1");
  assert.equal(result.deliveredAt, null);
  assert.equal(result.recoveredFrom, "TIMEOUT");
});

test("400 with nothing in the chat: still fails as before", async () => {
  fakeClient({
    sendText: () => {
      throw httpError(400, "bad request");
    },
  });
  await assert.rejects(adapter.send({ line: makeLine(), to: "+12025550100", body: "Hi" }), (err) => err.kind === "recipient" && err.code === "INVALID_RECIPIENT");
});

test("a copy that errored, or isn't ours, doesn't count as sent", async () => {
  const now = Date.now();
  fakeClient({
    sendText: () => {
      throw httpError(400, "bad request");
    },
    chats: {
      "any;-;+12025550100": [
        { guid: "ERRORED", isFromMe: true, error: 22, text: "Hi", dateCreated: now },
        { guid: "THEIRS", isFromMe: false, error: 0, text: "Hi", dateCreated: now },
        { guid: "OTHER-TEXT", isFromMe: true, error: 0, text: "Something else", dateCreated: now },
      ],
    },
  });
  await assert.rejects(adapter.send({ line: makeLine(), to: "+12025550100", body: "Hi" }), (err) => err.code === "INVALID_RECIPIENT");
});

test("not on iMessage (500 Message Send Error) fails straight away, without looking in the chat", async () => {
  const calls = fakeClient({
    sendText: () => {
      throw httpError(500, "Message Send Error");
    },
  });
  await assert.rejects(adapter.send({ line: makeLine(), to: "+12025550100", body: "Hi" }), (err) => err.code === "MESSAGE_SEND_ERROR");
  assert.equal(calls.getChatMessages.length, 0);
});

test("wrong password fails straight away, without looking in the chat", async () => {
  const calls = fakeClient({
    sendText: () => {
      throw httpError(401, "You are not authorized");
    },
  });
  await assert.rejects(adapter.send({ line: makeLine(), to: "+12025550100", body: "Hi" }), (err) => err.code === "AUTH_FAILED");
  assert.equal(calls.getChatMessages.length, 0);
});

test("healthCheck remembers the macOS version, so the first send skips asking", async () => {
  const calls = fakeClient({ osVersion: "27.0" });
  const line = makeLine();
  await adapter.healthCheck({ line });
  await adapter.send({ line, to: "+12025550100", body: "Hi" });
  assert.equal(calls.serverInfo, 1);
  assert.equal(calls.sendText[0].chatGuid, "any;-;+12025550100");
});
