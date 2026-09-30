// utils/zillowUrl.js
//
// One place that decides what a valid Zillow listing link is. Used by the
// Property Importer, the admin "Zillow link" field in Manage Listings, and the
// one-time link script.

/**
 * Validate a Zillow listing URL and strip query/hash so Firecrawl always gets
 * the canonical page. Returns the clean URL, or null when invalid.
 */
function normalizeZillowUrl(raw) {
    if (typeof raw !== "string" || !raw.trim()) return null;
    try {
        const url = new URL(raw.trim());
        const isZillowHost = url.hostname === "zillow.com" || url.hostname.endsWith(".zillow.com");
        if (url.protocol !== "https:" || !isZillowHost) return null;
        if (!url.pathname.includes("/homedetails/")) return null;
        return `${url.origin}${url.pathname}`;
    } catch {
        return null;
    }
}

/**
 * Address parts from a Zillow link:
 *   .../homedetails/1405-Tamarack-Ave-Atwater-CA-95301/19153365_zpid/
 *   -> { slug: "1405-Tamarack-Ave-Atwater-CA-95301", houseNumber: "1405", zip: "95301", zpid: "19153365" }
 * Returns null when the link doesn't have that shape.
 */
function parseZillowAddress(url) {
    const match = String(url || "").match(/\/homedetails\/([^/]+)\/(\d+)_zpid/i);
    if (!match) return null;
    const slug = match[1];
    const parts = slug.split("-");
    const zip = parts[parts.length - 1];
    if (!/^\d{5}$/.test(zip)) return null;
    return { slug, houseNumber: parts[0], zip, zpid: match[2] };
}

module.exports = { normalizeZillowUrl, parseZillowAddress };
