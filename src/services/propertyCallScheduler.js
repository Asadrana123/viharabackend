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
//   Daily 11:00 AM / 2:30 PM / 6:00 PM in the lead's timezone (per-minute sweep):
//     2-in-60s burst again; picked up = STOP, no pickup = next slot.
//
// The prompt is generated per property (not authored), so a new property needs
// NO new scheduler, model, or prompt file — uploading it and flagging
// isLandingPage is enough.

const cron = require("node-cron");
const { DateTime } = require("luxon");
const productModel = require("../model/productModel");
const PropertyLead = require("../model/propertyLeadModel");
const { buildPropertyVoicePrompt } = require("./propertyVoicePromptBuilder");
const { resolvePropertyTimezone } = require("../utils/resolveTimezone");
const { DID_NOT_CONNECT_REASONS, WAIT_MS } = require("./registrationCallService");
const { enqueueBurst, PRIORITY } = require("./callDispatchQueue");

// Three daily follow-up slots in the lead's local timezone (24h clock).
const CALL_SLOTS = [
  { hour: 11, minute: 0 }, // 11:00 AM
  { hour: 14, minute: 30 }, // 2:30 PM
  { hour: 18, minute: 0 }, // 6:00 PM
];
const DEFAULT_TZ = "America/New_York"; // last-resort fallback when a lead has no/invalid tz and no property tz
const SWEEP_BATCH = 200; // max leads evaluated per minute

const BURST_OPTS = {
  noPickupReasons: DID_NOT_CONNECT_REASONS,
  treatErrorsAsNoPickup: true,
};

// Short-lived cache of { product, promptConfig } keyed by slug. Rebuilt on each
// process; refreshed lazily so an edited property is picked up within TTL.
const PROMPT_TTL_MS = 5 * 60 * 1000;
const promptCache = new Map(); // slug → { at, product, promptConfig }

async function loadPropertyBundle(slug) {
  const cached = promptCache.get(slug);
  if (cached && Date.now() - cached.at < PROMPT_TTL_MS) return cached;

  const product = await productModel.findOne({ slug }).lean();
  if (!product) {
    const bundle = { at: Date.now(), product: null, promptConfig: null };
    promptCache.set(slug, bundle);
    return bundle;
  }

  const others = await productModel
    .find({ isLandingPage: true, slug: { $ne: slug }, status: "active" })
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

/**
 * Next daily call slot in the lead's timezone, as a UTC Date. DST-correct.
 * Falls back to the property timezone, then DEFAULT_TZ.
 */
function nextDailyCallAt(timezone, fallbackTz) {
  const zone = timezone || fallbackTz || DEFAULT_TZ;
  let now = DateTime.now().setZone(zone);
  if (!now.isValid) now = DateTime.now().setZone(fallbackTz || DEFAULT_TZ);

  for (const slot of CALL_SLOTS) {
    const target = now.set({ hour: slot.hour, minute: slot.minute, second: 0, millisecond: 0 });
    if (target > now) return target.toUTC().toJSDate();
  }
  const first = CALL_SLOTS[0];
  const tomorrow = now
    .plus({ days: 1 })
    .set({ hour: first.hour, minute: first.minute, second: 0, millisecond: 0 });
  return tomorrow.toUTC().toJSDate();
}

/** Payload the dispatcher expects (canonical phone + this property's prompt). */
function callPayload(lead, promptConfig) {
  return {
    leadId: lead._id,
    fullName: lead.fullName,
    email: lead.email,
    phone: lead.phoneNormalized || lead.phone,
    buyerType: lead.buyerType,
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
      { $set: { callStatus: "no-answer", nextCallAt: nextDailyCallAt(lead.timezone, fallbackTz) } }
    );
  }
}

/**
 * SIGNUP call — fired fire-and-forget from the controller after a lead registers
 * with consent. Builds this property's prompt, runs the burst (60s initial wait),
 * then stops or schedules the first daily callback.
 *
 * @param {object} lead { leadId, propertySlug, fullName, email, phone, phoneNormalized, timezone, buyerType }
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

      // Same number + same property: only the first fires this sweep; push the
      // rest to the next slot so they don't pile up.
      if (num && dialed.has(key)) {
        await PropertyLead.updateOne(
          { _id: lead._id, callStatus: "no-answer" },
          { $set: { nextCallAt: nextDailyCallAt(lead.timezone) } }
        );
        continue;
      }
      if (num) dialed.add(key);

      // Resolve this property's prompt (cached for the whole sweep).
      let bundle = bundleBySlug.get(slug);
      if (!bundle) {
        bundle = await loadPropertyBundle(slug);
        bundleBySlug.set(slug, bundle);
      }
      if (!bundle.promptConfig) {
        console.error(`[property-call] sweep: no property/prompt for slug=${slug} — skipping lead ${lead._id}`);
        continue;
      }
      const fallbackTz = resolvePropertyTimezone(bundle.product);

      // Atomic claim: advance nextCallAt + stamp lastCallAt so an overlapping
      // tick can't re-dial the lead today.
      const claimed = await PropertyLead.findOneAndUpdate(
        { _id: lead._id, callStatus: "no-answer", nextCallAt: { $lte: now } },
        {
          $set: { nextCallAt: nextDailyCallAt(lead.timezone, fallbackTz), lastCallAt: now },
          $inc: { callAttempts: 1 },
        },
        { new: true }
      ).lean();

      if (!claimed) continue; // another worker claimed it first

      enqueueBurst(
        { ...callPayload(claimed, bundle.promptConfig), isFollowUp: true },
        BURST_OPTS,
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
  console.log("[property-call] scheduler started — daily 11:00 AM / 2:30 PM / 6:00 PM local callbacks (per-minute sweep, all properties).");
  return task;
}

module.exports = {
  scheduleSignupCall,
  startPropertyCallScheduler,
  nextDailyCallAt,
};
