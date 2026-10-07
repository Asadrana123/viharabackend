// services/vtext/vtextFormatters.js
//
// Text-message style formatting for the Vtext placeholders: money as "$525K",
// dates as "Sat, Oct 17", times as "11 AM–3:15 PM PT". Kept apart from the
// email params (services/propertyEmail/propertyEmailParams.js), which spell
// everything out ("Saturday, October 17").
const { DateTime } = require("luxon");
const { resolvePropertyTimezone } = require("../../utils/resolveTimezone");

/** 525000 -> "$525K", 525500 -> "$525.5K", 1200000 -> "$1.2M". Empty for a missing or non-positive number. */
function formatShortMoney(n) {
  if (typeof n !== "number" || Number.isNaN(n) || n <= 0) return "";
  const trim = (v) => String(Number(v.toFixed(2)));
  if (n >= 1_000_000) return `$${trim(n / 1_000_000)}M`;
  if (n >= 1000) return `$${trim(n / 1000)}K`;
  return `$${Math.round(n)}`;
}

function inZone(date, tz) {
  if (!date) return null;
  const dt = DateTime.fromJSDate(new Date(date), { zone: tz }).setLocale("en-US");
  return dt.isValid ? dt : null;
}

// "PDT" / "PST" -> "PT", "EDT" -> "ET"; other zone names are left as luxon gives them.
const zoneLabel = (dt) => dt.toFormat("ZZZZ").replace(/^([A-Z])[SD]T$/, "$1T");

// "11 AM", or "11:30 AM" when there are minutes.
const clock = (dt) => dt.toFormat(dt.minute ? "h:mm a" : "h a");

/** "Sat, Oct 17" in the property's time zone. Empty when there is no date. */
function formatAuctionDate(start, tz) {
  const dt = inZone(start, tz);
  return dt ? dt.toFormat("ccc, LLL d") : "";
}

/**
 * "11 AM–3:15 PM PT" for an auction that opens and closes on the same local
 * day. Empty for a missing time or a multi-day auction, so the message falls
 * back to its own wording instead of printing a misleading range.
 */
function formatAuctionTime(start, end, tz) {
  const open = inZone(start, tz);
  const close = inZone(end, tz);
  if (!open || !close || close <= open || open.toISODate() !== close.toISODate()) return "";
  return `${clock(open)}–${clock(close)} ${zoneLabel(close)}`;
}

/** The auction's calendar day ("2026-10-17") in the property's own time zone, or null. */
function auctionDayOf(product) {
  if (!product?.auctionStartDate) return null;
  const dt = inZone(product.auctionStartDate, resolvePropertyTimezone(product));
  return dt ? dt.toISODate() : null;
}

module.exports = { formatShortMoney, formatAuctionDate, formatAuctionTime, auctionDayOf, zoneLabel };
