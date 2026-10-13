// services/buyerMatch/matchCallService.js
//
// Buyer Match calling: an admin presses "Start calls" on a buyer + property and
// Maya calls that buyer about that property twice a day, at times people are
// usually free in THEIR timezone, until they pick up.
//
//   Schedule   12:30 PM and 6:00 PM local, every day (weekends too), for up to
//              MAX_DAYS. The first call goes out right away if it's between
//              9 AM and 8 PM for the buyer, otherwise at the next slot.
//   One call   per slot (not a 2-call burst). Only the first unanswered call
//              leaves a voicemail.
//   Stops when they pick up · the property closes · MAX_DAYS pass · an admin
//              presses Stop · another Buyer Match schedule replaces it.
//   Takeover   One schedule per phone number. If the person is already in a
//              sign-up follow-up loop (or another Buyer Match schedule), the
//              admin can take over: that loop is paused until this one ends —
//              stopped for good if they picked up, resumed otherwise.
//   Limits     Every call goes through the shared dispatch queue and caller-
//              number pool. If every number has hit its daily cap, the call
//              moves to the next day.
//   Enrichment Never fetched here — only what the lead's registration saved.

const cron = require("node-cron");
const axios = require("axios");
const { DateTime } = require("luxon");

const MatchCallCampaign = require("../../model/calling/matchCallCampaignModel");
const CallbackRequest = require("../../model/calling/callbackRequestModel");
const CallLog = require("../../model/calling/callLogModel");
const Product = require("../../model/property/productModel");
const { SOURCES } = require("./profiles");
const { getMatchContext } = require("./buyerMatchService");
const { buildMatchCallPrompt } = require("./matchCallPrompt");
const { dispatchCall } = require("../calling/vapiService");
const { resolveProperty } = require("../calling/vapiPropertyService");
const { normalisePhone, mapCallLog } = require("../calling/vapiCallsService");
const { pollCallOutcome, DID_NOT_CONNECT_REASONS } = require("../calling/registrationCallService");
const { enqueueJob, PRIORITY } = require("../calling/callDispatchQueue");
const { getUsageToday } = require("../calling/callerNumberPoolService");
const { resolvePropertyTimezone } = require("../../utils/resolveTimezone");

// ─── Settings ──────────────────────────────────────────────────────────────

const CALL_SLOTS = [
  { hour: 12, minute: 30 }, // lunch
  { hour: 18, minute: 0 },  // after work
];
const SLOTS_LABEL = "12:30 PM and 6:00 PM";
const MAX_DAYS = 7;
const MIN_GAP_MS = 2 * 60 * 60 * 1000; // never two calls within 2 hours
const CALL_WINDOW = { startHour: 9, endHour: 20 }; // first call "right away" only inside this
const RESUMED_LOOP_HOUR = 11; // paused sign-up loops resume at 11 AM local (their first slot)
const DEFAULT_TZ = "America/New_York";
const PICKUP_OUTCOMES = new Set(["positive", "negative", "callback"]);

const MODEL_BY_TYPE = Object.fromEntries(SOURCES.map((s) => [s.leadType, s.model]));
// Sources that run a daily sign-up follow-up loop (persona does not).
const LOOP_SOURCES = SOURCES.filter((s) => s.model.schema.path("callStatus"));

const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { statusCode: status, ...extra });

// ─── Time helpers ──────────────────────────────────────────────────────────

const validZone = (tz) => !!tz && DateTime.now().setZone(tz).isValid;

/**
 * Buyer's timezone: what their browser told us at signup → their state → the
 * property's state (they're usually buying near home) → Eastern.
 */
function buyerTimezone(leadDoc, property) {
  if (validZone(leadDoc?.timezone)) return { tz: leadDoc.timezone, assumed: false };
  if (leadDoc?.state) return { tz: resolvePropertyTimezone({ state: leadDoc.state }), assumed: true };
  if (property?.state) return { tz: resolvePropertyTimezone({ state: property.state, zipCode: property.zipCode }), assumed: true };
  return { tz: DEFAULT_TZ, assumed: true };
}

