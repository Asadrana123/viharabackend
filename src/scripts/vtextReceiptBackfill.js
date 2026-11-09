// scripts/vtextReceiptBackfill.js
//
// One-off: asks the Mac (BlueBubbles) what really happened to our older iMessage texts and compares it with what
// Vtext has stored. Answers "how many of the 'no receipt' texts were actually delivered?" and, with --apply,
// fixes the records.
//
// Dry run (the default) only READS: one BlueBubbles query per line, plus Mongo reads. Nothing is written or sent.
// --apply writes the status, deliveredAt / readAt and clears the stale error. It does NOT run the live receipt
// path (no SMS fallback, no Slack alert): these are old texts. Texts that were also re-sent by SMS are listed,
// because those people got both.
//
//   node src/scripts/vtextReceiptBackfill.js               # dry run, last 30 days
//   node src/scripts/vtextReceiptBackfill.js --days 60     # dry run, a longer window
//   node src/scripts/vtextReceiptBackfill.js --apply       # writes

try { require("dotenv").config(); } catch (_) { /* env already set on Render */ }

const mongoose = require("mongoose");
const VtextMessage = require("../model/vtext/vtextMessageModel");
const VtextLine = require("../model/vtext/vtextLineModel");
const VtextContact = require("../model/vtext/vtextContactModel");
const { getAdapter } = require("../services/vtext/channels/registry");
const { isNews } = require("../services/vtext/vtextBluebubblesCatchup");

const APPLY = process.argv.includes("--apply");
const daysArg = process.argv.indexOf("--days");
const DAYS = daysArg > -1 ? Number(process.argv[daysArg + 1]) : 30;

async function main() {
  if (!process.env.DB_URI) throw new Error("DB_URI is not set");
  await mongoose.connect(process.env.DB_URI);
  const now = Date.now();
  const lines = await VtextLine.find({ channelType: "imessage-bluebubbles", status: { $ne: "retired" } }).select("+credentials.iv +credentials.tag +credentials.ciphertext");

  const changes = [];
  for (const line of lines) {
    let events;
    try {
      events = await getAdapter(line.channelType).fetchRecentEvents({ line, after: now - DAYS * 86_400_000, before: now - 120_000, maxPages: 20 });
    } catch (err) {
      console.error(`Could not reach ${line.name}: ${err.message}`);
      continue;
    }
    const statusEvents = events.filter((e) => e.type === "message.status" && e.providerMessageId);
    const stored = await VtextMessage.find({ channelType: line.channelType, direction: "out", "provider.messageId": { $in: statusEvents.map((e) => e.providerMessageId) } })
      .select("status provider.messageId error contactId fallback deliveredAt readAt")
      .lean();
    const byId = new Map(stored.map((m) => [m.provider.messageId, m]));
    // One event per message (read wins over delivered in the parser), so the latest state is what we compare.
    for (const e of statusEvents) {
      const m = byId.get(e.providerMessageId);
      if (m && isNews(m, e)) changes.push({ line: line.name, message: m, event: e });
    }
  }

  const contacts = await VtextContact.find({ _id: { $in: changes.map((c) => c.message.contactId) } }).select("name phoneE164").lean();
  const who = new Map(contacts.map((c) => [String(c._id), `${c.name || "(no name)"} ${c.phoneE164}`]));
  const tally = {};
  for (const { message: m, event: e } of changes) {
    const key = `${m.status}${m.error?.code ? ` (${m.error.code})` : ""} -> ${e.status}`;
    tally[key] = (tally[key] || 0) + 1;
  }
  console.log(`\nTexts where the Mac knows more than Vtext (last ${DAYS} days): ${changes.length}`);
  for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);

  const doubled = changes.filter((c) => ["delivered", "read"].includes(c.event.status) && c.message.fallback?.status === "queued");
  if (doubled.length) {
    console.log(`\nDelivered on iMessage AND re-sent by SMS (these people got the text twice): ${doubled.length}`);
    for (const c of doubled) console.log(`  ${who.get(String(c.message.contactId)) || c.message.contactId}`);
  }

  const doubledIds = new Set(doubled.map((c) => String(c.message._id)));

  if (!APPLY) {
    console.log("\nDry run: nothing written. Run with --apply to update these records.");
  } else {
    let written = 0;
    for (const { message: m, event: e } of changes) {
      const set = { status: e.status };
      const unset = {};
      if (e.status === "failed") {
        Object.assign(set, { error: { kind: e.errorKind, code: e.errorCode, message: e.errorMessage }, failedAt: e.at });
      } else {
        if (e.status === "read") set.readAt = e.at;
        if (!m.deliveredAt) set.deliveredAt = e.at; // a read implies delivery
        Object.assign(unset, { error: 1, failedAt: 1 });
      }
      if (doubledIds.has(String(m._id))) set["fallback.duplicate"] = true;
      // Only if nothing changed it since it was read above.
      const r = await VtextMessage.updateOne(
        { _id: m._id, status: m.status },
        { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}), $push: { statusHistory: { status: e.status, at: new Date(), detail: "receipt backfill from the Mac" } } }
      );
      written += r.modifiedCount;
    }
    console.log(`\nUpdated ${written} of ${changes.length} records.`);
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
