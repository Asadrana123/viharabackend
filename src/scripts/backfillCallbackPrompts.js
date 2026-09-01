// scripts/backfillCallbackPrompts.js
//
// ONE-TIME backfill. Heals callbacks that were booked BEFORE the funnel-prompt
// fix — the ones saved with an empty promptConfig and a generic source
// ("vihara-voice"), which would otherwise dial with the VAPI dashboard-default
// (Kingwood) script.
//
// It can't read the funnel off those callbacks (the tag was never captured), so
// it recovers the funnel from the caller's PHONE by looking them up across the
// lead collections, resolves the correct prompt, and writes it into the callback
// so the scheduler dials with the right script.
//
//   property lead  → rebuild that property's prompt from its slug (same as the
//                    live call, via propertyVoicePromptBuilder)
//   nor-cal lead   → norCalVoicePrompt
//   early-access   → earlyAccessVoicePrompt
//   partner lead   → partnerProgramVoicePrompt
//
// If a phone is in more than one funnel, the MOST RECENT lead wins. Callbacks it
// can't identify are left untouched and listed at the end.
//
// Runtime code is NOT changed — this only fixes already-stored data.
//
// HOW TO RUN (from the backend root, where model/ services/ config/ live):
//   node scripts/backfillCallbackPrompts.js          # apply
//   DRY=1 node scripts/backfillCallbackPrompts.js     # preview only, no writes
//
// If this file sits in a scripts/ subfolder, the ../ paths below are correct.
// If you drop it in the backend ROOT instead, change every "../" to "./".

try { require("dotenv").config(); } catch (_e) { /* dotenv optional */ }

const mongoose = require("mongoose");

const CallbackRequest = require("../model/callbackRequestModel");
const productModel = require("../model/productModel");

// Lead models — same paths the schedulers use.
const NorCalLead = require("../model/norCalLeadModel");
const EarlyAccessLead = require("../model/earlyAccessLeadModel");
const PartnerLead = require("../model/partnerLeadModel");
const PropertyLead = require("../model/propertyLeadModel");

// Legacy single-property funnels: their own collections + their own prompt files.
const GeorgiaStLead = require("../model/georgiaStLeadModel");
const RensselaerAveLead = require("../model/rensselaerAveLeadModel");

// Prompt sources.
const { buildPropertyVoicePrompt } = require("../services/propertyVoicePromptBuilder");
const norCalVoicePrompt = require("../config/norCalVoicePrompt");
const earlyAccessVoicePrompt = require("../config/earlyAccessVoicePrompt");
const partnerProgramVoicePrompt = require("../config/partnerProgramVoicePrompt");

// Legacy dedicated prompts — required defensively so a wrong filename reports
// (instead of crashing the whole backfill). If either logs a warning, tell me
// the correct filename and I'll swap it.
function safeRequire(path) {
  try { return require(path); } catch (e) {
    console.warn(`[backfill] WARN: could not load ${path} — ${e.message}`);
    return null;
  }
}
const georgiaStVoicePrompt = safeRequire("../config/georgiaStVoicePrompt");
const rensselaerAveVoicePrompt = safeRequire("../config/rensselaerAveVoicePrompt");

// Legacy slug → dedicated prompt (these do NOT rebuild from the DB — they have
// curated prompt files). Slugs come from the legacy lead models' propertySlug.
const LEGACY_SLUG_PROMPTS = {
  "449-georgia-st": georgiaStVoicePrompt,
  "449-rensselaer-ave": rensselaerAveVoicePrompt,
};

const DRY = process.env.DRY === "1" || process.env.DRY_RUN === "1";

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.DB_URI ||
  process.env.DATABASE_URL ||
  "";

// Normalize a prompt object down to the four fields we store on a callback.
function toPromptConfig(p) {
  if (!p || !p.systemPrompt) return null;
  return {
    systemPrompt: p.systemPrompt,
    firstMessage: p.firstMessage || "",
    voicemailMessage: p.voicemailMessage || "",
    endCallMessage: p.endCallMessage || "",
  };
}

// Match a callback phone against a lead collection (phoneNormalized OR phone),
// newest first. Returns the lead doc or null.
async function newestLead(Model, phone) {
  if (!phone) return null;
  return Model.findOne({ $or: [{ phoneNormalized: phone }, { phone }] })
    .sort({ createdAt: -1 })
    .lean();
}

// Build a property's prompt from its slug. Legacy single-property funnels use
// their dedicated prompt file; everything else rebuilds from the DB — same
// context the scheduler passes.
async function buildPromptForSlug(slug) {
  if (!slug) return null;

  // Legacy funnels (Georgia St / Rensselaer Ave) → curated prompt file.
  if (Object.prototype.hasOwnProperty.call(LEGACY_SLUG_PROMPTS, slug)) {
    return toPromptConfig(LEGACY_SLUG_PROMPTS[slug]);
  }

  const product = await productModel.findOne({ slug }).lean();
  if (!product) return null;
  const others = await productModel
    .find({ isLandingPage: true, slug: { $ne: slug }, status: "active" })
    .select(
      "productName street city county state zipCode beds baths squareFootage lotSize yearBuilt monthlyHOADues occupancyStatus propertyType startBid investmentData auctionStartDate auctionEndDate"
    )
    .limit(3)
    .lean();
  return toPromptConfig(buildPropertyVoicePrompt(product, others));
}

