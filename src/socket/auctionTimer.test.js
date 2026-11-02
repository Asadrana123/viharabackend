// SA-014: the auction countdown broadcast uses the server's end time, never the
// number a browser sends, and only sockets in the auction room can trigger it.
const test = require("node:test");
const assert = require("node:assert/strict");
// The socket rate limiter starts a cleanup interval when it loads; let it not
// keep this test process alive.
const realSetInterval = global.setInterval;
global.setInterval = (...args) => realSetInterval(...args).unref();
const { initializeHandlers, registerSocketHandlers } = require("./socketHandlers");
global.setInterval = realSetInterval;

const AUCTION = "64b7f0f0f0f0f0f0f0f0f0f1";

function setup({ endInMs, status = "active" }) {
  const activeAuctions = new Map([[AUCTION, { auctionStatus: status, endTime: new Date(Date.now() + endInMs) }]]);
  const roomEvents = [];
  const io = { to: () => ({ emit: (...a) => roomEvents.push(a) }) };
  initializeHandlers(io, activeAuctions, new Map(), new Map(), new Map(), new Map());
  return { activeAuctions, roomEvents };
}

let userCounter = 0;
function fakeSocket(rooms) {
  const handlers = {};
  const sent = [];
  const socket = {
    id: `s${++userCounter}`,
    userId: `user-${userCounter}`, // fresh user each time so the per-user event limit doesn't interfere
    rooms: new Set(rooms),
    on: (name, fn) => { handlers[name] = fn; },
    emit: () => {},
    to: () => ({ emit: (...a) => sent.push(a) }),
    join: () => {},
  };
  registerSocketHandlers(socket);
  return { handlers, sent };
}

test("a fake timeLeft from the browser is ignored; the server's time left is broadcast", async () => {
  setup({ endInMs: 60 * 60 * 1000 });
  const { handlers, sent } = fakeSocket([AUCTION]);
  await handlers["auction-timer"]({ auctionId: AUCTION, timeLeft: 0 });
  assert.equal(sent.length, 1);
  const [event, timeLeft] = sent[0];
  assert.equal(event, "timer-update");
  assert.ok(timeLeft > 59 * 60 * 1000, `expected about an hour, got ${timeLeft}`);
});

test("a fake 'ended' doesn't change the auction status", async () => {
  const { activeAuctions, roomEvents } = setup({ endInMs: 60 * 60 * 1000 });
  const { handlers } = fakeSocket([AUCTION]);
  await handlers["auction-timer"]({ auctionId: AUCTION, timeLeft: -1 });
  assert.equal(activeAuctions.get(AUCTION).auctionStatus, "active");
  assert.equal(roomEvents.length, 0);
});

test("a socket that hasn't joined the auction can't broadcast to it", async () => {
  setup({ endInMs: 60 * 60 * 1000 });
  const { handlers, sent } = fakeSocket([]);
  await handlers["auction-timer"]({ auctionId: AUCTION, timeLeft: 5 });
  assert.equal(sent.length, 0);
});

test("bad input is ignored", async () => {
  setup({ endInMs: 60 * 60 * 1000 });
  const { handlers, sent } = fakeSocket([AUCTION]);
  for (const data of [null, undefined, {}, { auctionId: { $ne: null } }, "x"]) await handlers["auction-timer"](data);
  assert.equal(sent.length, 0);
});

test("after the real end time the broadcast says 0, never negative", async () => {
  setup({ endInMs: -5000, status: "ended" });
  const { handlers, sent } = fakeSocket([AUCTION]);
  await handlers["auction-timer"]({ auctionId: AUCTION, timeLeft: 999999 });
  assert.deepEqual(sent[0], ["timer-update", 0]);
});
