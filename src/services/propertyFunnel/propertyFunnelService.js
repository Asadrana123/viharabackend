// services/propertyFunnel/propertyFunnelService.js
//
// Property Funnel: the page's Dataset for the last `days` Pacific days (default 60, 14 to 400).
const { loadInputs } = require("./pfSources");
const { buildDataset, windowFor } = require("./buildDataset");

const clampDays = (v) => Math.min(400, Math.max(14, Number(v) || 60));

async function getPropertyFunnelDataset({ days, now = new Date() } = {}) {
  const d = clampDays(days);
  const { minDate, since } = windowFor(d, now);
  return buildDataset(await loadInputs({ since, minDate }), { days: d, now });
}

module.exports = { getPropertyFunnelDataset, clampDays };
