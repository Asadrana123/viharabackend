// services/marketing/briefService.js
//
// PRD Step 4 - the marketing brief. One document per run, built only from the
// gate output. Every generator reads from it, so a number or CTA is written
// once here and is identical on the ad, the landing page, the email and SMS.
//
// Pure code, no AI. Throws a 422 when required verified fields are Blocked.

const Errorhandler = require("../../utils/errorhandler");
const { BUYER_TYPES, GATE_BINS } = require("../../config/marketing/marketingConstants");
const { resolveCta } = require("./matrixService");

const MAX_RESEARCH_VALUE_CHARS = 300;

// Auction dates are saved as calendar dates, so format them in UTC to show the
// same day the admin picked.
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
});
const USD_FORMAT = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
});

const formatUsd = (n) => USD_FORMAT.format(Math.round(n));
const formatDate = (d) => DATE_FORMAT.format(d);
const formatNumber = (n) => Number(n).toLocaleString("en-US");

function researchValueToText(value) {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text.length > MAX_RESEARCH_VALUE_CHARS ? `${text.slice(0, MAX_RESEARCH_VALUE_CHARS)}...` : text;
}

/**
 * @param {object} input
 * @param {object} input.gate         runVerificationGate() output
 * @param {string} input.buyerType
 * @param {object[]} input.cells      getBuildableCells().cells
 * @param {object[]} input.skippedCells
 * @returns {object} the brief
 */
function buildBrief({ gate, buyerType, cells = [], skippedCells = [] }) {
    if (gate.missingRequired.length) {
        throw new Errorhandler(`Needs input before the brief can be built: ${gate.missingRequired.join(", ")}`, 422);
    }

    const v = gate.verified;
    const isInvestor = buyerType === BUYER_TYPES.INVESTOR;
    const gapVerified = gate.valueGap.bin === GATE_BINS.VERIFIED;

    // ---- numbers (the only dollar amounts copy may contain) -----------------
    const numbers = {
        startBid: v.startBid ?? null,
        viharaEstimate: v.viharaEstimate ?? null,
        valueGap: gapVerified ? gate.valueGap.amount : null,
        monthlyHOADues: v.monthlyHOADues > 0 ? v.monthlyHOADues : null,
        // Rent / rehab framing is investor-only (PRD compliance).
        rentEstimate: isInvestor ? v.rentEstimate ?? null : null,
        rehabEstimate: isInvestor && v.rehabEstimate > 0 ? v.rehabEstimate : null,
    };
    const allowedDollarAmounts = Object.values(numbers).filter((n) => Number.isFinite(n) && n > 0);

    // ---- exact reusable strings ----------------------------------------------
    // Home-buyer copy may not say "bid", so the price line changes wording.
    const priceLabel = isInvestor ? "Starting bid" : "Starting price";
    const auctionEndsOn = gate.readiness.auctionDate ? formatDate(v.auctionEndDate) : null;

    const specsParts = [
        `${formatNumber(v.beds)} bed`,
        `${formatNumber(v.baths)} bath`,
        `${formatNumber(v.squareFootage)} sq ft`,
    ];

    const strings = {
        address: `${v.street}, ${v.city}, ${v.state} ${v.zipCode}`,
        cityState: `${v.city}, ${v.state}`,
        specsLine: specsParts.join(" | "),
        priceLine: numbers.startBid ? `${priceLabel}: ${formatUsd(numbers.startBid)}` : null,
        estimateLine: numbers.viharaEstimate ? `Vihara estimate: ${formatUsd(numbers.viharaEstimate)}` : null,
        valueGapLine: gapVerified ? `${formatUsd(numbers.valueGap)} below the Vihara estimate` : null,
        auctionDateLine: auctionEndsOn ? `Auction ends ${auctionEndsOn}` : null,
        rentLine: numbers.rentEstimate ? `Estimated rent: ${formatUsd(numbers.rentEstimate)}/month` : null,
        rehabLine: numbers.rehabEstimate ? `Estimated rehab: ${formatUsd(numbers.rehabEstimate)}` : null,
        hoaLine: numbers.monthlyHOADues ? `HOA: ${formatUsd(numbers.monthlyHOADues)}/month` : null,
        // Landing page, email and SMS CTA (owner-occupant swaps "Register to Bid").
        primaryCta: resolveCta(buyerType, "Register to Bid"),
    };

    // ---- verified facts (claims allowed) ---------------------------------------
    const facts = {
        propertyType: v.propertyType,
        beds: v.beds,
        baths: v.baths,
        squareFootage: v.squareFootage,
        lotSize: v.lotSize ?? null,
        yearBuilt: v.yearBuilt ?? null,
        occupancyStatus: v.occupancyStatus ?? null,
        // Asset type is auction jargon, so home-buyer briefs leave it out.
        assetType: isInvestor ? v.assetType ?? null : null,
        features: v.features || [],
        photoCount: Array.isArray(v.photos) ? v.photos.length : 0,
        auctionEndsOn,
    };

    // ---- researched context (color only, never a claim) ----------------------
    const research = gate.researched.map((r) => ({
        key: r.key,
        text: researchValueToText(r.value),
        sourceUrl: r.sourceUrl,
        confidence: r.confidence,
    }));

    return {
        buyerType,
        financingTermsConfirmed: gate.flags.financingTermsConfirmed,
        valueGap: {
            status: gate.valueGap.bin,
            amount: numbers.valueGap,
            reason: gate.valueGap.reason,
        },
        facts,
        numbers,
        strings,
        research,
        allowedDollarAmounts,
        blocked: gate.blocked.fields.map((f) => ({ key: f.key, label: f.label, reason: f.reason })),
        cells,
        skippedCells,
    };
}

module.exports = { buildBrief, formatUsd };