/** First call slot strictly after `from`, in the buyer's zone. */
function nextSlotAfter(tz, from = new Date()) {
  const start = DateTime.fromJSDate(from).setZone(tz);
  for (let d = 0; d <= 2; d++) {
    const day = start.plus({ days: d });
    for (const slot of CALL_SLOTS) {
      const t = day.set({ hour: slot.hour, minute: slot.minute, second: 0, millisecond: 0 });
      if (t > start) return t.toUTC().toJSDate();
    }
  }
  return start.plus({ days: 1 }).toUTC().toJSDate();
}

/** First slot tomorrow — used when every caller number is out of calls today. */
function firstSlotTomorrow(tz) {
  const tomorrow = DateTime.now().setZone(tz).plus({ days: 1 }).startOf("day");
  return nextSlotAfter(tz, tomorrow.minus({ minutes: 1 }).toJSDate());
}

function inCallWindow(tz) {
  const h = DateTime.now().setZone(tz).hour;
  return h >= CALL_WINDOW.startHour && h < CALL_WINDOW.endHour;
}

function nextLocalHour(tz, hour) {
  let t = DateTime.now().setZone(tz).set({ hour, minute: 0, second: 0, millisecond: 0 });
  if (t <= DateTime.now()) t = t.plus({ days: 1 });
  return t.toUTC().toJSDate();
}

// ─── Lookups ───────────────────────────────────────────────────────────────

async function loadLead(leadType, leadId) {
  const Model = MODEL_BY_TYPE[leadType];
  if (!Model) return null;
  return Model.findById(leadId).lean();
}

/** Open = active/pending and the auction hasn't ended. */
async function loadOpenProperty(propertyId) {
  const p = await Product.findById(propertyId).select("productName street city state zipCode status auctionEndDate").lean();
  if (!p) return { property: null, open: false };
  const open = ["active", "pending"].includes(p.status) && (!p.auctionEndDate || new Date(p.auctionEndDate) > new Date());
  return { property: p, open };
}

const labelOf = (p) => (p ? [p.street, p.city, p.state].filter(Boolean).join(", ") : "");

/**
 * Sign-up follow-up loops currently running for this person, in ANY funnel
 * (matched by phone or email — people sign up through several forms).
 */
async function findRunningLoops(phone, email) {
  const or = [{ phoneNormalized: phone }];
  if (email) or.push({ email: String(email).toLowerCase() });
  const results = await Promise.all(
    LOOP_SOURCES.map(async ({ leadType, label, model }) => {
      const docs = await model
        .find({ $or: or, callStatus: "no-answer", nextCallAt: { $ne: null }, callingStopped: { $ne: true } })
        .select("callAttempts nextCallAt lastCallAt")
        .lean();
      return docs.map((d) => ({
        kind: "signup",
        leadType,
        leadId: String(d._id),
        label: `${label} follow-up calls`,
        attempts: d.callAttempts || 0,
        nextCallAt: d.nextCallAt,
        lastCallAt: d.lastCallAt,
      }));
    })
  );
  return results.flat();
}

// ─── Call history + plain-language summary ─────────────────────────────────

const summaryCache = new Map(); // `${phone}:${latestCallId}` → summary text

async function summarizeHistory(phone, logs) {
  const withSummary = logs.filter((l) => String(l.summary || "").trim());
  if (!withSummary.length) return "";
  if (withSummary.length === 1) return withSummary[0].summary.trim();

  const key = `${phone}:${logs[0]._id}`;
  if (summaryCache.has(key)) return summaryCache.get(key);
  if (!process.env.ANTHROPIC_API_KEY) return "";

  const notes = withSummary
    .slice(0, 8)
    .map((l) => `- ${new Date(l.createdAt).toDateString()}: ${l.summary.trim()}`)
    .join("\n");
  try {
    const { data } = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: process.env.ANTHROPIC_SUMMARY_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 250,
        system:
          "You write a short note for a real-estate sales admin deciding whether to call a buyer again. Combine the call notes into 2-4 plain sentences: who they are, what they want, how interested they are, objections, and anything they asked for (like not being called). Use only what's in the notes. No lists, no headings.",
        messages: [{ role: "user", content: `Call notes, newest first:\n${notes}` }],
      },
      {
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        timeout: 15000,
      }
    );
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    if (text) summaryCache.set(key, text);
    return text;
  } catch (err) {
    console.error("[buyer-match-call] history summary failed (non-fatal):", err.message);
    return "";
  }
}

