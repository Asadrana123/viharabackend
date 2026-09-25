// services/outbound/outboundEmailService.js
//
// Template rendering + the outbound email campaign runner. Sends through the
// existing src/utils/sendEmail.js (Gmail via nodemailer, sendEmailAsync —
// see outboundplan.md §5.2/§5.3), NOT Brevo — that was an explicit decision.
//
// v1 does NOT check the Unsubscribe collection before sending (deferred, see
// outboundplan.md §11 #9 and §10 — a known, accepted gap).

const Product = require("../../model/property/productModel");
const { getCampaign, markRecipient, finishCampaign } = require("./outboundCampaignService");
const sendEmail = require("../../utils/sendEmail");
const { outboundEmailLayout } = require("../../htmlPages/outbound/outboundEmailLayout");
const { listingPageUrl, auctionPageUrl } = require("../../config/siteUrls");

const EMAIL_VARIABLES = [
  { key: "first_name", label: "First name" },
  { key: "full_name", label: "Full name" },
  { key: "property_name", label: "Property name" },
  { key: "property_address", label: "Property address" },
  { key: "property_city", label: "Property city" },
  { key: "property_state", label: "Property state" },
  { key: "listing_url", label: "Listing URL" },
  { key: "auction_url", label: "Auction URL" },
  { key: "start_bid", label: "Starting bid" },
  { key: "auction_start", label: "Auction start" },
  { key: "auction_end", label: "Auction end" },
];

const escapeHtml = (str) =>
  String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** {{key}} substitution. Values are HTML-escaped; unknown keys are left blank rather than left as literal "{{key}}". */
const renderTemplate = (str, vars) =>
  String(str || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const v = vars ? vars[key] : undefined;
    return v === undefined || v === null || v === "" ? "" : escapeHtml(String(v));
  });

const buildRecipientVars = (contact, property) => ({
  first_name: String(contact?.name || "").trim().split(/\s+/)[0] || "",
  full_name: contact?.name || "",
  property_name: property?.productName || "",
  property_address: [property?.street, property?.city, property?.state].filter(Boolean).join(", "),
  property_city: property?.city || "",
  property_state: property?.state || "",
  listing_url: property?.slug ? listingPageUrl(property.slug) : "",
  auction_url: property?.slug ? auctionPageUrl(property.slug) : "",
  start_bid: typeof property?.startBid === "number" ? `$${property.startBid.toLocaleString()}` : "",
  auction_start: property?.auctionStartDate ? new Date(property.auctionStartDate).toLocaleString() : "",
  auction_end: property?.auctionEndDate ? new Date(property.auctionEndDate).toLocaleString() : "",
});

/**
 * @param {{subject:string, body:string, bodyFormat:"text"|"html"}} template
 * @param {{name?:string}} contact
 * @param {object} property - a productModel document (or lean object)
 * @returns {{ subject: string, html: string }}
 */
const renderEmail = (template, contact, property) => {
  const vars = buildRecipientVars(contact, property);
  const subject = renderTemplate(template?.subject, vars);
  const body = renderTemplate(template?.body, vars);
  const html = outboundEmailLayout(body, template?.bodyFormat);
  return { subject, html };
};

const runEmailCampaign = async (campaignId) => {
  const campaign = await getCampaign(campaignId, { all: true });
  if (!campaign) return;

  const property = await Product.findById(campaign.property.id).lean();

  for (let i = 0; i < campaign.recipients.length; i++) {
    const recipient = campaign.recipients[i];
    if (recipient.status !== "pending") continue;

    try {
      const { subject, html } = renderEmail(campaign.email, recipient, property);
      const info = await sendEmail.sendEmailAsync(recipient.email, subject, html);
      await markRecipient(campaignId, i, {
        status: "succeeded",
        messageId: info?.messageId || "",
      });
    } catch (err) {
      await markRecipient(campaignId, i, {
        status: "failed",
        reason: err?.message || String(err),
      });
    }
  }

  await finishCampaign(campaignId, "completed");
};

module.exports = {
  EMAIL_VARIABLES,
  renderTemplate,
  buildRecipientVars,
  renderEmail,
  runEmailCampaign,
};
