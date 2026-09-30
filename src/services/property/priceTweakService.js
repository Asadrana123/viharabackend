// services/property/priceTweakService.js
//
// Every money figure copied from Zillow is shifted by one fixed percentage
// between -2% and +2% so Vihara never shows Zillow's exact numbers.
//
// Each property gets ONE percentage (stored in productModel.zillowSync.tweakPercent)
// and every figure on that property uses it. That keeps the numbers consistent
// with each other (price vs. price/sqft, year-over-year tax changes) and stable
// across the weekly sync — they only move when Zillow's own numbers move.

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

module.exports = {
    MAX_TWEAK_PERCENT,
    createTweakPercent,
    isValidTweakPercent,
    tweakAmount,
};
