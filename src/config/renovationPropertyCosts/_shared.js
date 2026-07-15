/**
 * renovationCosts/_shared.js
 *
 * Tier vocabulary, distressed-property range spread, and the derivation engine
 * shared by every property config.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH: line items.
 * ─────────────────────────────────────────────────────────────────────────────
 * Each line item carries an explicit dollar cost for all four budget tiers.
 * Nothing else is hardcoded. Subtotal, contingency, final cost, cost range and
 * ROI are all DERIVED from the line items at build time. This makes it
 * impossible for the on-screen breakdown to disagree with its own total.
 *
 * ─── TIER MULTIPLIERS (for reference when authoring a new property) ──────────
 * Every existing line item follows one of two fixed shapes, relative to the
 * Mid-Range figure. Keep new properties on these shapes so tiers stay coherent
 * across the portfolio:
 *   Exterior line items : 0.60 / 1.00 / 1.55 / 2.30
 *   Interior line items : 0.55 / 1.00 / 1.70 / 2.80
 *
 * ─── EXTERIOR: two independent choices ───────────────────────────────────────
 * The exterior form collects TWO fields, and both are priced and merged:
 *   architecturalElements  (Repaint only | Update roof/siding | New windows | New entrance)
 *   exteriorFocusAreas     (Front entrance | Landscaping | Driveway | Patio | All)
 * A repaint PLUS new landscaping genuinely costs more than either alone, so the
 * two line-item sets are merged (deduped by item name, element wins on clash).
 *
 * ─── DISTRESSED-PROPERTY RISK ────────────────────────────────────────────────
 * These are REO / auction properties that cannot be deeply inspected before
 * bidding. Hidden conditions (foundation, wiring, plumbing, mold) skew costs
 * upward, so the displayed range is deliberately asymmetric: the top end is
 * widened well beyond the bottom. The estimate is a starting point to verify
 * with a contractor, never a quote.
 */

// ── Budget-tier vocabulary ───────────────────────────────────────────────────
const BUDGET_TIERS = ['Budget-Friendly', 'Mid-Range', 'Premium', 'Luxury'];
const DEFAULT_TIER = 'Mid-Range';

// Distressed-property range spread applied to the derived final cost.
// Asymmetric on purpose: -12% floor, +35% ceiling for surprise-heavy REO work.
const RANGE_SPREAD = { min: 0.88, max: 1.35 };

const EXTERIOR = 'Exterior';

const round = (n) => Math.round(n);

const resolveTier = (tier) => (BUDGET_TIERS.includes(tier) ? tier : DEFAULT_TIER);

/**
 * Cost-weighted average of a per-line-item percentage. Weighting by cost keeps
 * a blended ROI honest: a $19k roof at 68% must outweigh a $1k fixture at 120%.
 */
const weightedAverage = (items, valueKey, weightKey) => {
  const totalWeight = items.reduce((s, i) => s + i[weightKey], 0);
  if (totalWeight <= 0) return 0;
  return items.reduce((s, i) => s + i[valueKey] * i[weightKey], 0) / totalWeight;
};

/** Resolve a line item's cost at a tier and drop the tier table from output. */
const priceLineItem = (li, tier) => {
  const cost = round(li.tiers[tier] ?? li.tiers[DEFAULT_TIER] ?? 0);
  return {
    item: li.item,
    description: li.description,
    costBasis: li.costBasis,
    cost,
    costRange: {
      min: round(cost * RANGE_SPREAD.min),
      max: round(cost * RANGE_SPREAD.max)
    },
    roiRecovery: li.roiRecovery
  };
};

/** Merge two priced lists, keeping the first occurrence of any duplicate item. */
const mergeLineItems = (primary, secondary) => {
  const seen = new Set(primary.map((i) => i.item));
  return [...primary, ...secondary.filter((i) => !seen.has(i.item))];
};

/**
 * Resolve priced line items + contingency + ROI narrative for an area/tier,
 * handling the Exterior element+focus merge.
 */
