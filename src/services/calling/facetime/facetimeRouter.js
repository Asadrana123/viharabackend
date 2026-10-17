// services/calling/facetime/facetimeRouter.js
//
// Before every call: should this one go out over FaceTime, and on which Mac?
// Returns null for "no, call normally through Vapi", which is the answer
// whenever anything is off, unknown or busy. It never throws: a problem here
// must never stop a call from going out.
const crypto = require("crypto");
const VtextLine = require("../../../model/vtext/vtextLineModel");
const VtextContact = require("../../../model/vtext/vtextContactModel");
const FacetimeCallJob = require("../../../model/calling/facetimeCallJobModel");
const { ACTIVE_STATUSES } = FacetimeCallJob;
const { phoneKey } = require("../dailyDialGuard");
const { isServerEnabled, getSettings } = require("./facetimeSettingsService");

// A Mac that hasn't checked in for this long counts as offline (it checks in every 30s).
const HEARTBEAT_FRESH_MS = 90 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** The same number always lands in the same 0-99 bucket, so "10%" is a stable group, not a coin flip per call. */
function bucketOf(key) {
  return parseInt(crypto.createHash("sha256").update(key).digest("hex").slice(0, 8), 16) % 100;
}

/** Is this number in the test group? Allowlist numbers skip the iPhone check (they're our own phones). */
async function isInTestGroup(key, settings) {
  if (settings.mode === "allowlist") return (settings.allowlist || []).includes(key);

  if (!(settings.percent > 0) || bucketOf(key) >= settings.percent) return false;
  const contact = await VtextContact.findOne({ phoneE164: `+${key}` }).select("iphone").lean();
  return contact?.iphone?.isIphone === true;
}

/** The online Mac with FaceTime on, no call in progress, and the fewest calls in the last hour. */
async function pickFreeLine(settings) {
  const lines = await VtextLine.find({
    "facetime.enabled": true,
    status: { $nin: ["quarantined", "retired"] },
    "facetime.lastHeartbeatAt": { $gte: new Date(Date.now() - HEARTBEAT_FRESH_MS) },
  })
    .select("_id name")
    .lean();

  let best = null;
  for (const line of lines) {
    if (await FacetimeCallJob.exists({ lineId: line._id, status: { $in: ACTIVE_STATUSES } })) continue;
    const lastHour = await FacetimeCallJob.countDocuments({ lineId: line._id, queuedAt: { $gte: new Date(Date.now() - HOUR_MS) } });
    if (lastHour >= (settings.maxCallsPerHourPerLine || 15)) continue;
    if (!best || lastHour < best.lastHour) best = { line, lastHour };
  }
  return best ? best.line : null;
}

/**
 * @param {string} phone - the number about to be dialed, any format
 * @returns {Promise<object|null>} the line (Mac) to use, or null to call through Vapi as usual
 */
async function pickFacetimeLine(phone) {
  if (!isServerEnabled()) return null;
  try {
    const settings = await getSettings();
    if (!settings.enabled) return null;

    const key = phoneKey(phone);
    if (key.length < 10) return null;
    if (!(await isInTestGroup(key, settings))) return null;

    return await pickFreeLine(settings);
  } catch (err) {
    console.error("[facetime] line pick failed, calling normally (non-fatal):", err.message);
    return null;
  }
}

module.exports = { pickFacetimeLine, bucketOf, HEARTBEAT_FRESH_MS };
