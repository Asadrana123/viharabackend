const { test } = require("node:test");
const assert = require("node:assert/strict");
const { lineCapacity, totalsOf, historyOf, lastDays, resetsAt } = require("./vtextCapacityReport");

const DAY = 24 * 60 * 60 * 1000;
// 3 Nov 2026, 3 PM New York.
const NOW = new Date("2026-11-03T20:00:00Z");
const line = (over = {}) => ({
  _id: "L1", name: "Mac 1", channelType: "imessage-bluebubbles", status: "active",
  createdAt: new Date("2026-09-01T00:00:00Z"), warmup: { enabled: true, startedAt: new Date(NOW.getTime() - 60 * DAY) },
  routing: { acceptsNewContacts: true }, health: {}, ...over,
});

test("a fully warmed iMessage line: 100 a day, 85 for new texts, 15 kept for replies", () => {
  const c = lineCapacity(line(), { assigned: 28, sent: 25, failed: 3, inbound: 4 }, { now: NOW, newRecipientsThisHour: 4 });
  assert.equal(c.canSend, true);
  assert.equal(c.reason, "Full limit");
  assert.deepEqual([c.limit, c.coldLimit, c.used, c.leftNew, c.leftReplies], [100, 85, 28, 57, 15]);
  assert.deepEqual([c.sent, c.failed, c.replies, c.newRecipientsThisHour, c.newRecipientsPerHour], [25, 3, 4, 4, 15]);
  assert.equal(c.warmup, null);
});

test("warm-up: day 12 gets the day-8 step (25), and says so", () => {
  const c = lineCapacity(line({ status: "warming", warmup: { enabled: true, startedAt: new Date(NOW.getTime() - 11.5 * DAY) } }), null, { now: NOW });
  assert.equal(c.limit, 25);
  assert.equal(c.coldLimit, 21);
  assert.deepEqual(c.warmup, { day: 12, of: 29 });
  assert.equal(c.reason, "Warm-up day 12 of 29 (full limit 100)");
  assert.deepEqual([c.leftNew, c.leftReplies], [21, 4]);
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

test("past the cold limit only the reply reserve is left; nothing below zero", () => {
  assert.deepEqual((({ leftNew, leftReplies }) => [leftNew, leftReplies])(lineCapacity(line(), { assigned: 90 }, { now: NOW })), [0, 10]);
  assert.deepEqual((({ leftNew, leftReplies }) => [leftNew, leftReplies])(lineCapacity(line(), { assigned: 120 }, { now: NOW })), [0, 0]);
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
    lineCapacity(line(), { assigned: 28, sent: 28 }, { now: NOW }),
    lineCapacity(line({ _id: "L2", status: "warming", warmup: { enabled: true, startedAt: new Date(NOW.getTime() - 2 * DAY) } }), { assigned: 2, sent: 2 }, { now: NOW }),
    lineCapacity(line({ _id: "L3", status: "paused" }), { assigned: 7, sent: 7 }, { now: NOW }),
  ];
  const t = totalsOf(lines);
  assert.deepEqual([t.linesSending, t.linesNotSending, t.limit, t.coldLimit, t.used, t.sent], [2, 1, 110, 93, 30, 30]);
  assert.deepEqual([t.leftNew, t.leftReplies], [57 + 6, 15 + 2]);
});

test("the day resets at midnight New York", () => {
  assert.equal(resetsAt(NOW).toISOString(), "2026-11-04T05:00:00.000Z");
  const days = lastDays(30, NOW);
  assert.equal(days.length, 30);
  assert.deepEqual([days[0], days[29]], ["2026-10-05", "2026-11-03"]);
});

test("history: saved caps win, other days are estimated from warm-up, days before the line existed are 0", () => {
  const l = line({ createdAt: new Date("2026-11-01T12:00:00Z"), warmup: { enabled: true, startedAt: new Date("2026-11-01T12:00:00Z") } });
  const rows = [{ lineId: "L1", day: "2026-11-02", assigned: 6, sent: 5, failed: 1, inbound: 2, cap: 8 }];
  const h = historyOf([l], rows, 4, NOW);
  assert.deepEqual(h.map((d) => d.day), ["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"]);
  assert.deepEqual(h.map((d) => d.limit), [0, 10, 8, 10]);
  assert.deepEqual(h.map((d) => d.estimated), [false, true, false, true]);
  assert.deepEqual([h[2].used, h[2].sent, h[2].failed, h[2].replies], [6, 5, 1, 2]);
});
