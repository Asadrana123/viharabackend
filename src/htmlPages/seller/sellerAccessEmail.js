const { DateTime } = require("luxon");
const { resolvePropertyTimezone } = require("../../utils/resolveTimezone");

// The email a seller gets when an admin gives them access to one or more
// properties: per property, the auction time, listing link, login details and
// the seller-dashboard link. `password` is null for an existing account whose
// password was left unchanged.

const SITE_URL = (process.env.CLIENT_URL || "https://www.vihara.ai").replace(/\/+$/, "");

const escapeHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function propertyTitle(p) {
  const place = [p.street, p.city].filter(Boolean).join(", ");
  return place || p.productName || "Your property";
}

// "11:00 AM – 3:00 PM PDT" in the property's own timezone. Shows the date on
// both ends when the auction runs over more than one day.
function auctionTime(p) {
  if (!p.auctionStartDate || !p.auctionEndDate) return "To be confirmed";
  const zone = resolvePropertyTimezone(p);
  const start = DateTime.fromJSDate(new Date(p.auctionStartDate)).setZone(zone);
  const end = DateTime.fromJSDate(new Date(p.auctionEndDate)).setZone(zone);
  if (start.hasSame(end, "day")) {
    return `${start.toFormat("h:mm a")} – ${end.toFormat("h:mm a ZZZZ")}`;
  }
  return `${start.toFormat("LLL d, h:mm a")} – ${end.toFormat("LLL d, h:mm a ZZZZ")}`;
}

// The auction day in the property's timezone, e.g. "August 29, 2026".
function auctionDay(p) {
  if (!p.auctionStartDate) return null;
  const zone = resolvePropertyTimezone(p);
  return DateTime.fromJSDate(new Date(p.auctionStartDate)).setZone(zone).toFormat("LLLL d, yyyy");
}

function introLine(properties) {
  const n = properties.length;
  const days = properties.map(auctionDay);
  const sameDay = days[0] && days.every((d) => d === days[0]);
  const noun = n === 1 ? "the following property" : "the following properties";
  const auctions = n === 1 ? "auction" : "auctions";
  if (!sameDay) {
    return `We are pleased to confirm the upcoming live ${auctions} for ${noun}. The auction times are listed below.`;
  }
  const scheduled = n === 1 ? "scheduled" : n === 2 ? "both scheduled" : "all scheduled";
  return `We are pleased to confirm the upcoming live ${auctions} for ${noun}, ${scheduled} for ${days[0]}.`;
}

const link = (url) => `<a href="${escapeHtml(url)}" style="color:#4f46e5;">${escapeHtml(url)}</a>`;

const getSellerAccessEmail = ({ email, password, properties }) => {
  const loginUrl = `${SITE_URL}/auth/login`;
  const passwordHtml = password
    ? `<strong>${escapeHtml(password)}</strong>`
    : `your existing Vihara password (use &ldquo;Forgot password&rdquo; on the login page if you don&rsquo;t remember it)`;

  const blocks = properties
    .map((p, i) => {
      const listingUrl = `${SITE_URL}/listing/${p.slug || p._id}`;
      const accessUrl = `${SITE_URL}/seller/bids/${p._id}`;
      return `
      <p style="margin:0 0 6px;font-weight:600;">${i + 1}. ${escapeHtml(propertyTitle(p))}</p>
      <p style="margin:0 0 4px;">Auction Time: ${escapeHtml(auctionTime(p))}</p>
      <p style="margin:0 0 14px;">Property Listing: ${link(listingUrl)}</p>
      <p style="margin:0 0 4px;">Login URL: ${link(loginUrl)}</p>
      <p style="margin:0 0 4px;">Email: ${escapeHtml(email)}</p>
      <p style="margin:0 0 4px;">Password: ${passwordHtml}</p>
      <p style="margin:0 0 24px;">Access URL: ${link(accessUrl)}</p>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Your Vihara Seller Access</title>
</head>
<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222;">
  <div style="max-width:600px;">
    <p style="margin:0 0 16px;">Dear Seller,</p>
    <p style="margin:0 0 24px;">${escapeHtml(introLine(properties))}</p>
    ${blocks}
    <p style="margin:0 0 16px;">You can use the login credentials above to access the Vihara platform and monitor the live bidding activity in real time throughout the respective auction periods.</p>
    <p style="margin:0 0 16px;">Please make sure you are logged in before the auction begins. If you experience any issues accessing the platform or have any questions, please contact the Vihara team for assistance.</p>
    <p style="margin:0 0 16px;">We wish you a successful auction.</p>
    <p style="margin:0;">Best regards,<br/>Vihara Team</p>
  </div>
</body>
</html>`;
};

getSellerAccessEmail.subject = (properties) =>
  properties.length === 1
    ? `Your Vihara seller access — ${propertyTitle(properties[0])}`
    : `Your Vihara seller access — ${properties.length} properties`;

module.exports = getSellerAccessEmail;
