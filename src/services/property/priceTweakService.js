// services/property/priceTweakService.js
//
// Every money figure copied from market data is shifted by one fixed percentage
// between -2% and +2% so Vihara never shows the source's exact numbers.
//
// Each property gets ONE percentage (stored in productModel.marketSync.tweakPercent)
// and every figure on that property uses it. That keeps the numbers consistent
// with each other (price vs. price/sqft, year-over-year tax changes) and stable
// across the weekly sync — they only move when the source's own numbers move.

const MAX_TWEAK_PERCENT = 2;

/** A new random percentage in [-2, +2], two decimals, never exactly 0. */
function createTweakPercent() {
    let percent = 0;
    while (percent === 0) {
        percent = Math.round((Math.random() * 2 - 1) * MAX_TWEAK_PERCENT * 100) / 100;
    }
    return percent;
}

/** True when the value is a usable stored percentage. */
function isValidTweakPercent(percent) {
    return typeof percent === "number" && Number.isFinite(percent) && Math.abs(percent) <= MAX_TWEAK_PERCENT;
}

/**
 * Shift one amount by the property's percentage, rounded to whole dollars.
 * null / undefined / non-numbers pass through unchanged (nothing is invented).
 */
function tweakAmount(value, percent) {
    if (value === null || value === undefined || value === "") return value ?? null;
    const n = Number(value);
    if (!Number.isFinite(n)) return value;
    return Math.round(n * (1 + percent / 100));
}

// When the listing has no estimate of its own, the estimated value is the
// (shifted) list price raised by one fixed percentage between 10% and 12%.
// Like the tweak, each property gets ONE uplift, stored next to tweakPercent
// and reused on every weekly sync, so the estimate never jumps around.
const MIN_ESTIMATE_UPLIFT_PERCENT = 10;
const MAX_ESTIMATE_UPLIFT_PERCENT = 12;

/** A new random uplift in [10, 12], two decimals. */
function createEstimateUpliftPercent() {
    const span = MAX_ESTIMATE_UPLIFT_PERCENT - MIN_ESTIMATE_UPLIFT_PERCENT;
    return Math.round((MIN_ESTIMATE_UPLIFT_PERCENT + Math.random() * span) * 100) / 100;
}

/** True when the value is a usable stored uplift. */
function isValidEstimateUpliftPercent(percent) {
    return typeof percent === "number"
        && Number.isFinite(percent)
        && percent >= MIN_ESTIMATE_UPLIFT_PERCENT
        && percent <= MAX_ESTIMATE_UPLIFT_PERCENT;
}

module.exports = {
    MAX_TWEAK_PERCENT,
    createTweakPercent,
    isValidTweakPercent,
    tweakAmount,
    MIN_ESTIMATE_UPLIFT_PERCENT,
    MAX_ESTIMATE_UPLIFT_PERCENT,
    createEstimateUpliftPercent,
    isValidEstimateUpliftPercent,
};
