// services/marketing/verificationGate.js
//
// PRD Step 2 - the verification gate. Pure, deterministic functions: the same
// property + enrichment + `now` always produce the same result. No database,
// no AI, no network.
//
// Bins:
//   Verified   - property record + internal numbers. Usable in headlines/claims.
//   Researched - Enrichment record items. Messaging color only, never a claim.
//   Blocked    - missing or unverifiable. Never used; shown as NEEDS INPUT.
//
// The value gap is computed here and only here:
//   investmentData.valuation.ViharaValue - startBid, whole dollars.
// It reads ONLY the property record, so enrichment numbers can never reach it.

const { VERIFIED_FIELDS, BLANK_STRING_VALUES } = require("../../config/marketing/gateConfig");
const {
    ENRICHMENT_KEYS,
    MIN_RESEARCH_CONFIDENCE,
    GATE_BINS,
} = require("../../config/marketing/marketingConstants");

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function getPath(obj, path) {
    return String(path)
        .split(".")
        .reduce((acc, part) => (acc == null ? undefined : acc[part]), obj);
}

const isHttpUrl = (v) => typeof v === "string" && /^https?:\/\/\S+$/i.test(v.trim());

function toValidDate(v) {
    if (v == null || v === "") return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
}

function collectPhotos(property) {
    const all = [property.image, ...(Array.isArray(property.otherImages) ? property.otherImages : [])];
    return all.filter((u) => typeof u === "string" && u.trim());
}

/**
 * Validate one raw value against its field definition.
 * @returns {{ ok: boolean, value: any, reason: string }}
 */
function validateField(def, raw) {
    switch (def.type) {
        case "number": {
            if (raw == null || raw === "") return { ok: false, value: null, reason: "missing" };
            const n = Number(raw);
            if (!Number.isFinite(n)) return { ok: false, value: null, reason: "not a number" };
            if (n < 0) return { ok: false, value: null, reason: "negative value" };
            if (def.positive && n === 0) return { ok: false, value: null, reason: "not set (0)" };
            return { ok: true, value: n, reason: "" };
        }
        case "date": {
            const d = toValidDate(raw);
            return d ? { ok: true, value: d, reason: "" } : { ok: false, value: null, reason: "missing" };
        }
        case "list": {
            const list = (Array.isArray(raw) ? raw : [])
                .map((s) => (typeof s === "string" ? s.trim() : ""))
                .filter(Boolean);
            return list.length ? { ok: true, value: list, reason: "" } : { ok: false, value: null, reason: "empty" };
        }
        case "string":
        default: {
            const s = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
            if (BLANK_STRING_VALUES.includes(s.toLowerCase())) return { ok: false, value: null, reason: "missing" };
            return { ok: true, value: s, reason: "" };
        }
    }
}

// ---------------------------------------------------------------------------
// Value gap - the single most important lock
// ---------------------------------------------------------------------------
/**
 * @param {{ viharaEstimate: number|null, startBid: number|null }} verified
 * @returns {{ bin: string, amount: number|null, viharaEstimate: number|null, startBid: number|null, reason: string }}
 */
function computeValueGap({ viharaEstimate, startBid }) {
    const base = { viharaEstimate: viharaEstimate ?? null, startBid: startBid ?? null, amount: null };

    if (viharaEstimate == null) {
        return { ...base, bin: GATE_BINS.BLOCKED, reason: "Vihara estimate is missing" };
    }
    if (startBid == null) {
        return { ...base, bin: GATE_BINS.BLOCKED, reason: "Starting bid is missing" };
    }

    const amount = Math.round(viharaEstimate - startBid);
    if (amount <= 0) {
        return { ...base, bin: GATE_BINS.BLOCKED, reason: "Vihara estimate is not above the starting bid" };
    }
    return { ...base, amount, bin: GATE_BINS.VERIFIED, reason: "" };
}

