// services/vtext/vtextSettingsService.js
//
// Single global settings document, upserted lazily on first read so there's
// nothing to seed/migrate. Cached briefly in memory so hot paths don't hit
// Mongo per message while still picking up an admin's toggle within a few
// seconds.
const VtextSettings = require("../../model/vtext/vtextSettingsModel");

const CACHE_TTL_MS = 5000;
let cached = null; // { at, settings }

async function getSettings() {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.settings;

  const settings = await VtextSettings.findOneAndUpdate(
    {},
    {},
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  cached = { at: Date.now(), settings };
  return settings;
}

/** True unless consent has been explicitly switched off. A missing value (an older settings document) means consent IS required. */
function isConsentRequired(settings) {
  return settings?.requireConsent !== false;
}

/** @param {object} [actor] - the admin making the change ({ _id, name }), recorded when the consent switch moves */
async function updateSettings(patch, actor) {
  const update = {};
  if (patch.aiAutoReplyEnabled !== undefined) update.aiAutoReplyEnabled = !!patch.aiAutoReplyEnabled;
  if (patch.followUpsEnabled !== undefined) update.followUpsEnabled = !!patch.followUpsEnabled;
  if (patch.requireConsent !== undefined) {
    update.requireConsent = !!patch.requireConsent;
    update.consentChangedAt = new Date();
    update.consentChangedBy = {};
    if (actor?._id) update.consentChangedBy.adminId = actor._id;
    if (actor?.name) update.consentChangedBy.adminName = actor.name;
  }

  const settings = await VtextSettings.findOneAndUpdate(
    {},
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  cached = { at: Date.now(), settings }; // refresh immediately, don't wait out the TTL
  return settings;
}

module.exports = { getSettings, updateSettings, isConsentRequired };
