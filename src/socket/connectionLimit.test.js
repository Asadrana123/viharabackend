// SA-038: the per-account live-auction connection limit applies (it used to run before the user was known).
// SA-030: admin search text is matched as plain text, not as a regex.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const jwt = require("jsonwebtoken");

process.env.secret = "connection-limit-test-secret";
console.log = () => {}; // connect/disconnect lines

const userModel = require("../model/users/userModel");
const USERS = {
  "64b7f0f0f0f0f0f0f0f0f0a1": { _id: "64b7f0f0f0f0f0f0f0f0f0a1", name: "Buyer", email: "b@example.test", role: "user" },
  "64b7f0f0f0f0f0f0f0f0f0a2": { _id: "64b7f0f0f0f0f0f0f0f0f0a2", name: "Admin", email: "a@example.test", role: "admin" },
};
userModel.findById = (id) => {
  const p = Promise.resolve(USERS[String(id)] || null);
  p.select = () => Promise.resolve(USERS[String(id)] || null);
  return p;
};

const server = http.createServer();
const realSetInterval = global.setInterval;
global.setInterval = (...args) => realSetInterval(...args).unref();
require("./socketServer")(server);
global.setInterval = realSetInterval;

let base;
test.before(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const cookieFor = (id) => `token=${jwt.sign({ id, role: USERS[id].role }, process.env.secret, { expiresIn: "1h" })}`;

// Socket.IO over plain HTTP polling: open, send the connect packet, read the answer. Returns a function that disconnects.
async function connect(cookie) {
  const headers = { origin: "https://www.vihara.ai", cookie };
  const open = await (await fetch(`${base}/socket.io/?EIO=4&transport=polling`, { headers })).text();
  const sid = JSON.parse(open.slice(1)).sid;
  const url = `${base}/socket.io/?EIO=4&transport=polling&sid=${sid}`;
  await fetch(url, { method: "POST", headers: { ...headers, "content-type": "text/plain" }, body: "40" });
  const answer = await (await fetch(url, { headers })).text();
  const close = () => fetch(url, { method: "POST", headers: { ...headers, "content-type": "text/plain" }, body: "1" });
  return { answer, close };
}

test("a buyer gets 10 live connections; the 11th is refused, and closing one frees a slot", async () => {
  const cookie = cookieFor("64b7f0f0f0f0f0f0f0f0f0a1");
  const open = [];
  for (let i = 0; i < 10; i++) {
    const c = await connect(cookie);
    assert.match(c.answer, /^40\{"sid"/, `connection ${i + 1}`);
    open.push(c);
  }
  assert.match((await connect(cookie)).answer, /^44.*Too many connections/);

  await open.pop().close();
  await new Promise((r) => setTimeout(r, 100));
  const again = await connect(cookie);
  assert.match(again.answer, /^40\{"sid"/);
  open.push(again);
  await Promise.all(open.map((c) => c.close()));
});

test("admins aren't limited (each admin-panel tab opens several connections)", async () => {
  const cookie = cookieFor("64b7f0f0f0f0f0f0f0f0f0a2");
  const open = [];
  for (let i = 0; i < 15; i++) {
    const c = await connect(cookie);
    assert.match(c.answer, /^40\{"sid"/, `admin connection ${i + 1}`);
    open.push(c);
  }
  await Promise.all(open.map((c) => c.close()));
});

test("enrichment list search: regex characters are matched literally", async () => {
  const EnrichmentListRow = require("../model/enrichment/enrichmentListRowModel");
  let query;
  const chain = { sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => [] };
  EnrichmentListRow.find = (q) => { query = q; return chain; };
  EnrichmentListRow.countDocuments = async () => 0;
  const { getRows } = require("../services/enrichment/enrichmentListService");
  await getRows("64b7f0f0f0f0f0f0f0f0f0b1", { search: " (a+)+$ " });
  const re = query.$or[0]["csv.fullName"];
  assert.equal(re.source, "\\(a\\+\\)\\+\\$");
  assert.equal(re.test("x (a+)+$ y"), true);
  assert.equal(re.test("aaaa"), false);
});

test("Vtext conversation search: regex characters in a name are matched literally", async () => {
  const VtextContact = require("../model/vtext/vtextContactModel");
  const VtextConversation = require("../model/vtext/vtextConversationModel");
  let contactQuery;
  // The controller awaits .select() directly for the name search and .select().lean() for the starred count.
  VtextContact.find = (q) => {
    if (q?.$or) contactQuery = q;
    return { select: () => ({ lean: async () => [], then: (resolve) => resolve([]) }) };
  };
  const chain = { sort() { return this; }, limit() { return this; }, populate() { return this; }, lean: async () => [] };
  VtextConversation.find = () => chain;
  VtextConversation.countDocuments = async () => 0;
  const { listConversations } = require("../controller/vtext/vtextConversationController");
  await new Promise((resolve, reject) => {
    const res = { status() { return this; }, json: resolve };
    listConversations({ query: { q: "(.*){20}x" } }, res, reject);
  });
  const re = contactQuery.$or[1].name;
  assert.equal(re.test("(.*){20}x"), true);
  assert.equal(re.test("anything"), false);
});