const resolveScope = (areaConfig, areaName, renovationData, tier) => {
  if (areaName !== EXTERIOR) {
    return {
      lineItems: areaConfig.lineItems.map((li) => priceLineItem(li, tier)),
      contingency: areaConfig.contingency,
      roiNote: areaConfig.roiNote,
      primaryWork: areaName,
      focusArea: areaName
    };
  }

  // Exterior: pick the architectural element and the focus area independently,
  // falling back to defaults when the form field is absent or unrecognized.
  const elementKey =
    renovationData.architecturalElements &&
    areaConfig.architecturalElements[renovationData.architecturalElements]
      ? renovationData.architecturalElements
      : areaConfig.defaultElement;

  const focusKey =
    renovationData.exteriorFocusAreas &&
    areaConfig.focusAreas[renovationData.exteriorFocusAreas]
      ? renovationData.exteriorFocusAreas
      : areaConfig.defaultFocusArea;

  const element = areaConfig.architecturalElements[elementKey];
  const focus = areaConfig.focusAreas[focusKey];

  const lineItems = mergeLineItems(
    element.lineItems.map((li) => priceLineItem(li, tier)),
    focus.lineItems.map((li) => priceLineItem(li, tier))
  );

  // Combined scope carries the stricter (higher) contingency.
  const contingency =
    focus.contingency.percentage > element.contingency.percentage
      ? focus.contingency
      : element.contingency;

  return {
    lineItems,
    contingency,
    roiNote: {
      message: `${element.roiNote.message} ${focus.roiNote.message}`.trim(),
      source: [...new Set([element.roiNote.source, focus.roiNote.source].filter(Boolean))].join(' · ')
    },
    primaryWork: elementKey,
    focusArea: focusKey
  };
};

/**
 * Build a costAnalysis object in the exact shape the frontend CostDisplay
 * renders and renovationRequestModel.costAnalysis stores.
 *
 * @param {object} config           a single property's cost config
 * @param {object} renovationData   { primaryArea, budgetTier, architecturalElements?, exteriorFocusAreas? }
 * @returns {object|null} costAnalysis, or null when the area is not configured
 */
const buildAnalysisFromConfig = (config, renovationData) => {
  if (!config) return null;

  const areaConfig = config.areas[renovationData.primaryArea];
  if (!areaConfig) return null;

  const tier = resolveTier(renovationData.budgetTier);
  const { lineItems, contingency, roiNote, primaryWork, focusArea } =
    resolveScope(areaConfig, renovationData.primaryArea, renovationData, tier);

  if (!lineItems.length) return null;

  // ── Everything below is DERIVED from the line items ────────────────────────
  const subtotal = lineItems.reduce((s, i) => s + i.cost, 0);
  const contingencyAmount = round(subtotal * (contingency.percentage / 100));
  const finalCost = subtotal + contingencyAmount;

  const recoveryPercentage = round(weightedAverage(lineItems, 'roiRecovery', 'cost'));
  const estimatedValueIncrease = round((finalCost * recoveryPercentage) / 100);

  const { city, state, regionalFactor, dataSource } = config.meta;

  const contextMessage =
    regionalFactor > 1.05
      ? `${city} renovation costs run about ${round((regionalFactor - 1) * 100)}% above the national average. This estimate already reflects that premium.`
      : regionalFactor < 0.95
        ? `${city} renovation costs run about ${round((1 - regionalFactor) * 100)}% below the national average — your budget goes further here than in most US metros.`
        : `${city} renovation costs track close to the national average.`;

  return {
    finalCost,
    costRange: {
      min: round(finalCost * RANGE_SPREAD.min),
      max: round(finalCost * RANGE_SPREAD.max)
    },
    lineItems,
    contingency: {
      percentage: contingency.percentage,
      amount: contingencyAmount,
      reason: contingency.reason
    },
    breakdown: {
      primaryWork,
      focusArea,
      tier,
      location: `${city}, ${state}`,
      subtotal
    },
    marketContext: {
      state,
      city,
      regionalFactor,
      message: contextMessage,
      dataSource
    },
    roiEstimate: {
      estimatedValueIncrease,
      recoveryPercentage,
      roiMessage: `${roiNote.message} At this scope and tier, the blended recovery across all line items is about ${recoveryPercentage}%.`.trim(),
      source: roiNote.source
    },
    // Distressed-property honesty flag — the frontend can surface this as a
    // "verify before bidding" note. Costs shown are AI-assisted estimates, not
    // quotes, and cannot account for concealed structural/mechanical issues.
    disclaimer:
      'Estimate only — not a contractor quote. REO/auction properties may have concealed issues (foundation, plumbing, electrical, mold) that are not visible in listing photos. Verify with a licensed contractor before bidding.'
  };
};

module.exports = {
  BUDGET_TIERS,
  DEFAULT_TIER,
  RANGE_SPREAD,
  EXTERIOR,
  round,
  resolveTier,
  weightedAverage,
  priceLineItem,
  mergeLineItems,
  resolveScope,
  buildAnalysisFromConfig
};