async function callHistory(phone) {
  const logs = await CallLog.find({ phone }).sort({ createdAt: -1 }).limit(50).lean();
  const mapped = logs.map((l) => ({ ...mapCallLog(l), createdAt: l.createdAt }));
  return {
    total: logs.length,
    answered: mapped.filter((c) => PICKUP_OUTCOMES.has(c.outcome)).length,
    lastAt: mapped[0]?.startedAt || null,
    lastOutcome: mapped[0]?.outcome || null,
    summary: await summarizeHistory(phone, logs),
    recent: mapped
      .filter((c) => c.summary)
      .slice(0, 3)
      .map((c) => ({ at: c.startedAt, outcome: c.outcome, summary: c.summary })),
  };
}

// ─── Status (what the admin sees before pressing Start) ────────────────────

const publicCampaign = (c) =>
  c && {
    id: String(c._id),
    propertyId: String(c.propertyId),
    propertyLabel: c.propertyLabel,
    status: c.status,
    endReason: c.endReason,
    startedAt: c.startedAt,
    startedBy: c.startedBy?.name || "",
    endsAt: c.endsAt,
    endedAt: c.endedAt,
    nextCallAt: c.nextCallAt,
    attempts: c.attempts,
    day: Math.min(MAX_DAYS, Math.floor((Date.now() - new Date(c.startedAt).getTime()) / 86400000) + 1),
    maxDays: MAX_DAYS,
    timezone: c.timezone,
  };

/**
 * GET status for one buyer (+ optional property): what's running, what happened
 * before, and whether Start is allowed.
 */
async function getCallingStatus({ leadType, leadId, propertyId }) {
  const ctx = await getMatchContext(leadType, leadId, propertyId);
  if (!ctx) throw httpError(404, "Buyer not found");
  const leadDoc = await loadLead(leadType, leadId);
  const phone = normalisePhone(ctx.lead.phone);
  const { tz, assumed } = buyerTimezone(leadDoc, ctx.property);

  if (!phone) {
    return { phone: "", canStart: false, blockReason: "This buyer has no phone number.", running: [], callbacks: [] };
  }

  const [active, loops, callbacks, history, capacity, lastForProperty, propState] = await Promise.all([
    MatchCallCampaign.findOne({ phone, status: "active" }).lean(),
    findRunningLoops(phone, ctx.lead.email),
    CallbackRequest.find({ phone, status: "pending" }).select("callAt nextCallAt note").lean(),
    callHistory(phone),
    getUsageToday().catch(() => null),
    propertyId
      ? MatchCallCampaign.findOne({ phone, propertyId, status: "ended" }).sort({ endedAt: -1 }).lean()
      : null,
    propertyId ? loadOpenProperty(propertyId) : { open: true },
  ]);

  const pausedIds = new Set((active?.overtook || []).map((o) => String(o.leadId)));
  const running = [
    ...(active ? [{ kind: "match", ...publicCampaign(active) }] : []),
    ...loops.map((l) => ({ ...l, paused: pausedIds.has(l.leadId) })),
  ];

  let canStart = !!propertyId;
  let blockReason = propertyId ? "" : "Pick a listed property to start calls about it.";
  if (propertyId && !propState.open) {
    canStart = false;
    blockReason = "This property is no longer open for bidding.";
  } else if (active && String(active.propertyId) === String(propertyId)) {
    canStart = false;
    blockReason = "Calls about this property are already running for this buyer.";
  }

  return {
    phone,
    timezone: tz,
    timezoneAssumed: assumed,
    localTime: DateTime.now().setZone(tz).toFormat("h:mm a"),
    running,
    // Starting now would pause / replace what's running — the UI must confirm.
    needsTakeover: canStart && running.some((r) => !(r.kind === "signup" && r.paused)),
    callbacks: callbacks.map((c) => ({ at: c.nextCallAt || c.callAt, note: c.note })),
    history,
    lastForProperty: publicCampaign(lastForProperty),
    capacity,
    plan: {
      slots: SLOTS_LABEL,
      maxDays: MAX_DAYS,
      firstCall: inCallWindow(tz) ? "now" : nextSlotAfter(tz),
    },
    canStart,
    blockReason,
  };
}

