const { test } = require("node:test");
const assert = require("node:assert/strict");
const { lineCapacity, totalsOf, historyOf, lastDays, resetsAt } = require("./vtextCapacityReport");
const { warmupComplete } = require("./vtextCapacityService");

const DAY = 24 * 60 * 60 * 1000;
// 3 Nov 2026, 3 PM New York.
const NOW = new Date("2026-11-03T20:00:00Z");
const line = (over = {}) => ({
  _id: "L1", name: "Mac 1", channelType: "imessage-bluebubbles", status: "active",
  createdAt: new Date("2026-09-01T00:00:00Z"), warmup: { enabled: true, startedAt: new Date(NOW.getTime() - 60 * DAY) },
  routing: { acceptsNewContacts: true }, health: {}, ...over,
});

test("a fully warmed iMessage line: 100 new leads a day; replies and follow-ups don't count and have no limit", () => {
  const c = lineCapacity(line(), { assigned: 28, newRecipients: 12, sent: 25, failed: 3, inbound: 4 }, { now: NOW, newRecipientsThisHour: 4 });
  assert.equal(c.canSend, true);
  assert.equal(c.counts, "new-leads");
  assert.equal(c.reason, "Full limit");
  assert.deepEqual([c.limit, c.coldLimit, c.used, c.textsSent, c.leftNew, c.leftReplies], [100, 100, 12, 28, 88, 0]);
  assert.deepEqual([c.sent, c.failed, c.replies, c.newRecipientsThisHour, c.newRecipientsPerHour], [25, 3, 4, 4, 15]);
  assert.equal(c.warmup, null);
});

test("warm-up: day 12 gets the day-8 step (25), and says so", () => {
  const c = lineCapacity(line({ status: "warming", warmup: { enabled: true, startedAt: new Date(NOW.getTime() - 11.5 * DAY) } }), null, { now: NOW });
  assert.equal(c.limit, 25);
  assert.equal(c.coldLimit, 25);
  assert.deepEqual(c.warmup, { day: 12, of: 29 });
  assert.equal(c.reason, "Warm-up day 12 of 29 (full limit 100)");
  assert.deepEqual([c.leftNew, c.leftReplies], [25, 0]);
});

test("a line whose own warm-up schedule stops below the full limit says so, not 'Full limit'", () => {
  const c = lineCapacity(line({ warmup: { enabled: true, startedAt: new Date(NOW.getTime() - 30 * DAY), schedule: [{ fromDay: 1, perDay: 50 }] } }), null, { now: NOW });
  assert.equal(c.limit, 50);
  assert.equal(c.reason, "Its warm-up schedule stops at 50 a day (full limit 100)");
  assert.equal(c.warmup, null);
});

test("low reply rate halves the limit and says why", () => {
  const c = lineCapacity(line({ health: { sentLast7d: 300, replyRatio7d: 0.02 } }), null, { now: NOW });
  assert.equal(c.limit, 50);
  assert.equal(c.throttled, true);
  assert.match(c.reason, /halved: reply rate under 5%/);
});

test("iMessage: lots of replies leave the new-lead room alone; 100 new leads fill it; nothing below zero", () => {
  const pick = ({ leftNew, leftReplies }) => [leftNew, leftReplies];
  assert.deepEqual(pick(lineCapacity(line(), { assigned: 250, newRecipients: 10 }, { now: NOW })), [90, 0]);
  assert.deepEqual(pick(lineCapacity(line(), { assigned: 100, newRecipients: 100 }, { now: NOW })), [0, 0]);
  assert.deepEqual(pick(lineCapacity(line(), { newRecipients: 120 }, { now: NOW })), [0, 0]);
});

test("Twilio still counts every text: past the cold limit only the reply reserve is left", () => {
  const sms = line({ channelType: "twilio-sms", limits: { perDay: 100 } });
  const c = lineCapacity(sms, { assigned: 90, newRecipients: 5 }, { now: NOW });
  assert.equal(c.counts, "all");
  assert.deepEqual([c.limit, c.coldLimit, c.used, c.leftNew, c.leftReplies], [100, 90, 90, 0, 10]);
});

