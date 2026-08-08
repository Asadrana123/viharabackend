const axios = require("axios");
const {
  buildContact,
  parseContactsCsv,
  runSingleCall,
  createCampaign,
  runCampaign,
  getCampaign,
} = require("../services/vapiCampaignService");
const { resolveProperty } = require("../services/vapiPropertyService");
const { resolvePromptConfig } = require("../services/vapiPromptService");
const { mapCall } = require("../services/vapiCallsService");
const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;

/**
 * Resolve the property and its admin-authored prompt together.
 */
const resolvePitch = async (propertyId) => {
  const property = await resolveProperty(propertyId);
  const promptConfig = await resolvePromptConfig(propertyId);
  return { property, promptConfig };
};

/**
 * POST /api/vapi/call
 */
const startSingleCall = catchAsyncError(async (req, res, next) => {
  const {
    fullName, phone, address, city, state, zip, email,
    enrich = true, propertyId,
  } = req.body;

  if (!fullName || !fullName.trim())
    return next(new ErrorHandler("fullName is required", 400));
  if (!phone || !phone.trim())
    return next(new ErrorHandler("phone is required", 400));
  if (!propertyId)
    return next(new ErrorHandler("propertyId is required", 400));

  const contact = buildContact({ fullName, phones: phone, address, city, state, zip, email });

  if (!contact.phones.length)
    return next(
      new ErrorHandler("Phone number is invalid. Use a 10-digit US number.", 400)
    );

  let property;
  let promptConfig;
  try {
    ({ property, promptConfig } = await resolvePitch(propertyId));
  } catch (err) {
    return next(new ErrorHandler(err.message, err.statusCode || 400));
  }

  const result = await runSingleCall(contact, {
    enrich: Boolean(enrich),
    property,
    promptConfig,
  });

  const anySuccess = result.calls.some((c) => c.success);
  if (!anySuccess)
    return next(
      new ErrorHandler(
        result.calls[0]?.error || "VAPI rejected the call request",
        502
      )
    );

  res.status(200).json({
    success: true,
    message: `Call dispatched to ${result.name}`,
    result,
  });
});

/**
 * POST /api/vapi/launch-campaign
 */
const launchCampaign = catchAsyncError(async (req, res, next) => {
  const { csvData, enrich = true, propertyId } = req.body;

  if (!csvData || !csvData.trim())
    return next(new ErrorHandler("csvData is required", 400));
  if (!propertyId)
    return next(new ErrorHandler("propertyId is required", 400));

  let contacts;
  try {
    contacts = parseContactsCsv(csvData);
  } catch (err) {
    return next(new ErrorHandler(err.message, 400));
  }

  let property;
  let promptConfig;
  try {
    ({ property, promptConfig } = await resolvePitch(propertyId));
  } catch (err) {
    return next(new ErrorHandler(err.message, err.statusCode || 400));
  }

  const job = createCampaign(contacts, {
    enrich: Boolean(enrich),
    property,
    promptConfig,
  });

  runCampaign(job.id).catch((err) =>
    console.error(`❌ Unhandled campaign error (${job.id}):`, err)
  );

  res.status(202).json({
    success: true,
    message: `Campaign queued — ${contacts.length} contacts`,
    jobId: job.id,
    total: contacts.length,
    property: property.address,
  });
});

/**
 * GET /api/vapi/campaign/:jobId
 */
const getCampaignStatus = catchAsyncError(async (req, res, next) => {
  const job = getCampaign(req.params.jobId);
  if (!job)
    return next(new ErrorHandler("Campaign not found or expired", 404));

  res.status(200).json({ success: true, job });
});

/**
 * GET /api/vapi/calls
 * Text-only — call mapping (no recording) lives in vapiCallsService.
 */
const getCalls = catchAsyncError(async (req, res, next) => {
  if (!VAPI_API_KEY) return next(new ErrorHandler("VAPI_API_KEY not configured", 500));

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));

  let allCalls = [];
  let createdAtLt = null;
  const fetchLimit = 100;

  const skipCount = (page - 1) * limit;
  let totalFetched = 0;

  while (true) {
    const params = { limit: fetchLimit };
    if (VAPI_ASSISTANT_ID) params.assistantId = VAPI_ASSISTANT_ID;
    if (createdAtLt) params.createdAtLt = createdAtLt;

    const response = await axios.get("https://api.vapi.ai/call", {
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
      params,
    });

    const batch = response.data || [];
    if (!Array.isArray(batch) || batch.length === 0) break;

    allCalls = allCalls.concat(batch);
    totalFetched += batch.length;

    if (totalFetched >= skipCount + limit) break;
    if (batch.length < fetchLimit) break;

    createdAtLt = batch[batch.length - 1].createdAt;
  }

  const mappedAll = allCalls.map((call) => mapCall(call));
  const pageSlice = mappedAll.slice(skipCount, skipCount + limit);

  const total     = allCalls.length;
  const connected = mappedAll.filter(c => c.outcome !== "missed").length;
  const positive  = mappedAll.filter(c => c.outcome === "positive").length;
  const negative  = mappedAll.filter(c => c.outcome === "negative").length;
  const voicemail = mappedAll.filter(c => c.outcome === "voicemail").length;
  const missed    = mappedAll.filter(c => c.outcome === "missed").length;
  const callback  = mappedAll.filter(c => c.outcome === "callback").length;
  const totalCost = mappedAll.reduce((sum, c) => sum + (c.cost || 0), 0);

  res.status(200).json({
    success: true,
    stats: {
      total,
      connected,
      positive,
      negative,
      voicemail,
      missed,
      callback,
      connectionRate: total > 0 ? Math.round((connected / total) * 100) : 0,
      interestRate: connected > 0 ? Math.round((positive / connected) * 100) : 0,
      totalCost: totalCost.toFixed(2),
    },
    calls: pageSlice,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNext: skipCount + limit < total,
      hasPrev: page > 1,
    },
  });
});

module.exports = {
  launchCampaign,
  getCalls,
  startSingleCall,
  getCampaignStatus,
};