// ---------------------------------------------------------------------------
// Property fields -> Verified / Blocked
// ---------------------------------------------------------------------------
function gateVerifiedFields(property) {
    const fields = {};
    VERIFIED_FIELDS.forEach((def) => {
        const raw = def.key === "photos" ? collectPhotos(property) : getPath(property, def.path);
        const { ok, value, reason } = validateField(def, raw);
        fields[def.key] = {
            key: def.key,
            label: def.label,
            value: ok ? value : null,
            bin: ok ? GATE_BINS.VERIFIED : GATE_BINS.BLOCKED,
            reason: ok ? "" : reason,
            requiredForBrief: Boolean(def.requiredForBrief),
        };
    });
    return fields;
}

// ---------------------------------------------------------------------------
// Enrichment items -> Researched / Blocked
// ---------------------------------------------------------------------------
function gateResearch(enrichment) {
    const items = Array.isArray(enrichment?.items) ? enrichment.items : [];
    const gaps = Array.isArray(enrichment?.gaps) ? enrichment.gaps : [];

    const researched = [];
    const blocked = [];

    ENRICHMENT_KEYS.forEach((key) => {
        const forKey = items.filter((i) => i && i.key === key);
        const usable = forKey.filter(
            (i) =>
                isHttpUrl(i.sourceUrl) &&
                Number.isFinite(Number(i.confidence)) &&
                Number(i.confidence) >= MIN_RESEARCH_CONFIDENCE &&
                i.value != null &&
                i.value !== ""
        );

        if (usable.length) {
            usable.forEach((i) =>
                researched.push({
                    key,
                    value: i.value,
                    sourceUrl: i.sourceUrl.trim(),
                    confidence: Number(i.confidence),
                    gatheredAt: toValidDate(i.gatheredAt),
                    bin: GATE_BINS.RESEARCHED,
                })
            );
            return;
        }

        const gap = gaps.find((g) => g && g.key === key);
        let reason = "not researched yet";
        if (gap) reason = gap.reason || "no reliable source found";
        else if (forKey.length) reason = `confidence below ${MIN_RESEARCH_CONFIDENCE} or no valid source`;

        blocked.push({ key, bin: GATE_BINS.BLOCKED, reason });
    });

    return { researched, blocked };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
/**
 * Sort every data point for one property.
 *
 * @param {object} property    productModel document (or plain object).
 * @param {object|null} enrichment  marketingEnrichment document, if any.
 * @param {{ now?: Date }} [opts]   Injected clock so the result is deterministic.
 */
function runVerificationGate(property, enrichment = null, { now = new Date() } = {}) {
    const fields = gateVerifiedFields(property || {});

    const verified = {};
    const blockedFields = [];
    Object.values(fields).forEach((f) => {
        if (f.bin === GATE_BINS.VERIFIED) verified[f.key] = f.value;
        else blockedFields.push({ key: f.key, label: f.label, reason: f.reason, requiredForBrief: f.requiredForBrief });
    });

    const valueGap = computeValueGap({
        viharaEstimate: verified.viharaEstimate ?? null,
        startBid: verified.startBid ?? null,
    });

    const research = gateResearch(enrichment);

    const auctionEnd = verified.auctionEndDate || null;
    const readiness = {
        photos: Array.isArray(verified.photos) && verified.photos.length > 0,
        valueGap: valueGap.bin === GATE_BINS.VERIFIED,
        auctionDate: Boolean(auctionEnd && auctionEnd.getTime() >= now.getTime()),
    };

    return {
        evaluatedAt: now,
        fields,
        verified,
        researched: research.researched,
        blocked: { fields: blockedFields, research: research.blocked },
        valueGap,
        readiness,
        missingRequired: blockedFields.filter((f) => f.requiredForBrief).map((f) => f.label),
        flags: {
            buyerType: property?.buyerType || null,
            financingTermsConfirmed: property?.financingTermsConfirmed === true,
        },
    };
}

module.exports = {
    runVerificationGate,
    computeValueGap,
    getPath,
};
