// controller/vtext/vtextLineController.js
//
// Phase 1: plain CRUD. Phase 4 adds the status-transition actions
// (sendify-infra.md §7.1/§7.4) and usage/events read endpoints (§8.1).
const crypto = require("crypto");
const catchAsyncError = require("../../middleware/catchAsyncError");
const VtextLine = require("../../model/vtext/vtextLineModel");
const VtextLineEvent = require("../../model/vtext/vtextLineEventModel");
const VtextLineUsage = require("../../model/vtext/vtextLineUsageModel");
const { getAdapter } = require("../../services/vtext/channels/registry");
const { encryptCredentials, decryptCredentials } = require("../../utils/secretBox");
const { drainLine } = require("../../services/vtext/vtextLineDrainService");

/**
 * The URL a provider (BlueBubbles, android-sms-gateway) POSTs inbound events to
 * for this line — the per-line webhookKey in the path is the actual security
 * boundary (vtextWebhookController.js), not a secret on the provider's side.
 * Returns null when VTEXT_PUBLIC_BASE_URL isn't configured (e.g. plain local
 * dev with no tunnel) — there's nothing reachable to build a URL to yet.
 */
function buildWebhookUrl(line) {
  const base = process.env.VTEXT_PUBLIC_BASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/api/webhooks/vtext/${line.channelType}/${line.webhookKey}`;
}

/** Attaches the computed webhookUrl to a line object headed into a JSON response (never stored on the document itself — always derived from current env + the line's own fields). */
function withWebhookUrl(lineObj) {
  return { ...lineObj, webhookUrl: buildWebhookUrl(lineObj) };
}

/**
 * Best-effort webhook registration right after a line is created — most lines
 * are usable without this (BlueBubbles/android-sms-gateway can also have their
 * webhook pasted in by hand), so a failure here never fails line creation
 * itself. Skipped entirely (not attempted) when there's no public URL to
 * register yet, or the channel has no such step (mock).
 */
async function tryRegisterWebhooks(line, credentials) {
  const adapter = getAdapter(line.channelType);
  if (!adapter.registerWebhooks) {
    return { attempted: false, reason: "this channel has no webhook-registration step" };
  }
  const publicUrl = buildWebhookUrl(line);
  if (!publicUrl) {
    return { attempted: false, reason: "VTEXT_PUBLIC_BASE_URL is not configured — register this line's webhook manually on the provider's side for now" };
  }
  try {
    const result = await adapter.registerWebhooks({ line, credentials, publicUrl });
    return { attempted: true, ok: true, result };
  } catch (err) {
    return { attempted: true, ok: false, error: err.message };
  }
}

/**
 * POST /api/v1/vtext/lines
 * Body: { name, channelType, address, config, credentials (plain, e.g. { password }) }
 */
const createLine = catchAsyncError(async (req, res) => {
  const { name, channelType, address, config, credentials, limits, warmup, hardware, notes } = req.body;

  if (!name || !channelType || !address) {
    return res.status(400).json({ success: false, message: "name, channelType and address are required" });
  }

  const adapter = getAdapter(channelType); // throws if channelType isn't registered — caught by catchAsyncError -> 500 is fine here, it's an admin tool
  const validation = adapter.validateConfig(config, credentials);
  if (!validation.ok) {
    return res.status(400).json({ success: false, message: "Invalid config/credentials for this channel", errors: validation.errors });
  }

  const line = await VtextLine.create({
    name,
    channelType,
    address,
    config: config || {},
    credentials: credentials ? encryptCredentials(credentials) : undefined,
    limits: limits || {},
    warmup: warmup || { enabled: true },
    hardware: hardware || {},
    notes: notes || "",
    webhookKey: crypto.randomBytes(32).toString("hex"),
    status: "provisioning",
    statusChangedAt: new Date(),
    statusChangedBy: { kind: "admin", adminId: req.user?._id, adminName: req.user?.name },
  });

  // select:false on the schema only filters QUERIES (find/findById/...) — a
  // document just built by .create() was never queried, so it still has
  // every field in memory regardless of select:false. Found this the hard
  // way during Phase 1 verification: the first version of this endpoint
  // genuinely leaked encrypted credentials (iv/tag/ciphertext) in its own
  // create response. Strip explicitly rather than trusting the schema here.
  const safeLine = line.toObject();
  delete safeLine.credentials;

  // credentials here is still the PLAIN object from the request body — no
  // need to decrypt what we never encrypted-and-stored-then-reloaded in this
  // same request.
  const webhookRegistration = await tryRegisterWebhooks(line, credentials);

  return res.status(201).json({ success: true, line: withWebhookUrl(safeLine), webhookRegistration });
});

/** POST /api/v1/vtext/lines/:id/register-webhooks — manual (re-)registration, for when it failed at create time (tunnel not up yet) or the provider-side config changed. */
const registerWebhooksForLine = catchAsyncError(async (req, res) => {
  const line = await VtextLine.findById(req.params.id).select("+credentials.iv +credentials.tag +credentials.ciphertext");
  if (!line) return res.status(404).json({ success: false, message: "Line not found" });

  const credentials = line.credentials?.ciphertext ? decryptCredentials(line.credentials) : undefined;
  const webhookRegistration = await tryRegisterWebhooks(line, credentials);
  return res.status(200).json({ success: true, webhookRegistration });
});

/** GET /api/v1/vtext/lines */
const listLines = catchAsyncError(async (req, res) => {
  const { channelType, status } = req.query;
  const filter = {};
  if (channelType) filter.channelType = channelType;
  if (status) filter.status = status;
  // Excluding the three leaf fields explicitly (not just relying on schema
  // select:false, nor on excluding the parent `credentials` path — found via
  // direct reproduction that `.select("-credentials")` actually THROWS
  // ("Path collision at credentials.iv remaining portion iv"): Mongo won't
  // accept an exclusion on a parent path together with the schema's own
  // select:false exclusions on that path's children in the same projection).
  const lines = await VtextLine.find(filter)
    .select("-credentials.iv -credentials.tag -credentials.ciphertext")
    .sort({ createdAt: -1 });
  return res.status(200).json({ success: true, lines: lines.map((l) => withWebhookUrl(l.toObject())) });
});

/** GET /api/v1/vtext/lines/:id */
const getLine = catchAsyncError(async (req, res) => {
  const line = await VtextLine.findById(req.params.id).select("-credentials.iv -credentials.tag -credentials.ciphertext");
  if (!line) return res.status(404).json({ success: false, message: "Line not found" });
  return res.status(200).json({ success: true, line: withWebhookUrl(line.toObject()) });
});

/** PATCH /api/v1/vtext/lines/:id — name/config/limits/notes/hardware edits only, no status transitions here (Phase 4). */
const updateLine = catchAsyncError(async (req, res) => {
  const { name, config, credentials, limits, warmup, hardware, notes } = req.body;
  const update = {};
  if (name !== undefined) update.name = name;
  if (config !== undefined) update.config = config;
  if (limits !== undefined) update.limits = limits;
  if (warmup !== undefined) update.warmup = warmup;
  if (hardware !== undefined) update.hardware = hardware;
  if (notes !== undefined) update.notes = notes;

  if (credentials !== undefined) {
    const line = await VtextLine.findById(req.params.id);
    if (!line) return res.status(404).json({ success: false, message: "Line not found" });
    const adapter = getAdapter(line.channelType);
    const validation = adapter.validateConfig(config !== undefined ? config : line.config, credentials);
    if (!validation.ok) {
      return res.status(400).json({ success: false, message: "Invalid credentials for this channel", errors: validation.errors });
    }
    update.credentials = encryptCredentials(credentials);
  }

  const line = await VtextLine.findByIdAndUpdate(req.params.id, update, { new: true }).select("-credentials.iv -credentials.tag -credentials.ciphertext");
  if (!line) return res.status(404).json({ success: false, message: "Line not found" });
  return res.status(200).json({ success: true, line: withWebhookUrl(line.toObject()) });
});

/** Shared status transition: writes line.status + a vtextLineEvent audit row. Does NOT validate the transition is sensible — each action handler below decides that. */
async function setLineStatus(line, toStatus, reason, req) {
  const fromStatus = line.status;
  line.status = toStatus;
  line.statusReason = reason || "";
  line.statusChangedAt = new Date();
  line.statusChangedBy = { kind: "admin", adminId: req.user?._id, adminName: req.user?.name };
  await line.save();
  await VtextLineEvent.create({
    lineId: line._id,
    type: "status-change",
    from: fromStatus,
    to: toStatus,
    reason,
    actor: { kind: "admin", adminId: req.user?._id, adminName: req.user?.name },
  });
}

/** POST /api/v1/vtext/lines/:id/pause */
const pauseLine = catchAsyncError(async (req, res) => {
  const line = await VtextLine.findById(req.params.id);
  if (!line) return res.status(404).json({ success: false, message: "Line not found" });
  await setLineStatus(line, "paused", req.body?.reason, req);
  return res.status(200).json({ success: true, line: withWebhookUrl(line.toObject()) });
});

/** POST /api/v1/vtext/lines/:id/resume — back to the status it was in before pausing, defaulting to "active". */
const resumeLine = catchAsyncError(async (req, res) => {
  const line = await VtextLine.findById(req.params.id);
  if (!line) return res.status(404).json({ success: false, message: "Line not found" });
  if (line.status !== "paused") {
    return res.status(400).json({ success: false, message: `Line is "${line.status}", not "paused" — nothing to resume` });
  }
  const lastPause = await VtextLineEvent.findOne({ lineId: line._id, type: "status-change", to: "paused" }).sort({ createdAt: -1 });
  const restoreTo = lastPause?.from && ["warming", "active"].includes(lastPause.from) ? lastPause.from : "active";
  await setLineStatus(line, restoreTo, "resumed by admin", req);
  return res.status(200).json({ success: true, line: withWebhookUrl(line.toObject()) });
});

/** POST /api/v1/vtext/lines/:id/quarantine — manual quarantine (auto-quarantine goes through vtextLineHealthService instead, not this endpoint). */
const quarantineLine = catchAsyncError(async (req, res) => {
  const line = await VtextLine.findById(req.params.id);
  if (!line) return res.status(404).json({ success: false, message: "Line not found" });
  await setLineStatus(line, "quarantined", req.body?.reason || "manually quarantined by admin", req);
  const drainResult = await drainLine(line._id);
  return res.status(200).json({ success: true, line: withWebhookUrl(line.toObject()), ...drainResult });
});

/** POST /api/v1/vtext/lines/:id/reinstate — the ONLY way out of quarantine (§7.4: "manual only"). Re-enters warming at a reduced (restarted) schedule. */
const reinstateLine = catchAsyncError(async (req, res) => {
  const line = await VtextLine.findById(req.params.id);
  if (!line) return res.status(404).json({ success: false, message: "Line not found" });
  if (line.status !== "quarantined") {
    return res.status(400).json({ success: false, message: `Line is "${line.status}", not "quarantined" — nothing to reinstate` });
  }
  line.warmup.enabled = true;
  line.warmup.startedAt = new Date();
  // Not `line.health = {...line.health, ...}` — spreading a Mongoose
  // subdocument copies its unset nested paths (e.g. health.device) as
  // explicit `undefined` properties, and reassigning the whole subdocument
  // with those present throws a CastError on save. Setting the two fields
  // directly avoids touching the rest of the subdocument at all.
  line.health.consecutiveFailures = 0;
  line.health.failureRateRecent = 0;
  await setLineStatus(line, "warming", "reinstated by admin, warm-up restarted", req);
  return res.status(200).json({ success: true, line: withWebhookUrl(line.toObject()) });
});

/** POST /api/v1/vtext/lines/:id/retire — permanent, drains and stops routing to this line for good. */
const retireLine = catchAsyncError(async (req, res) => {
  const line = await VtextLine.findById(req.params.id);
  if (!line) return res.status(404).json({ success: false, message: "Line not found" });
  await setLineStatus(line, "retired", req.body?.reason || "retired by admin", req);
  const drainResult = await drainLine(line._id);
  return res.status(200).json({ success: true, line: withWebhookUrl(line.toObject()), ...drainResult });
});

/** POST /api/v1/vtext/lines/:id/drain — toggles routing.acceptsNewContacts off without changing status (§7.1 "drain mode": sticky conversations keep working, no new ones start). */
const toggleDrainMode = catchAsyncError(async (req, res) => {
  const line = await VtextLine.findById(req.params.id);
  if (!line) return res.status(404).json({ success: false, message: "Line not found" });
  line.routing.acceptsNewContacts = req.body?.acceptsNewContacts !== undefined ? !!req.body.acceptsNewContacts : !line.routing.acceptsNewContacts;
  await line.save();
  return res.status(200).json({ success: true, line: withWebhookUrl(line.toObject()) });
});

/** POST /api/v1/vtext/lines/:id/start-warmup — §7.1 step 5, after a successful test send. */
const startWarmup = catchAsyncError(async (req, res) => {
  const line = await VtextLine.findById(req.params.id);
  if (!line) return res.status(404).json({ success: false, message: "Line not found" });
  line.warmup.enabled = true;
  line.warmup.startedAt = new Date();
  await setLineStatus(line, "warming", "warm-up started by admin", req);
  return res.status(200).json({ success: true, line: withWebhookUrl(line.toObject()) });
});

/** POST /api/v1/vtext/lines/:id/test-send — §7.1 step 5, a real send bypassing the queue/compliance gate entirely (admin-to-self verification only, never a real contact). */
const testSend = catchAsyncError(async (req, res) => {
  const { to, body } = req.body;
  if (!to || !body) return res.status(400).json({ success: false, message: "to and body are required" });

  const line = await VtextLine.findById(req.params.id).select("+credentials.iv +credentials.tag +credentials.ciphertext");
  if (!line) return res.status(404).json({ success: false, message: "Line not found" });

  const adapter = getAdapter(line.channelType);
  try {
    const credentials = line.credentials?.ciphertext ? decryptCredentials(line.credentials) : undefined;
    const result = await adapter.send({ line, credentials, to, body, clientMessageId: `test-${Date.now()}` });
    return res.status(200).json({ success: true, result });
  } catch (err) {
    return res.status(502).json({ success: false, message: err.message, kind: err.kind });
  }
});

/** GET /api/v1/vtext/lines/:id/usage?days=30 */
const getLineUsage = catchAsyncError(async (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
  const since = require("luxon").DateTime.now().minus({ days }).toFormat("yyyy-LL-dd");
  const usage = await VtextLineUsage.find({ lineId: req.params.id, day: { $gte: since } }).sort({ day: 1 });
  return res.status(200).json({ success: true, usage });
});

/** GET /api/v1/vtext/lines/:id/events */
const getLineEvents = catchAsyncError(async (req, res) => {
  const events = await VtextLineEvent.find({ lineId: req.params.id }).sort({ createdAt: -1 }).limit(200);
  return res.status(200).json({ success: true, events });
});

module.exports = {
  createLine, listLines, getLine, updateLine,
  pauseLine, resumeLine, quarantineLine, reinstateLine, retireLine, toggleDrainMode,
  startWarmup, testSend, getLineUsage, getLineEvents, registerWebhooksForLine,
};
