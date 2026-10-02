// controller/outbound/outboundController.js
//
// Thin admin-only handlers for the outbound SMS + Email campaign feature.
// See outboundplan.md §5.1/§7 for the full endpoint spec these implement.

const catchAsyncError = require("../../middleware/catchAsyncError");
const Errorhandler = require("../../utils/errorhandler");
const Product = require("../../model/property/productModel");
const sendEmail = require("../../utils/sendEmail");

const outboundContactsService = require("../../services/outbound/outboundContactsService");
const outboundCampaignService = require("../../services/outbound/outboundCampaignService");
const outboundEmailService = require("../../services/outbound/outboundEmailService");
const outboundCallPromptService = require("../../services/outbound/outboundCallPromptService");
const outboundCallRunner = require("../../services/outbound/outboundCallRunner");
// Read-only reuse — same transcript-fetching plumbing VoiceAgentDashboard's
// GET /calls already uses, so a call dispatched from Outbound reads
// identically whichever screen it's viewed from.
const { getCall } = require("../../services/calling/vapiService");
const { mapCall } = require("../../services/calling/vapiCallsService");

const { MAX_CONTACTS_CEILING, validateMaxContacts, parseContacts: parseContactsRaw } =
  outboundContactsService;
const { resolveOutboundSmsListId, createCampaign, startCampaign } = outboundCampaignService;
const { EMAIL_VARIABLES, renderEmail } = outboundEmailService;

/**
 * GET /config?propertyId?
 * Always: email sender config, the shared contact ceiling, the email
 * variable catalogue. With propertyId, also that property's outbound-SMS
 * setup status (there's no global "SMS configured" flag — it's per property).
 */
exports.getConfig = catchAsyncError(async (req, res, next) => {
  const { propertyId } = req.query;

  const emailConfigured = Boolean(process.env.EMAIL_USERNAME && process.env.EMAIL_PASSWORD);
  const response = {
    success: true,
    email: {
      configured: emailConfigured,
      from: emailConfigured ? `"Vihara" <${process.env.EMAIL_USERNAME}>` : "",
    },
    maxContactsCeiling: MAX_CONTACTS_CEILING,
    emailVariables: EMAIL_VARIABLES,
  };

  if (propertyId) {
    const property = await Product.findById(propertyId).select("brevoOutboundSmsListId");
    if (!property) {
      return next(new Errorhandler("Property not found", 404));
    }
    const listId = resolveOutboundSmsListId(property);
    response.sms = { configured: listId !== null, listId };
  }

  return res.json(response);
});

/**
 * POST /contacts/parse
 * Body: { channel, maxContacts?, csvData?, contact? }
 * Parses and validates only — sends nothing.
 */
exports.parseContacts = catchAsyncError(async (req, res) => {
  const { channel, maxContacts, csvData, contact } = req.body;
  const validatedMax = maxContacts !== undefined ? validateMaxContacts(maxContacts) : undefined;

  const result = parseContactsRaw({ channel, csvData, contact, maxContacts: validatedMax });
  return res.json({ success: true, ...result });
});

/**
 * POST /sms/campaigns
 * Body: { propertyId, maxContacts, csvData?, contact?, source, csvFileName?, provider? }
 *   provider "brevo" (default): consentAttested required, property needs brevoOutboundSmsListId.
 *   provider "sendify": templateId required instead — Sendify enforces its own
 *     real per-contact consent at send time, no attestation needed/accepted.
 */
exports.launchSmsCampaign = catchAsyncError(async (req, res, next) => {
  const { propertyId, maxContacts, consentAttested, csvData, contact, source, csvFileName, provider, templateId } =
    req.body;
  const smsProvider = provider === "sendify" ? "sendify" : "brevo";

  const property = await Product.findById(propertyId);
  if (!property) return next(new Errorhandler("Property not found", 404));

  const validatedMax = validateMaxContacts(maxContacts);

  let smsFields;
  if (smsProvider === "sendify") {
    if (!templateId) {
      return next(new Errorhandler("Pick a template before launching a Sendify campaign", 400));
    }
    const SendifyTemplate = require("../../model/sendify/sendifyTemplateModel");
    const template = await SendifyTemplate.findById(templateId).lean();
    if (!template) return next(new Errorhandler("Template not found", 404));
    smsFields = { provider: "sendify", templateId, templateName: template.name };
  } else {
    if (consentAttested !== true) {
      return next(
        new Errorhandler("These contacts must be confirmed as having given consent to receive texts", 400)
      );
    }
    const listId = resolveOutboundSmsListId(property);
    if (listId === null) {
      return next(
        new Errorhandler(
          `${property.productName || "This property"} is not set up for outbound SMS yet. Add its Brevo list id in Manage Listings.`,
          400
        )
      );
    }
    smsFields = { provider: "brevo", listId, consentAttested: true };
  }

  const { contacts, skipped, total, overLimit } = parseContactsRaw({
    channel: "sms",
    csvData,
    contact,
    maxContacts: validatedMax,
  });

  if (overLimit) {
    return next(new Errorhandler(`${total} contacts ready is over your limit of ${validatedMax}`, 400));
  }
  if (total === 0) {
    return next(new Errorhandler("No valid contacts to send to", 400));
  }

  const campaign = await createCampaign({
    channel: "sms",
    source: source === "csv" ? "csv" : "single",
    csvFileName,
    maxContacts: validatedMax,
    property,
    createdBy: req.user,
    contacts,
    parseSkipped: skipped,
    sms: smsFields,
  });

  res.status(202).json({ success: true, campaignId: campaign._id, total, skipped });

  // Fire-and-forget, same shape as the calling campaigns — the HTTP response
  // has already gone out above.
  startCampaign(campaign._id).catch((err) => {
    console.error("Outbound SMS campaign failed to start:", err);
  });
});

