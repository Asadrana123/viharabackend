// controller/sendify/sendifyLineController.js
//
// Phase 1 scope: plain CRUD only. Status-transition actions (pause, resume,
// quarantine, start-warmup, etc. — sendify-infra.md §7.4/§7.1) come in
// Phase 4 once there's a router/health-sweep that actually cares about them.
const crypto = require("crypto");
const catchAsyncError = require("../../middleware/catchAsyncError");
const SendifyLine = require("../../model/sendify/sendifyLineModel");
const { getAdapter } = require("../../services/sendify/channels/registry");
const { encryptCredentials } = require("../../utils/secretBox");

/**
 * POST /api/v1/sendify/lines
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

  const line = await SendifyLine.create({
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
  return res.status(201).json({ success: true, line: safeLine });
});

/** GET /api/v1/sendify/lines */
const listLines = catchAsyncError(async (req, res) => {
  const { channelType, status } = req.query;
  const filter = {};
  if (channelType) filter.channelType = channelType;
  if (status) filter.status = status;
  // -credentials is explicit (not just relying on schema select:false) — see
  // the comment in createLine above for why that alone isn't trustworthy.
  const lines = await SendifyLine.find(filter).select("-credentials").sort({ createdAt: -1 });
  return res.status(200).json({ success: true, lines });
});

/** GET /api/v1/sendify/lines/:id */
const getLine = catchAsyncError(async (req, res) => {
  const line = await SendifyLine.findById(req.params.id).select("-credentials");
  if (!line) return res.status(404).json({ success: false, message: "Line not found" });
  return res.status(200).json({ success: true, line });
});

/** PATCH /api/v1/sendify/lines/:id — name/config/limits/notes/hardware edits only, no status transitions here (Phase 4). */
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
    const line = await SendifyLine.findById(req.params.id);
    if (!line) return res.status(404).json({ success: false, message: "Line not found" });
    const adapter = getAdapter(line.channelType);
    const validation = adapter.validateConfig(config !== undefined ? config : line.config, credentials);
    if (!validation.ok) {
      return res.status(400).json({ success: false, message: "Invalid credentials for this channel", errors: validation.errors });
    }
    update.credentials = encryptCredentials(credentials);
  }

  const line = await SendifyLine.findByIdAndUpdate(req.params.id, update, { new: true }).select("-credentials");
  if (!line) return res.status(404).json({ success: false, message: "Line not found" });
  return res.status(200).json({ success: true, line });
});

module.exports = { createLine, listLines, getLine, updateLine };