// ─── Start / stop ──────────────────────────────────────────────────────────

/** Pause sign-up loops until `until` (the scheduler simply won't find them due). */
async function pauseLoops(loops, until) {
  await Promise.all(
    loops.map((l) =>
      MODEL_BY_TYPE[l.leadType].updateOne({ _id: l.leadId, callStatus: "no-answer" }, { $set: { nextCallAt: until } })
    )
  );
}

/**
 * End a schedule and settle the loops it paused:
 *   connected → they've been reached: stop those loops for good
 *   replaced  → leave them (the new schedule takes them over)
 *   otherwise → resume them at their next 11 AM local
 */
async function endCampaign(campaign, reason, admin = null) {
  const ended = await MatchCallCampaign.findOneAndUpdate(
    { _id: campaign._id, status: "active" },
    {
      $set: {
        status: "ended",
        endReason: reason,
        endedAt: new Date(),
        nextCallAt: null,
        ...(admin ? { stoppedBy: { id: String(admin.id), name: admin.name } } : {}),
      },
    },
    { new: true }
  ).lean();
  if (!ended) return null; // already ended by someone else

  if (reason !== "replaced") {
    const tz = ended.timezone || DEFAULT_TZ;
    await Promise.all(
      (ended.overtook || []).map((o) => {
        const Model = MODEL_BY_TYPE[o.leadType];
        if (!Model) return null;
        return reason === "connected"
          ? Model.updateOne({ _id: o.leadId, callStatus: "no-answer" }, { $set: { callStatus: "connected", nextCallAt: null } })
          : Model.updateOne({ _id: o.leadId, callStatus: "no-answer" }, { $set: { nextCallAt: nextLocalHour(tz, RESUMED_LOOP_HOUR) } });
      })
    );
  }
  console.log(`[buyer-match-call] ${ended.name} (${ended.phone}) about ${ended.propertyLabel}: ended — ${reason}`);
  return ended;
}

async function startCampaign({ leadType, leadId, propertyId, takeover = false, admin }) {
  const ctx = await getMatchContext(leadType, leadId, propertyId);
  if (!ctx) throw httpError(404, "Buyer not found");
  const phone = normalisePhone(ctx.lead.phone);
  if (!phone) throw httpError(400, "This buyer has no phone number");

  const { property, open } = await loadOpenProperty(propertyId);
  if (!property) throw httpError(404, "Property not found");
  if (!open) throw httpError(400, "This property is no longer open for bidding");

  const [active, loops] = await Promise.all([
    MatchCallCampaign.findOne({ phone, status: "active" }).lean(),
    findRunningLoops(phone, ctx.lead.email),
  ]);
  if (active && String(active.propertyId) === String(propertyId)) {
    throw httpError(409, "Calls about this property are already running for this buyer");
  }
  if ((active || loops.length) && !takeover) {
    throw httpError(409, "Calls are already going to this buyer", { needsTakeover: true });
  }

  const leadDoc = await loadLead(leadType, leadId);
  const { tz } = buyerTimezone(leadDoc, property);
  const now = new Date();
  const endsAt = DateTime.fromJSDate(now).plus({ days: MAX_DAYS }).toJSDate();

  if (active) await endCampaign(active, "replaced", admin);
  await pauseLoops(loops, endsAt);

  let campaign;
  try {
    campaign = await MatchCallCampaign.create({
      leadType,
      leadId,
      name: ctx.lead.name,
      phone,
      email: ctx.lead.email,
      timezone: tz,
      propertyId,
      propertyLabel: labelOf(property),
      match: { ...(ctx.match || {}), wants: ctx.wants },
      startedBy: admin ? { id: String(admin.id), name: admin.name } : undefined,
      startedAt: now,
      endsAt,
      nextCallAt: inCallWindow(tz) ? now : nextSlotAfter(tz, now),
      overtook: loops.map((l) => ({ leadType: l.leadType, leadId: l.leadId, label: l.label })),
    });
  } catch (err) {
    if (err.code === 11000) throw httpError(409, "Another admin just started calls for this buyer");
    throw err;
  }

  console.log(`[buyer-match-call] started: ${campaign.name} (${phone}) about ${campaign.propertyLabel}, tz ${tz}`);
  // Don't wait for the next minute tick when the first call is due now.
  if (campaign.nextCallAt <= new Date()) sweepDueCampaigns().catch(() => {});
  return publicCampaign(campaign.toObject());
}

