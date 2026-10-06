// services/propertyCallScheduler.js
//
// ONE call scheduler for EVERY property auction landing page — replaces the
// per-property schedulers (georgiaStCallScheduler, rensselaerAveCallScheduler, …).
// It sweeps the single propertyLeadModel collection, and for each due lead it
// builds that property's prompt on the fly from the DB (via
// propertyVoicePromptBuilder) and hands the burst to the shared callDispatchQueue.
//
// Behaviour is identical to the old per-property schedulers:
//   Signup (with consent): 2-in-60s burst → picked up = "connected" (STOP),
//     no pickup = "no-answer" + next daily slot.
//   Then ONE call a day for 7 days (followUpCadence.js), rotating 11:00 AM /
//     2:30 PM / 6:00 PM local; picked up = STOP, after day 7 = "not-reached".
//
// The prompt is generated per property (not authored), so a new property needs
// NO new scheduler, model, or prompt file — uploading it and flagging
// isLandingPage is enough.

const cron = require("node-cron");
const productModel = require("../../model/property/productModel");
const PropertyLead = require("../../model/leads/propertyLeadModel");
const { buildPropertyVoicePrompt } = require("./propertyVoicePromptBuilder");
const { resolvePropertyTimezone } = require("../../utils/resolveTimezone");
const { DID_NOT_CONNECT_REASONS, WAIT_MS } = require("./registrationCallService");
const { enqueueBurst, PRIORITY } = require("./callDispatchQueue");
const { FOLLOW_UP_DAYS, FOLLOW_UP_CALL_OPTS, nextFollowUpAt, noAnswerUpdate, skipUpdate } = require("./followUpCadence");
// Spoken currency for the AI call ({{prospect_quote}} in the prompt).
const { dollarsToWords } = require("./vapiPropertyService");

const SWEEP_BATCH = 200; // max leads evaluated per minute

const BURST_OPTS = {
  noPickupReasons: DID_NOT_CONNECT_REASONS,
  treatErrorsAsNoPickup: true,
};

// Short-lived cache of { product, promptConfig } keyed by slug. Rebuilt on each
// process; refreshed lazily so an edited property is picked up within TTL.
const PROMPT_TTL_MS = 5 * 60 * 1000;
const promptCache = new Map(); // slug → { at, product, promptConfig }

// The old per-property pages stamped short slugs that aren't the product's real
// slug ("449-georgia-st" vs "449-georgia-st-big-bear-lake"); Rensselaer's even
// has the wrong house number.
const LEGACY_SLUG_ALIASES = { "449-rensselaer-ave": "401-rensselaer-ave" };
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function findProductBySlug(slug) {
  const exact = await productModel.findOne({ slug }).lean();
  if (exact) return exact;
  const short = LEGACY_SLUG_ALIASES[slug] || slug;
  const hits = await productModel.find({ slug: new RegExp(`^${escapeRegex(short)}-`) }).limit(2).lean();
  return hits.length === 1 ? hits[0] : null;
}

/**
 * The property + its call script, BUILT FROM THE LIVE LISTING (price, auction
 * dates, financing…) — never a hard-coded prompt, because those facts change.
 * Cached for PROMPT_TTL_MS so a sweep doesn't rebuild per lead; an edited
 * listing is picked up within that window. Shared by every property call path
 * (signup, daily follow-up, callbacks, the legacy Georgia St / Rensselaer pages).
 */
async function loadPropertyBundle(slug) {
  const cached = promptCache.get(slug);
  if (cached && Date.now() - cached.at < PROMPT_TTL_MS) return cached;

  const product = await findProductBySlug(slug);
  if (!product) {
    const bundle = { at: Date.now(), product: null, promptConfig: null };
    promptCache.set(slug, bundle);
    return bundle;
  }

  const others = await productModel
    .find({ isLandingPage: true, slug: { $ne: product.slug }, status: "active" })
    .select(
      "productName street city county state zipCode beds baths squareFootage lotSize yearBuilt monthlyHOADues occupancyStatus propertyType startBid investmentData auctionStartDate auctionEndDate"
    )
    .limit(3)
    .lean();

  const promptConfig = buildPropertyVoicePrompt(product, others);
  const bundle = { at: Date.now(), product, promptConfig };
  promptCache.set(slug, bundle);
  return bundle;
}

/** Payload the dispatcher expects (canonical phone + this property's prompt). */
function callPayload(lead, promptConfig) {
  return {
    leadId: lead._id,
    fullName: lead.fullName,
    email: lead.email,
    phone: lead.phoneNormalized || lead.phone,
    timezone: lead.timezone || "", // caller's tz: Maya's clock + callback times
    buyerType: lead.buyerType,
    // Buyer's price quote, spelled out for TTS ("" when the lead did not quote).
    quote: dollarsToWords(lead.quotePrice),
    promptConfig, // { systemPrompt, firstMessage, voicemailMessage, endCallMessage }
    source: `auction-${lead.propertySlug}`,
  };
}

/**
 * Persist a burst outcome.
 *   connected → stop this lead (and same-number siblings on the SAME property).
 *   no pickup → schedule the next daily slot.
 */
