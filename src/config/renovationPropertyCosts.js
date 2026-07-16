/**
 * renovationPropertyCosts.js
 *
 * Compatibility shim. The cost data now lives in ./renovationCosts/, one file
 * per property, so a single property can be edited without touching any other.
 * This file re-exports the same public API, so the existing require in
 * renovationController.js continues to work unchanged.
 */

module.exports = require('./renovationCosts');