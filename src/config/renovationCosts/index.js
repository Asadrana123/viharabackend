/**
 * renovationCosts/index.js
 *
 * Registry of every property that has hardcoded, hand-verified renovation costs.
 *
 * TO ADD A PROPERTY: create one file in this folder that exports { id, config },
 * then add it to the PROPERTIES array below. Nothing else changes.
 */

const { buildAnalysisFromConfig } = require('./_shared');

const oakland    = require('./oakland_adeline');
const kingwood   = require('./kingwood_brookside');
const cottage    = require('./bayonne_cottage');
const elizabeth  = require('./chicago_elizabeth');
const colfax     = require('./chicago_colfax');
const chicago72nd = require('./chicago_72nd');
const robin      = require('./thomson_robin');
const crawford   = require('./matteson_crawford');
const ogdensburg = require('./ogdensburg_rensselaer');
const bigbear    = require('./bigbear_georgia');

// ── Central & Northern California foreclosure batch (Aug 2026) ────────────────
const atwater        = require('./atwater_tamarack');
const sonoraSallander = require('./sonora_sallander');
const oakdale        = require('./oakdale_2nd');
const turlockPedras  = require('./turlock_pedras');
const southsf        = require('./southsf_rockwood');
const turlockViolet  = require('./turlock_violet');
const turlockNikki   = require('./turlock_nikkiann');
const twainharte     = require('./twainharte_towhee');
const sonoraHillview = require('./sonora_hillview');
const stevinson      = require('./stevinson_hwy140');
const patterson      = require('./patterson_mendocino');
const brentwood      = require('./brentwood_lillian');

const PROPERTIES = [
  oakland, kingwood, cottage, elizabeth, colfax, chicago72nd, robin, crawford, ogdensburg, bigbear,
  atwater, sonoraSallander, oakdale, turlockPedras, southsf, turlockViolet, turlockNikki,
  twainharte, sonoraHillview, stevinson, patterson, brentwood
];

const PROPERTY_COSTS = PROPERTIES.reduce((map, p) => {
  map[p.id] = p.config;
  return map;
}, {});

/**
 * Returns true if this propertyId has hardcoded cost data.
 */
const hasHardcodedCosts = (propertyId) =>
  Object.prototype.hasOwnProperty.call(PROPERTY_COSTS, propertyId?.toString());

/**
 * Returns the full hardcoded cost config for a property, or null.
 */
const getPropertyCostConfig = (propertyId) =>
  PROPERTY_COSTS[propertyId?.toString()] ?? null;

/**
 * Build a costAnalysis object in the exact shape the frontend CostDisplay
 * renders and renovationRequestModel.costAnalysis stores.
 *
 * @param {string} propertyId
 * @param {object} renovationData { primaryArea, budgetTier, architecturalElements?, exteriorFocusAreas? }
 * @returns {object|null} costAnalysis, or null when property/area is not configured
 */
const buildHardcodedCostAnalysis = (propertyId, renovationData) =>
  buildAnalysisFromConfig(getPropertyCostConfig(propertyId), renovationData);

module.exports = {
  PROPERTY_COSTS,
  hasHardcodedCosts,
  getPropertyCostConfig,
  buildHardcodedCostAnalysis,

  // Property ID constants — re-exported so existing imports keep working.
  OAKLAND_PROPERTY_ID: oakland.id,
  KINGWOOD_PROPERTY_ID: kingwood.id,
  COTTAGE_PROPERTY_ID: cottage.id,
  ELIZABETH_PROPERTY_ID: elizabeth.id,
  COLFAX_PROPERTY_ID: colfax.id,
  CHICAGO_72ND_PROPERTY_ID: chicago72nd.id,
  ROBIN_PROPERTY_ID: robin.id,
  CRAWFORD_PROPERTY_ID: crawford.id,
  RENSSELAER_PROPERTY_ID: ogdensburg.id,
  GEORGIA_PROPERTY_ID: bigbear.id,

  // Central & Northern California foreclosure batch (Aug 2026)
  ATWATER_PROPERTY_ID: atwater.id,
  SONORA_SALLANDER_PROPERTY_ID: sonoraSallander.id,
  OAKDALE_PROPERTY_ID: oakdale.id,
  TURLOCK_PEDRAS_PROPERTY_ID: turlockPedras.id,
  SOUTHSF_PROPERTY_ID: southsf.id,
  TURLOCK_VIOLET_PROPERTY_ID: turlockViolet.id,
  TURLOCK_NIKKIANN_PROPERTY_ID: turlockNikki.id,
  TWAINHARTE_PROPERTY_ID: twainharte.id,
  SONORA_HILLVIEW_PROPERTY_ID: sonoraHillview.id,
  STEVINSON_PROPERTY_ID: stevinson.id,
  PATTERSON_PROPERTY_ID: patterson.id,
  BRENTWOOD_PROPERTY_ID: brentwood.id
};