async function stopCampaign(campaignId, admin) {
  const campaign = await MatchCallCampaign.findById(campaignId).lean();
  if (!campaign) throw httpError(404, "Call schedule not found");
  if (campaign.status !== "active") throw httpError(400, "These calls have already stopped");
  return publicCampaign(await endCampaign(campaign, "admin-stopped", admin));
}

// ─── Dialing ───────────────────────────────────────────────────────────────

/** One line about the buyer from enrichment saved at registration (no API call). */
function backgroundFromEnrichment(enrichment) {
  if (!enrichment || typeof enrichment !== "object") return "";
  const emp = enrichment.employment?.current || {};
  const parts = [
    emp.title && `works as ${emp.title}`,
    emp.company?.name && `at ${emp.company.name}`,
    (emp.company?.industry?.main_industry || (typeof emp.company?.industry === "string" && emp.company.industry)) &&
      `(${emp.company.industry.main_industry || emp.company.industry})`,
    (enrichment.location_name || enrichment.location?.city) && `based in ${enrichment.location_name || enrichment.location.city}`,
  ].filter(Boolean);
  return parts.join(" ");
}

async function buildPromptFor(campaign, { mode, leaveVoicemail = false, note = "" }) {
  const [property, leadDoc] = await Promise.all([
    resolveProperty(String(campaign.propertyId)),
    loadLead(campaign.leadType, campaign.leadId),
  ]);
  return {
    property,
    leadDoc,
    promptConfig: buildMatchCallPrompt({
      property,
      wants: campaign.match?.wants || {},
      reasons: campaign.match?.reasons || [],
      concerns: campaign.match?.concerns || [],
      background: backgroundFromEnrichment(leadDoc?.enrichment),
      mode,
      leaveVoicemail,
      note,
    }),
  };
}

/** Used by voiceCallbackService when a Buyer Match call books a callback. */
async function buildCallbackPromptForCampaign(campaignId, note) {
  const campaign = await MatchCallCampaign.findById(campaignId).lean();
  if (!campaign) return null;
  const { promptConfig } = await buildPromptFor(campaign, { mode: "callback", note });
  return {
    ...promptConfig,
    voicemailMessage:
      "Hi {{prospect_name}}, it's Maya from Vihara, calling you back like you asked. Sorry I missed you — I'll try you again soon.",
  };
}

