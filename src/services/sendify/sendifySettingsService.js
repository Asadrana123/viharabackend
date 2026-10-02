// services/sendify/sendifySettingsService.js
//
// Single global settings document, upserted lazily on first read so there's
// nothing to seed/migrate. Cached briefly in memory since checkQuietHours
// (sendifyQuietHoursService.js) reads this on every routed message — a TTL
// cache keeps that path from hitting Mongo per message while still picking
// up an admin's toggle within a few seconds.
const SendifySettings = require("../../model/sendify/sendifySettingsModel");

const CACHE_TTL_MS = 5000;
let cached = null; // { at, settings }

async function getSettings() {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.settings;

  const settings = await SendifySettings.findOneAndUpdate(
    {},
    {},
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  cached = { at: Date.now(), settings };
  return settings;
}

async function updateSettings(patch) {
  const update = {};
  if (patch.quietHoursEnabled !== undefined) update.quietHoursEnabled = !!patch.quietHoursEnabled;

  const settings = await SendifySettings.findOneAndUpdate(
    {},
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  cached = { at: Date.now(), settings }; // refresh immediately, don't wait out the TTL
  return settings;
}

module.exports = { getSettings, updateSettings };
