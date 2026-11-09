// services/usage/spendSync.js
/**
 * What the Creative OS server sends: its spend items (Claude runs for hook scout, LinkedIn, videos ...,
 * and treg generations) and treg's balance. Each item carries the Creative OS's own id, so the same
 * push sent again is stored once (upsert on extId).
 */
const MAX_ITEMS = 5000;
const str = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

function cleanItem(raw) {
  if (!raw || typeof raw !== "object") throw new Error("An item is not an object.");
  const extId = str(raw.id, 300);
  if (!extId) throw new Error("An item has no id.");
  const at = new Date(raw.at);
  if (Number.isNaN(at.getTime())) throw new Error(`${extId}: no valid time.`);
  const feature = str(raw.feature, 60);
  if (!/^[a-z0-9-]+$/.test(feature)) throw new Error(`${extId}: feature must be a lowercase key.`);
  const usd = raw.usd === null || raw.usd === undefined ? null : typeof raw.usd === "number" && Number.isFinite(raw.usd) && raw.usd >= 0 && raw.usd < 10000 ? raw.usd : NaN;
  if (Number.isNaN(usd)) throw new Error(`${extId}: usd must be a number or null.`);
  return {
    extId: `cos:${extId}`,
    at,
    source: "creative-os",
    feature,
    provider: str(raw.provider, 40),
    tool: str(raw.tool, 80),
    model: str(raw.model, 120),
    usd,
    inputTokens: num(raw.inputTokens),
    outputTokens: num(raw.outputTokens),
    what: str(raw.what, 200),
    by: str(raw.by, 120),
    ref: str(raw.ref, 120),
  };
}

/** Checks a push; refuses the whole push on a bad item, so nothing half-stored is mistaken for complete. */
function cleanPush(body) {
  const items = Array.isArray(body?.items) ? body.items : null;
  if (!items) throw new Error("items must be a list.");
  if (items.length > MAX_ITEMS) throw new Error(`At most ${MAX_ITEMS} items in one push.`);
  const balances = (Array.isArray(body.balances) ? body.balances : []).slice(0, 10).map((b) => ({
    provider: str(b?.provider, 40),
    usd: typeof b?.usd === "number" && Number.isFinite(b.usd) ? b.usd : null,
    at: Number.isNaN(new Date(b?.at).getTime()) ? new Date() : new Date(b.at),
  })).filter((b) => b.provider);
  return { items: items.map(cleanItem), balances };
}

async function storePush({ items, balances }) {
  const { AiSpend, AiBalance } = require("../../model/usage/aiSpendModel");
  let stored = 0;
  for (let i = 0; i < items.length; i += 500) {
    const chunk = items.slice(i, i + 500);
    const res = await AiSpend.bulkWrite(chunk.map((doc) => ({ updateOne: { filter: { extId: doc.extId }, update: { $set: doc }, upsert: true } })), { ordered: false });
    stored += (res.upsertedCount || 0) + (res.modifiedCount || 0);
  }
  const now = new Date();
  for (const b of [...balances, { provider: "creative-os-sync", usd: null, at: now }]) {
    await AiBalance.updateOne({ provider: b.provider }, { $set: { usd: b.usd, at: b.at } }, { upsert: true });
  }
  return { received: items.length, stored };
}

module.exports = { cleanItem, cleanPush, storePush, MAX_ITEMS };
