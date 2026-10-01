// services/buyerMatch/scoring.js
//
// Scores ONE lead against ONE property. Pure functions, no DB.
//
// How a score is built:
//   1. Hard filters — a pair that can never work is dropped (wrong market,
//      price far past budget, lead gave us nothing to match on).
//   2. Each factor returns 0..1 plus a short human reason, or null when the
//      lead didn't answer that question.
//   3. score = weighted average of the factors we DO know (0–100), so a
//      missing answer never drags a lead down.
//   4. confidence = share of total weight we had data for. Ranking uses
//      score shrunk slightly by low confidence, so a 90 built on one answer
//      sits below a 90 built on five.
//   5. Each reason lands in `reasons` (why it fits) or, when the factor flags
//      it `bad`, in `concerns` (what to check before calling).

const { REGIONS } = require("./geo");

const WEIGHTS = {
  location: 35,
  budget: 25,
  buyerFit: 15,
  beds: 10,
  timing: 10,
  engagement: 5,
};
const TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

// Price may run this far past the lead's max before the pair is dropped.
const BUDGET_STRETCH = 0.3;

const DAY = 24 * 60 * 60 * 1000;
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const pct = (n) => `${Math.round(n * 100)}%`;
const money = (n) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M` : `$${Math.round(n / 1e3)}K`;

// ─── Factors ───────────────────────────────────────────────────────────────

/** Best of the lead's location targets against the property's location. */
function locationFactor(lead, prop) {
  if (!lead.locations.length) return null;
  let best = { s: 0, reason: null };
  const consider = (s, reason, bad = false) => {
    if (s > best.s) best = { s, reason, bad };
  };

  for (const t of lead.locations) {
    if (t.kind === "nationwide") {
      consider(0.55, "Buys nationwide");
    } else if (t.kind === "state" && t.state === prop.state) {
      consider(0.65, `Wants ${prop.state}`);
    } else if (t.kind === "region" && t.state === prop.state) {
      // prop.regions comes from its county and/or ZIP (see geo.regionsForProperty).
      if (prop.regions?.has(t.region)) {
        consider(0.9, `In their area (${REGIONS[t.region].label})`);
      }
    } else if (t.kind === "zip" && t.zip === String(prop.zipCode || "").slice(0, 5)) {
      consider(1, `Same ZIP (${t.zip})`);
    } else if (t.kind === "county" && t.county === prop.countyKey && (!t.state || t.state === prop.state)) {
      consider(0.85, `Same county (${cap(t.county)})`);
    } else if (t.kind === "city" && t.city === prop.cityKey && (!t.state || t.state === prop.state)) {
      consider(1, `Same city (${prop.city})`);
    } else if (t.kind === "city" && t.state && t.state === prop.state) {
      // Wants another city in the same state — a weak but real signal.
      consider(0.4, `Wants ${cap(t.city)}, not ${prop.city}`, true);
    }
  }
  return best;
}

function budgetFactor(lead, prop) {
  const b = lead.budget;
  if (!b || !prop.price) return null;
  const p = prop.price;

  if (b.max && p > b.max) {
    const over = (p - b.max) / b.max;
    if (over > BUDGET_STRETCH) return { s: 0, reason: null, exclude: true };
    return { s: clamp01(1 - over / BUDGET_STRETCH) * 0.7, reason: `${pct(over)} over budget`, bad: true };
  }
  if (b.min && p < b.min) {
    // Cheaper than they usually buy — less of a problem than too expensive.
    const under = (b.min - p) / b.min;
    return { s: Math.max(0.35, 1 - under), reason: "Below their usual deal size", bad: true };
  }
  return { s: 1, reason: `${money(p)} fits budget` };
}

/** Does this kind of buyer want this kind of property? */
function buyerFitFactor(lead, prop) {
  const type = lead.buyerType;
  if (!type) return null;
  const isLand = prop.propertyType === "Land";
  const distressed = prop.assetType === "Foreclosure Homes" || prop.assetType === "Reo Bank Owned";
  const d = prop.discount;

  if (type === "flipper") {
    if (isLand) return { s: 0.2, reason: null };
    if (d != null) {
      const s = clamp01(0.3 + d * 2.3); // 30% below value → full marks
      return { s, reason: d > 0.05 ? `Flipper · ${pct(d)} below value` : null };
    }
    let s = distressed ? 0.75 : 0.5;
    if (prop.occupancyStatus === "Vacant") s += 0.1;
    return { s, reason: distressed ? `Flipper · ${prop.assetType}` : null };
  }

  if (type === "investor") {
    if (isLand) return { s: 0.3, reason: null };
    let s;
    let reason = null;
    if (prop.rentYield != null) {
      s = clamp01((prop.rentYield - 0.03) / 0.07); // 10% gross yield → full marks
      if (prop.rentYield >= 0.06) reason = `${pct(prop.rentYield)} rent yield`;
    } else if (d != null) {
      s = clamp01(0.5 + d * 1.5);
      if (d > 0.05) reason = `${pct(d)} below value`;
    } else {
      s = distressed ? 0.65 : 0.55;
    }
    if (prop.propertyType === "Multi-family") {
      s = clamp01(s + 0.15);
      reason = reason ? `${reason} · multi-family` : "Multi-family income";
    }
    return { s, reason };
  }

  if (type === "owner") {
    const byType = {
      "Single Family": 1,
      "Condo, Townhouse, other single unit": 0.85,
      "Multi-family": 0.6,
      Land: 0.1,
    };
    let s = byType[prop.propertyType] ?? 0.6;
    if (prop.occupancyStatus === "Occupied") s *= 0.5;
    if (prop.occupancyStatus === "Occupied") return { s, reason: "Occupied — can't move in soon", bad: true };
    return { s, reason: s >= 0.8 ? "Good home to live in" : null };
  }

  // Agents / funds / explorers buy (or bring buyers for) anything.
  return { s: type === "agent" ? 0.65 : 0.5, reason: null };
}

function bedsFactor(lead, prop) {
  // Uploaded sheets often have no bed count — unknown, so skip the factor.
  if (!lead.minBeds || prop.beds == null || prop.propertyType === "Land") return null;
  const gap = lead.minBeds - prop.beds;
  if (gap <= 0) return { s: 1, reason: `${prop.beds} beds (wants ${lead.minBeds}+)` };
  if (gap === 1) return { s: 0.45, reason: "1 bed short", bad: true };
  return { s: 0.1, reason: null };
}

/** Lead's urgency vs how soon this auction happens. */
function timingFactor(lead, prop, now) {
  if (!lead.timing) return null;
  if (lead.timing === "browsing") return { s: 0.4, reason: null };

  const start = prop.auctionStartDate ? new Date(prop.auctionStartDate).getTime() : null;
  if (!start) return { s: 0.6, reason: null };
  const days = Math.max(0, (start - now) / DAY);

  const table = {
    now:   days <= 30 ? 1 : days <= 90 ? 0.75 : 0.5,
    soon:  days <= 120 ? (days < 20 ? 0.75 : 1) : 0.6,
    later: days >= 60 ? 1 : 0.6,
  };
  const s = table[lead.timing] ?? 0.6;
  const when = days < 1 ? "live now" : `in ${Math.round(days)} days`;
  return { s, reason: s >= 0.9 ? `Ready to buy · auction ${when}` : null };
}

/** How reachable / warm the lead is. Always known. */
function engagementFactor(lead, prop, now) {
  const auctionReg = (lead.auctionRegistrations || []).find((r) => r.propertyId === prop.id);
  if (auctionReg) {
    return { s: 1, reason: `Registered for this auction (${auctionReg.status})` };
  }
  if (prop.slug && lead.registeredSlugs.includes(prop.slug)) {
    return { s: 1, reason: "Signed up on this property's page" };
  }
  const e = lead.engagement;
  let s = 0.3;
  let reason = null;
  if (e.connected) {
    s += 0.4;
    reason = "Answered our call";
  }
  if (e.smsConsent) s += 0.1;
  if (lead.emails?.opened) {
    s += 0.1;
    reason = reason || "Opens our emails";
  }
  const ageDays = lead.createdAt ? (now - new Date(lead.createdAt).getTime()) / DAY : Infinity;
  if (ageDays <= 30) {
    s += 0.2;
    reason = reason || "Signed up recently";
  } else if (ageDays <= 90) {
    s += 0.1;
  }
  if (e.callingStopped) {
    return { s: clamp01(s - 0.3), reason: "Calls stopped by admin", bad: true };
  }
  return { s: clamp01(s), reason };
}

const FACTORS = {
  location: locationFactor,
  budget: budgetFactor,
  buyerFit: buyerFitFactor,
  beds: bedsFactor,
  timing: timingFactor,
  engagement: engagementFactor,
};

// ─── Public ────────────────────────────────────────────────────────────────

/**
 * A lead is matchable only if it tells us WHERE or HOW MUCH. Without either,
 * it would "match" every property equally, which is noise, not a match.
 */
const isMatchable = (lead) => lead.locations.length > 0 || !!lead.budget;

/**
 * Score one pair. Returns null when a hard filter drops it, else
 *   { score, confidence, rank, reasons[], concerns[], breakdown{} }
 */
function scorePair(lead, prop, now = Date.now()) {
  let known = 0;
  let sum = 0;
  const reasons = [];
  const concerns = [];
  const breakdown = {};

  for (const [name, fn] of Object.entries(FACTORS)) {
    const r = fn(lead, prop, now);
    if (!r) continue;
    if (r.exclude) return null;
    // A lead that named markets but none of them contain this property.
    if (name === "location" && r.s === 0) return null;

    known += WEIGHTS[name];
    sum += WEIGHTS[name] * r.s;
    breakdown[name] = Math.round(r.s * 100);
    if (r.reason) (r.bad || r.s < 0.4 ? concerns : reasons).push(r.reason);
  }

  const score = Math.round((sum / known) * 100);
  const confidence = known / TOTAL_WEIGHT;
  return {
    score,
    confidence: Math.round(confidence * 100) / 100,
    confidenceLabel: confidence >= 0.75 ? "high" : confidence >= 0.5 ? "medium" : "low",
    rank: score * (0.7 + 0.3 * confidence),
    reasons,
    concerns,
    breakdown,
  };
}

const cap = (s) => String(s).replace(/\b\w/g, (c) => c.toUpperCase());

module.exports = { WEIGHTS, isMatchable, scorePair };