/** Place one call for a claimed schedule and settle the result. */
async function placeCall(campaign) {
  const leaveVoicemail = !campaign.voicemailLeft;
  let built;
  try {
    built = await buildPromptFor(campaign, { mode: campaign.attempts <= 1 ? "first" : "followup", leaveVoicemail });
  } catch (err) {
    console.error(`[buyer-match-call] ${campaign._id}: could not build call:`, err.message);
    return;
  }
  const { property, leadDoc, promptConfig } = built;
  if (!leadDoc) {
    await endCampaign(campaign, "no-phone");
    return;
  }

  const contact = {
    fullName: campaign.name,
    email: campaign.email,
    timezone: campaign.timezone,
    city: leadDoc.city || "",
    state: leadDoc.state || "",
    buyerType: campaign.match?.wants?.buyerType || "",
  };

  const res = await dispatchCall(campaign.phone, contact, {
    researchSummary: "", // background is already in the script
    property,
    promptConfig,
    source: `buyer-match:${campaign._id}`,
  });

  if (!res.success) {
    const capped = /daily call cap/i.test(res.error || "");
    await MatchCallCampaign.updateOne(
      { _id: campaign._id, status: "active" },
      {
        $push: { calls: { at: new Date(), connected: false, error: res.error || "call failed" } },
        // Every caller number is out of calls today → try again tomorrow, and
        // don't count it as an attempt.
        ...(capped ? { $set: { nextCallAt: firstSlotTomorrow(campaign.timezone) }, $inc: { attempts: -1 } } : {}),
      }
    );
    console.warn(`[buyer-match-call] ${campaign.name}: not dialed — ${res.error}${capped ? " (moved to tomorrow)" : ""}`);
    return;
  }

  await MatchCallCampaign.updateOne(
    { _id: campaign._id },
    { $push: { calls: { callId: res.callId, at: new Date(), connected: null } } }
  );

  // Only a real conversation ends the schedule — a quick "I'm busy" keeps it going.
  const outcome = await pollCallOutcome(res.callId, DID_NOT_CONNECT_REASONS, true, true);
  await MatchCallCampaign.updateOne(
    { _id: campaign._id, "calls.callId": res.callId },
    {
      $set: {
        "calls.$.connected": outcome.connected,
        ...(leaveVoicemail && outcome.endedReason === "voicemail" ? { voicemailLeft: true } : {}),
      },
    }
  );
  if (outcome.connected) await endCampaign(campaign, "connected");
}

// ─── Scheduler ─────────────────────────────────────────────────────────────

let sweeping = false;

async function sweepDueCampaigns() {
  if (sweeping) return;
  sweeping = true;
  try {
    const now = new Date();

    // Out of days → end (resumes any paused sign-up loop).
    const expired = await MatchCallCampaign.find({ status: "active", endsAt: { $lte: now } }).lean();
    for (const c of expired) await endCampaign(c, "max-days");

    const due = await MatchCallCampaign.find({ status: "active", nextCallAt: { $ne: null, $lte: now } })
      .sort({ nextCallAt: 1 })
      .limit(50)
      .lean();

    const openCache = new Map();
    for (const c of due) {
      const pid = String(c.propertyId);
      if (!openCache.has(pid)) openCache.set(pid, (await loadOpenProperty(pid)).open);
      if (!openCache.get(pid)) {
        await endCampaign(c, "property-closed");
        continue;
      }

      // Atomic claim: book the next slot now so an overlapping tick (or a
      // restart mid-call) can't dial twice.
      const claimed = await MatchCallCampaign.findOneAndUpdate(
        { _id: c._id, status: "active", nextCallAt: { $lte: now } },
        {
          $set: { nextCallAt: nextSlotAfter(c.timezone || DEFAULT_TZ, new Date(now.getTime() + MIN_GAP_MS)), lastCallAt: now },
          $inc: { attempts: 1 },
        },
        { new: true }
      ).lean();
      if (!claimed) continue;

      enqueueJob(() => placeCall(claimed), PRIORITY.SCHEDULED).catch((e) =>
        console.error("[buyer-match-call] call failed:", e.message)
      );
    }
  } catch (e) {
    console.error("[buyer-match-call] sweep error:", e.message);
  } finally {
    sweeping = false;
  }
}

let task = null;

function startMatchCallScheduler() {
  if (task) return task;
  task = cron.schedule("* * * * *", sweepDueCampaigns);
  console.log(`[buyer-match-call] scheduler started — ${SLOTS_LABEL} buyer-local, up to ${MAX_DAYS} days.`);
  return task;
}

module.exports = {
  getCallingStatus,
  startCampaign,
  stopCampaign,
  endCampaign,
  buildCallbackPromptForCampaign,
  startMatchCallScheduler,
  sweepDueCampaigns,
  // exported for tests
  nextSlotAfter,
  firstSlotTomorrow,
  buyerTimezone,
};
