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

const PROPERTIES = [oakland, kingwood, cottage, elizabeth, colfax, chicago72nd, robin, crawford];

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
  CRAWFORD_PROPERTY_ID: crawford.id
};