/**
 * Decide the funnel for one phone by finding the MOST RECENT matching lead across
 * every collection, then resolve that funnel's prompt.
 * Returns { promptConfig, funnel } or { promptConfig: null, funnel: null }.
 */
async function resolveByPhone(phone) {
  const [prop, norcal, ea, partner, georgia, rensselaer] = await Promise.all([
    newestLead(PropertyLead, phone),
    newestLead(NorCalLead, phone),
    newestLead(EarlyAccessLead, phone),
    newestLead(PartnerLead, phone),
    newestLead(GeorgiaStLead, phone),
    newestLead(RensselaerAveLead, phone),
  ]);

  const candidates = [
    prop && { at: prop.createdAt, funnel: `auction-${prop.propertySlug}`, kind: "property", slug: prop.propertySlug },
    georgia && { at: georgia.createdAt, funnel: `auction-${georgia.propertySlug}`, kind: "property", slug: georgia.propertySlug },
    rensselaer && { at: rensselaer.createdAt, funnel: `auction-${rensselaer.propertySlug}`, kind: "property", slug: rensselaer.propertySlug },
    norcal && { at: norcal.createdAt, funnel: "nor-cal", kind: "static", prompt: norCalVoicePrompt },
    ea && { at: ea.createdAt, funnel: "early-access", kind: "static", prompt: earlyAccessVoicePrompt },
    partner && { at: partner.createdAt, funnel: "partner-program", kind: "static", prompt: partnerProgramVoicePrompt },
  ].filter(Boolean);

  if (candidates.length === 0) return { promptConfig: null, funnel: null };

  // Most recent lead wins.
  candidates.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
  const winner = candidates[0];

  const promptConfig =
    winner.kind === "property"
      ? await buildPromptForSlug(winner.slug)
      : toPromptConfig(winner.prompt);

  return { promptConfig, funnel: winner.funnel };
}

async function main() {
  if (!MONGO_URI) {
    console.error(
      "✗ No Mongo connection string found. Set MONGO_URI (or MONGODB_URI / DB_URI / DATABASE_URL) and re-run."
    );
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log(`[backfill] connected${DRY ? " (DRY RUN — no writes)" : ""}`);

  // Pending callbacks with an empty/missing prompt — the broken ones.
  const broken = await CallbackRequest.find({
    status: "pending",
    $or: [
      { "promptConfig.systemPrompt": { $in: [null, ""] } },
      { promptConfig: { $exists: false } },
      { promptConfig: null },
    ],
  }).lean();

  console.log(`[backfill] found ${broken.length} pending callback(s) with no prompt`);

  let healed = 0;
  const unresolved = [];

  for (const cb of broken) {
    let promptConfig = null;
    let funnel = null;

    // 1) If it somehow has an auction-<slug> source, use it directly.
    const src = String(cb.source || "").trim();
    if (src.startsWith("auction-")) {
      const slug = src.slice("auction-".length).trim();
      promptConfig = await buildPromptForSlug(slug);
      funnel = src;
    } else if (src === "nor-cal") {
      promptConfig = toPromptConfig(norCalVoicePrompt); funnel = src;
    } else if (src === "early-access") {
      promptConfig = toPromptConfig(earlyAccessVoicePrompt); funnel = src;
    } else if (src === "partner-program") {
      promptConfig = toPromptConfig(partnerProgramVoicePrompt); funnel = src;
    }

    // 2) Generic/legacy source ("vihara-voice", etc.) → recover from the phone.
    if (!promptConfig) {
      ({ promptConfig, funnel } = await resolveByPhone(cb.phone));
    }

    if (!promptConfig) {
      unresolved.push({ id: String(cb._id), phone: cb.phone, name: cb.fullName, source: cb.source });
      continue;
    }

    console.log(
      `  • ${cb.phone} (${cb.fullName || "no name"}) → ${funnel}${DRY ? "  [dry]" : ""}`
    );

    if (!DRY) {
      await CallbackRequest.updateOne(
        { _id: cb._id },
        { $set: { promptConfig, source: funnel } } // stamp the recovered funnel too
      );
    }
    healed += 1;
  }

  console.log(
    `\n[backfill] ${DRY ? "would heal" : "healed"} ${healed}/${broken.length} callback(s)`
  );

  if (unresolved.length) {
    console.log(
      `\n[backfill] ${unresolved.length} could NOT be identified (no lead found for their phone). ` +
        `Review these — cancel them if they're stale:`
    );
    for (const u of unresolved) {
      console.log(`   - ${u.id}  ${u.phone}  ${u.name || ""}  src=${u.source || ""}`);
    }
  }

  await mongoose.disconnect();
  console.log("\n[backfill] done.");
}

main().catch(async (err) => {
  console.error("[backfill] FAILED:", err);
  try { await mongoose.disconnect(); } catch (_e) {}
  process.exit(1);
});
