/**
 * config/renovationCosts/scaleCostAnalysis.js
 *
 * Display-side adjustment for renovation cost estimates.
 *
 * The figures the cost engine derives from line items run higher than what we
 * want to surface to buyers, so every DOLLAR amount in a costAnalysis is scaled
 * by FRONTEND_COST_FACTOR before it is persisted and returned. Percentages, ROI
 * recovery rates, regionalFactor and all text/label fields are left untouched —
 * scaling every dollar by the same factor preserves every ratio, so the
 * on-screen breakdown still reconciles with its own total.
 */

const FRONTEND_COST_FACTOR = 0.7;

const scale = (n, factor) =>
  typeof n === "number" && Number.isFinite(n) ? Math.round(n * factor) : n;

const scaleRange = (range, factor) =>
  range && typeof range === "object"
    ? { ...range, min: scale(range.min, factor), max: scale(range.max, factor) }
    : range;

/**
 * Return a new costAnalysis with every dollar amount multiplied by `factor`.
 * The input object is not mutated.
 *
 * @param {object} costAnalysis
 * @param {number} [factor=FRONTEND_COST_FACTOR]
 * @returns {object}
 */
const scaleCostAnalysis = (costAnalysis, factor = FRONTEND_COST_FACTOR) => {
  if (!costAnalysis || typeof costAnalysis !== "object") return costAnalysis;

  const scaled = { ...costAnalysis };

  // Top-level totals
  scaled.finalCost = scale(costAnalysis.finalCost, factor);
  scaled.costRange = scaleRange(costAnalysis.costRange, factor);

  // Line items: cost + per-item range are dollars; roiRecovery is a % (kept).
  if (Array.isArray(costAnalysis.lineItems)) {
    scaled.lineItems = costAnalysis.lineItems.map((li) => ({
      ...li,
      cost: scale(li.cost, factor),
      costRange: scaleRange(li.costRange, factor),
    }));
  }

  // Contingency: amount is dollars; percentage + reason kept.
  if (costAnalysis.contingency && typeof costAnalysis.contingency === "object") {
    scaled.contingency = {
      ...costAnalysis.contingency,
      amount: scale(costAnalysis.contingency.amount, factor),
    };
  }

  // Breakdown: subtotal is dollars; the rest are labels.
  if (costAnalysis.breakdown && typeof costAnalysis.breakdown === "object") {
    scaled.breakdown = {
      ...costAnalysis.breakdown,
      subtotal: scale(costAnalysis.breakdown.subtotal, factor),
    };
  }

  // ROI: estimatedValueIncrease is dollars; recoveryPercentage is a % (kept).
  if (costAnalysis.roiEstimate && typeof costAnalysis.roiEstimate === "object") {
    scaled.roiEstimate = {
      ...costAnalysis.roiEstimate,
      estimatedValueIncrease: scale(
        costAnalysis.roiEstimate.estimatedValueIncrease,
        factor
      ),
    };
  }

  // marketContext (regionalFactor is a multiplier) and disclaimer: unchanged.
  return scaled;
};

module.exports = { FRONTEND_COST_FACTOR, scaleCostAnalysis };