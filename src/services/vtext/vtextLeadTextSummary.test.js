const { test } = require("node:test");
const assert = require("node:assert/strict");
const { summarizeTexts } = require("./vtextLeadMessagesService");

const out = (status, over = {}) => ({ direction: "out", status, channelType: "imessage-bluebubbles", n: 1, ...over });
const reply = (channelType = "imessage-bluebubbles") => ({ direction: "in", status: "received", channelType, n: 1 });

test("no messages: all zeros, no sms block until an Android line exists", () => {
  assert.deepEqual(summarizeTexts([], false), { sent: 0, failed: 0, replied: false, imessage: { sent: 0, failed: 0, replied: false, notOnImessage: 0 } });
  assert.deepEqual(summarizeTexts(undefined, true).sms, { sent: 0, failed: 0, replied: false });
});

test("iMessage texts: sent, failed, replied, and the totals stay as before", () => {
  const s = summarizeTexts([out("delivered", { n: 2 }), out("queued"), out("failed", { errorKind: "line" }), reply()], false);
  assert.deepEqual(s.imessage, { sent: 3, failed: 1, replied: true, notOnImessage: 0 });
  assert.equal(s.sent, 3);
  assert.equal(s.failed, 1);
  assert.equal(s.replied, true);
});

test("not on iMessage: recipient failures and unconfirmed sends, not line failures or blocks", () => {
  const s = summarizeTexts([
    out("failed", { errorKind: "recipient", errorCode: "22" }),
    out("unknown", { errorKind: "transient", errorCode: "no-receipt" }),
    out("failed", { errorKind: "line" }),
    out("blocked", { channelType: undefined, errorKind: "compliance" }),
  ], false);
  assert.equal(s.imessage.notOnImessage, 2);
  assert.equal(s.imessage.failed, 4);
});

test("a blocked or queued text with no channel yet counts as iMessage", () => {
  const s = summarizeTexts([out("queued", { channelType: undefined }), out("blocked", { channelType: null })], true);
  assert.deepEqual([s.imessage.sent, s.imessage.failed], [1, 1]);
  assert.deepEqual(s.sms, { sent: 0, failed: 0, replied: false });
});

test("Android SMS texts go to sms; without an Android line they only count in the totals", () => {
  const rows = [out("sent", { channelType: "android-sms" }), out("failed", { channelType: "android-sms", errorKind: "recipient" }), reply("android-sms")];
  const on = summarizeTexts(rows, true);
  assert.deepEqual(on.sms, { sent: 1, failed: 1, replied: true });
  assert.deepEqual(on.imessage, { sent: 0, failed: 0, replied: false, notOnImessage: 0 });
  const off = summarizeTexts(rows, false);
  assert.equal(off.sms, undefined);
  assert.deepEqual([off.sent, off.failed, off.replied], [1, 1, true]);
});

test("cancelled and AI drafts awaiting approval count as neither", () => {
  const s = summarizeTexts([out("cancelled"), out("pending-approval")], false);
  assert.deepEqual([s.sent, s.failed], [0, 0]);
});