/**
 * GET /sms/sendify-templates
 * Thin proxy onto Sendify's own template collection, so SmsLauncher.jsx
 * (and everything else under AdminPanel/Outbound) only ever talks to
 * outbound.service.js — not a direct cross-feature frontend call into
 * Sendify's own API. Templates aren't property-scoped, so no filtering.
 */
exports.listSendifyTemplatesForOutbound = catchAsyncError(async (req, res) => {
  const SendifyTemplate = require("../../model/sendify/sendifyTemplateModel");
  const templates = await SendifyTemplate.find().sort({ updatedAt: -1 }).select("name body updatedAt");
  return res.json({ success: true, templates });
});

/**
 * POST /email/preview
 * Body: { propertyId, subject, body, bodyFormat, contact? }
 * Renders for one sample contact. Sends nothing.
 */
exports.previewEmail = catchAsyncError(async (req, res, next) => {
  const { propertyId, subject, body, bodyFormat, contact } = req.body;

  const property = await Product.findById(propertyId).lean();
  if (!property) return next(new Errorhandler("Property not found", 404));

  const sampleContact = contact && contact.name ? contact : { name: "Jordan Lee" };
  const rendered = renderEmail({ subject, body, bodyFormat }, sampleContact, property);

  return res.json({ success: true, ...rendered });
});

/**
 * POST /email/test
 * Body: { propertyId, subject, body, bodyFormat }
 * Sends one rendered email ONLY to the logged-in admin (req.user.email).
 * Not recorded as a campaign.
 */
exports.sendTestEmail = catchAsyncError(async (req, res, next) => {
  const { propertyId, subject, body, bodyFormat } = req.body;

  const property = await Product.findById(propertyId).lean();
  if (!property) return next(new Errorhandler("Property not found", 404));

  const sampleContact = { name: req.user.name || "Admin" };
  const { subject: renderedSubject, html } = renderEmail(
    { subject, body, bodyFormat },
    sampleContact,
    property
  );

  try {
    const info = await sendEmail.sendEmailAsync(req.user.email, renderedSubject, html);
    return res.json({ success: true, messageId: info?.messageId || "" });
  } catch (err) {
    return next(new Errorhandler(err.message || "Failed to send test email", 502));
  }
});

/**
 * POST /email/campaigns
 * Body: { propertyId, maxContacts, subject, body, bodyFormat, csvData?, contact?, source, csvFileName? }
 */
exports.launchEmailCampaign = catchAsyncError(async (req, res, next) => {
  const { propertyId, maxContacts, subject, body, bodyFormat, csvData, contact, source, csvFileName } =
    req.body;

  const property = await Product.findById(propertyId);
  if (!property) return next(new Errorhandler("Property not found", 404));

  const validatedMax = validateMaxContacts(maxContacts);

  if (!subject || !String(subject).trim()) return next(new Errorhandler("Subject is required", 400));
  if (!body || !String(body).trim()) return next(new Errorhandler("Body is required", 400));

  const { contacts, skipped, total, overLimit } = parseContactsRaw({
    channel: "email",
    csvData,
    contact,
    maxContacts: validatedMax,
  });

  if (overLimit) {
    return next(new Errorhandler(`${total} contacts ready is over your limit of ${validatedMax}`, 400));
  }
  if (total === 0) {
    return next(new Errorhandler("No valid contacts to send to", 400));
  }

  const campaign = await createCampaign({
    channel: "email",
    source: source === "csv" ? "csv" : "single",
    csvFileName,
    maxContacts: validatedMax,
    property,
    createdBy: req.user,
    contacts,
    parseSkipped: skipped,
    email: { subject, body, bodyFormat: bodyFormat === "html" ? "html" : "text" },
  });

  res.status(202).json({ success: true, campaignId: campaign._id, total, skipped });

  startCampaign(campaign._id).catch((err) => {
    console.error("Outbound email campaign failed to start:", err);
  });
});