async function applyOutcome(lead, connected, fallbackTz) {
  if (connected) {
    await PropertyLead.updateOne(
      { _id: lead._id },
      { $set: { callStatus: "connected", nextCallAt: null } }
    );
    if (lead.phoneNormalized && lead.propertySlug) {
      await PropertyLead.updateMany(
        {
          propertySlug: lead.propertySlug,
          phoneNormalized: lead.phoneNormalized,
          callStatus: "no-answer",
          _id: { $ne: lead._id },
        },
        { $set: { callStatus: "connected", nextCallAt: null } }
      );
    }
  } else {
    await PropertyLead.updateOne(
      { _id: lead._id },
      { $set: noAnswerUpdate(lead, fallbackTz) }
    );
  }
}

/**
 * SIGNUP call — fired fire-and-forget from the controller after a lead registers
 * with consent. Builds this property's prompt, runs the burst (60s initial wait),
 * then stops or schedules the first daily callback.
 *
 * @param {object} lead { leadId, propertySlug, fullName, email, phone, phoneNormalized, timezone, buyerType, quotePrice }
 */
async function scheduleSignupCall(lead = {}) {
  if (!lead || !lead.leadId || !lead.propertySlug) return;

  const { product, promptConfig } = await loadPropertyBundle(lead.propertySlug);
  if (!promptConfig) {
    console.error(`[property-call] no property/prompt for slug=${lead.propertySlug} — skipping signup call`);
    return;
  }
  const fallbackTz = resolvePropertyTimezone(product);

  await PropertyLead.updateOne(
    { _id: lead.leadId },
    { $set: { lastCallAt: new Date() }, $inc: { callAttempts: 1 } }
  );

  const { connected } = await enqueueBurst(
    callPayload({ _id: lead.leadId, ...lead }, promptConfig),
    { initialDelayMs: WAIT_MS, ...BURST_OPTS },
    PRIORITY.SIGNUP
  );

  await applyOutcome(
    {
      _id: lead.leadId,
      phoneNormalized: lead.phoneNormalized,
      propertySlug: lead.propertySlug,
      timezone: lead.timezone,
    },
    connected,
    fallbackTz
  );
}

// ─── Daily sweep ──────────────────────────────────────────────────────────────
let sweeping = false;

async function sweepDueCalls() {
  if (sweeping) return;
  sweeping = true;
  try {
    const now = new Date();
    const due = await PropertyLead.find({
      callStatus: "no-answer",
      nextCallAt: { $ne: null, $lte: now },
      callingStopped: { $ne: true },
      isQaTest: { $ne: true }, // QA agent test leads are never dialed
    })
      .sort({ nextCallAt: 1 })
      .limit(SWEEP_BATCH)
      .lean();

    if (due.length === 0) return;

    const dialed = new Set(); // per-sweep same-(property,number) dedup
    const bundleBySlug = new Map(); // build each property's prompt once per sweep

    for (const lead of due) {
      const slug = lead.propertySlug || "";
      const num = lead.phoneNormalized || "";
      const key = `${slug}|${num}`;

      // Resolve this property's prompt (cached for the whole sweep).
      let bundle = bundleBySlug.get(slug);
      if (!bundle) {
        bundle = await loadPropertyBundle(slug);
        bundleBySlug.set(slug, bundle);
      }
      const fallbackTz = resolvePropertyTimezone(bundle.product || {});

      // 7-day window over / already called today → no dial, just reschedule.
      const skip = skipUpdate(lead, fallbackTz, now);
      if (skip) {
        await PropertyLead.updateOne({ _id: lead._id, callStatus: "no-answer" }, { $set: skip });
        continue;
      }

      // Same number + same property: only the first fires this sweep; push the
      // rest to the next day so they don't pile up.
      if (num && dialed.has(key)) {
        await PropertyLead.updateOne(
          { _id: lead._id, callStatus: "no-answer" },
          { $set: noAnswerUpdate(lead, fallbackTz) }
        );
        continue;
      }
      if (num) dialed.add(key);

      if (!bundle.promptConfig) {
        console.error(`[property-call] sweep: no property/prompt for slug=${slug} — skipping lead ${lead._id}`);
        continue;
      }

      // Atomic claim: advance nextCallAt + stamp lastCallAt so an overlapping
      // tick can't re-dial the lead today.
      const claimed = await PropertyLead.findOneAndUpdate(
        { _id: lead._id, callStatus: "no-answer", nextCallAt: { $lte: now } },
        {
          $set: { nextCallAt: nextFollowUpAt(lead, fallbackTz, now), lastCallAt: now },
          $inc: { callAttempts: 1 },
        },
        { new: true }
      ).lean();

      if (!claimed) continue; // another worker claimed it first

      enqueueBurst(
        { ...callPayload(claimed, bundle.promptConfig), isFollowUp: true },
        { ...BURST_OPTS, ...FOLLOW_UP_CALL_OPTS },
        PRIORITY.SCHEDULED
      )
        .then(({ connected }) => applyOutcome(claimed, connected, fallbackTz))
        .catch((e) => console.error("[property-call] burst failed:", e.message));
    }
  } catch (e) {
    console.error("[property-call] sweep error:", e.message);
  } finally {
    sweeping = false;
  }
}

let task = null;

/** Start the every-minute daily-callback sweep. Call once, after the server boots. */
function startPropertyCallScheduler() {
  if (task) return task;
  task = cron.schedule("* * * * *", sweepDueCalls);
  console.log(`[property-call] scheduler started — one follow-up call a day for ${FOLLOW_UP_DAYS} days, rotating 11:00 AM / 2:30 PM / 6:00 PM local (per-minute sweep, all properties).`);
  return task;
}

module.exports = {
  scheduleSignupCall,
  loadPropertyBundle,
  startPropertyCallScheduler,
};
