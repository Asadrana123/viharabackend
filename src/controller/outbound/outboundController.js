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
 * Body: { propertyId, maxContacts, consentAttested, csvData?, contact?, source, csvFileName? }
 */
exports.launchSmsCampaign = catchAsyncError(async (req, res, next) => {
  const { propertyId, maxContacts, consentAttested, csvData, contact, source, csvFileName } = req.body;

  const property = await Product.findById(propertyId);
  if (!property) return next(new Errorhandler("Property not found", 404));

  const validatedMax = validateMaxContacts(maxContacts);

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
    sms: { listId, consentAttested: true },
  });

  res.status(202).json({ success: true, campaignId: campaign._id, total, skipped });

  // Fire-and-forget, same shape as the calling campaigns — the HTTP response
  // has already gone out above.
  startCampaign(campaign._id).catch((err) => {
    console.error("Outbound SMS campaign failed to start:", err);
  });
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