/**
 * GET /campaigns?channel?&propertyId?&page=&limit=
 * History list, newest first, without recipients.
 */
exports.listCampaigns = catchAsyncError(async (req, res) => {
  const { channel, propertyId, page, limit } = req.query;
  const result = await outboundCampaignService.listCampaigns({ channel, propertyId }, page, limit);
  return res.json({ success: true, ...result });
});

/**
 * GET /campaigns/:id?recent=&all=
 * Lightweight by default (last `recent` recipients, default 50). `all=true`
 * returns everything — never used for live polling.
 */
exports.getCampaign = catchAsyncError(async (req, res, next) => {
  const { recent, all } = req.query;
  const campaign = await outboundCampaignService.getCampaign(req.params.id, {
    recent: recent !== undefined ? Number(recent) : undefined,
    all: all === "true",
  });
  if (!campaign) return next(new Errorhandler("Campaign not found", 404));
  return res.json({ success: true, campaign });
});

// ==================== CALLS ====================
// A separate prompt store and call-run collection from the existing Calls
// tab (voicePromptModel) and from Enrichment's call channel — see the
// Outbound Calls plan. Only the low-level dispatchCall plumbing is shared.

/**
 * GET /call/prompt-variables
 * Static variable catalogue — same shape as the existing Calls tab's
 * GET /prompt-variables, reused as-is (read-only import).
 */
exports.getCallPromptVariables = catchAsyncError(async (req, res) => {
  res.json({ success: true, variables: outboundCallPromptService.PROMPT_VARIABLES });
});

/**
 * GET /call/prompt/:propertyId
 */
exports.getCallPrompt = catchAsyncError(async (req, res, next) => {
  const { propertyId } = req.params;
  const property = await Product.findById(propertyId).select("productName");
  if (!property) return next(new Errorhandler("Property not found", 404));

  const { prompt, variables, variablesError } = await outboundCallPromptService.getOutboundCallPrompt(propertyId);
  return res.json({ success: true, prompt, variables, variablesError });
});

/**
 * PUT /call/prompt/:propertyId
 */
exports.upsertCallPrompt = catchAsyncError(async (req, res, next) => {
  const { propertyId } = req.params;
  const property = await Product.findById(propertyId).select("_id");
  if (!property) return next(new Errorhandler("Property not found", 404));

  const prompt = await outboundCallPromptService.upsertOutboundCallPrompt(propertyId, req.body, req.user);
  return res.json({ success: true, message: "Outbound call prompt saved", prompt });
});

/**
 * POST /call/campaigns
 * Body: { propertyId, maxContacts, csvData?, contact?, source, csvFileName? }
 */
exports.launchCallCampaign = catchAsyncError(async (req, res) => {
  const { propertyId, maxContacts, csvData, contact, source, csvFileName } = req.body;

  const { callRunId, total, skipped, property, promptConfig } = await outboundCallRunner.prepareCallDispatch(
    { propertyId, maxContacts, csvData, contact, source, csvFileName },
    req.user
  );

  res.status(202).json({ success: true, callRunId, total, skipped });

  // Fire-and-forget, same shape as the SMS/Email campaigns above.
  outboundCallRunner.runCallDispatch(callRunId, property, promptConfig).catch((err) => {
    console.error("Outbound call campaign failed to start:", err);
  });
});

/**
 * GET /call/campaigns/:id?all=
 */
exports.getCallCampaign = catchAsyncError(async (req, res, next) => {
  const callRun = await outboundCallRunner.getCallRun(req.params.id, { all: req.query.all === "true" });
  if (!callRun) return next(new Errorhandler("Call run not found", 404));
  return res.json({ success: true, callRun });
});

/**
 * GET /call/campaigns?propertyId?&page=&limit=
 */
exports.listCallCampaigns = catchAsyncError(async (req, res) => {
  const { propertyId, page, limit } = req.query;
  const result = await outboundCallRunner.listCallRuns({ propertyId }, page, limit);
  return res.json({ success: true, ...result });
});

/**
 * GET /call/transcript/:callId
 * Fetches one call straight from VAPI by id (the id stored on the
 * recipient at dispatch time) and maps it the same way
 * VoiceAgentDashboard's GET /calls does, so it reads identically.
 */
exports.getCallTranscript = catchAsyncError(async (req, res, next) => {
  const { callId } = req.params;
  let call;
  try {
    call = await getCall(callId);
  } catch (err) {
    return next(new Errorhandler(err.response?.data?.message || err.message || "Could not load this call from VAPI", 502));
  }
  return res.json({ success: true, call: mapCall(call) });
});
