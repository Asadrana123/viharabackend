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

async function updateSettings(patch) {
  const update = {};
  if (patch.aiAutoReplyEnabled !== undefined) update.aiAutoReplyEnabled = !!patch.aiAutoReplyEnabled;

  const settings = await VtextSettings.findOneAndUpdate(
    {},
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  cached = { at: Date.now(), settings }; // refresh immediately, don't wait out the TTL
  return settings;
}

module.exports = { getSettings, updateSettings };