test("lines that can't send: zero limit and a plain reason", () => {
  for (const [status, reason] of [["paused", "Paused: sends nothing"], ["offline", "Offline: sends nothing"], ["quarantined", "Quarantined: sends nothing"], ["provisioning", "Not set up yet: sends nothing"]]) {
    const c = lineCapacity(line({ status }), { assigned: 5 }, { now: NOW });
    assert.equal(c.canSend, false);
    assert.equal(c.reason, reason);
    assert.deepEqual([c.limit, c.leftNew, c.leftReplies], [0, 0, 0]);
  }
  assert.match(lineCapacity(line({ routing: { acceptsNewContacts: false } }), null, { now: NOW }).reason, /drain mode/);
});

test("totals count only lines that can send", () => {
  const lines = [
    lineCapacity(line(), { assigned: 28, newRecipients: 20, sent: 28 }, { now: NOW }),
    lineCapacity(line({ _id: "L2", status: "warming", warmup: { enabled: true, startedAt: new Date(NOW.getTime() - 2 * DAY) } }), { assigned: 2, newRecipients: 2, sent: 2 }, { now: NOW }),
    lineCapacity(line({ _id: "L3", status: "paused" }), { assigned: 7, newRecipients: 7, sent: 7 }, { now: NOW }),
    lineCapacity(line({ _id: "L4", channelType: "twilio-sms", limits: { perDay: 300 } }), { assigned: 40, newRecipients: 30, sent: 40 }, { now: NOW }),
  ];
  const t = totalsOf(lines);
  assert.deepEqual([t.linesSending, t.linesNotSending, t.textsSent, t.sent], [3, 1, 70, 70]);
  assert.deepEqual(t.newLeads, { lines: 2, limit: 110, used: 22, left: 80 + 8 });
  assert.deepEqual(t.allTexts, { lines: 1, limit: 300, used: 40, left: 270 - 40 });
});

test("the day resets at midnight New York", () => {
  assert.equal(resetsAt(NOW).toISOString(), "2026-11-04T05:00:00.000Z");
  const days = lastDays(30, NOW);
  assert.equal(days.length, 30);
  assert.deepEqual([days[0], days[29]], ["2026-10-05", "2026-11-03"]);
});

test("history: saved caps win, other days are estimated from warm-up, days before the line existed are 0", () => {
  const l = line({ createdAt: new Date("2026-11-01T12:00:00Z"), warmup: { enabled: true, startedAt: new Date("2026-11-01T12:00:00Z") } });
  const rows = [{ lineId: "L1", day: "2026-11-02", assigned: 6, newRecipients: 4, sent: 5, failed: 1, inbound: 2, cap: 8 }];
  const h = historyOf([l], rows, 4, NOW);
  assert.deepEqual(h.map((d) => d.day), ["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"]);
  assert.deepEqual(h.map((d) => d.limit), [0, 10, 8, 10]);
  assert.deepEqual(h.map((d) => d.estimated), [false, true, false, true]);
  assert.deepEqual([h[2].used, h[2].sent, h[2].failed, h[2].replies], [4, 5, 1, 2]); // used = new leads on iMessage
  assert.equal(h[2].lines[0].textsSent, 6);
});

test("warm-up complete: the default schedule counts when the line has none of its own (the prod line's case)", () => {
  const started = (days) => ({ enabled: true, startedAt: new Date(NOW.getTime() - days * DAY), schedule: [] });
  assert.equal(warmupComplete(line({ status: "warming", warmup: started(31.5) }), NOW), true); // day 32 of 29
  assert.equal(warmupComplete(line({ status: "warming", warmup: started(27.5) }), NOW), false); // day 28
  assert.equal(warmupComplete(line({ status: "warming", warmup: started(28.5) }), NOW), true); // day 29: full limit reached
  assert.equal(warmupComplete(line({ warmup: { ...started(10), schedule: [{ fromDay: 1, perDay: 20 }, { fromDay: 5, perDay: 40 }] } }), NOW), true);
  assert.equal(warmupComplete(line({ warmup: { enabled: true } }), NOW), false); // never started
  assert.equal(warmupComplete(line({ warmup: { enabled: false, startedAt: new Date(NOW.getTime() - 60 * DAY) } }), NOW), false);
});
