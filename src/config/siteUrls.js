// config/siteUrls.js
//
// Public page URLs written onto Brevo contacts:
//   SMS_OPT_IN_URL — the page where the lead ticked the SMS box
//   LISTING_URL    — the property's listing page (used by the Brevo SMS text)
//
// ENV: PUBLIC_SITE_URL (default "https://www.vihara.ai")

const getSiteUrl = () =>
  String(process.env.PUBLIC_SITE_URL || "https://www.vihara.ai").trim().replace(/\/+$/, "");

const auctionPageUrl = (slug) => `${getSiteUrl()}/auction/${slug}`;
const listingPageUrl = (slug) => `${getSiteUrl()}/listing/${slug}`;
const norCalPageUrl = () => `${getSiteUrl()}/northern-california-early-access`;
const partnerPageUrl = () => `${getSiteUrl()}/partner-page`;

module.exports = { auctionPageUrl, listingPageUrl, norCalPageUrl, partnerPageUrl };
