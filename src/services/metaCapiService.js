// services/metaCapiService.js
const crypto = require("crypto");

const GRAPH_API_VERSION = "v20.0";

// Normalize + SHA-256 hash email. Meta requires all PII hashed.
const hashEmail = (email) => {
  if (!email) return undefined;
  return crypto.createHash("sha256").update(String(email).trim().toLowerCase()).digest("hex");
};

// Phone must be digits only (strip +, spaces, dashes) before hashing.
const hashPhone = (phone) => {
  if (!phone) return undefined;
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return undefined;
  return crypto.createHash("sha256").update(digits).digest("hex");
};

/**
 * Send one conversion event to the Meta Conversions API.
 * Secrets are read at call time so a missing key never crashes boot.
 *
 * @param {Object}  params
 * @param {string}  params.eventName        Meta standard event: CompleteRegistration | Lead | Search | MQL
 * @param {string}  [params.eventId]        Shared dedupe ID — MUST match the browser Pixel eventID
 * @param {string}  [params.eventSourceUrl] URL the event fired on
 * @param {Object}  [params.userData]       { email, phone, clientIpAddress, clientUserAgent, fbp, fbc }
 * @param {Object}  [params.customData]     Custom params (market, market_status, flips_per_year, ...)
 * @returns {Promise<{ success: boolean, response?: any, error?: string }>}
 */
const sendEvent = async ({ eventName, eventId, eventSourceUrl, userData = {}, customData = {} }) => {
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;
  const testEventCode = process.env.META_TEST_EVENT_CODE;

  if (!pixelId || !accessToken) {
    console.warn("[MetaCAPI] Missing META_PIXEL_ID or META_ACCESS_TOKEN — event skipped.");
    return { success: false, error: "Meta CAPI not configured" };
  }

  const hashedEmail = hashEmail(userData.email);
  const hashedPhone = hashPhone(userData.phone);

  const user_data = {
    em: hashedEmail ? [hashedEmail] : undefined,
    ph: hashedPhone ? [hashedPhone] : undefined,
    client_ip_address: userData.clientIpAddress,
    client_user_agent: userData.clientUserAgent,
    fbp: userData.fbp,
    fbc: userData.fbc,
  };
  // Strip undefined so Meta never receives empty fields.
  Object.keys(user_data).forEach((k) => user_data[k] === undefined && delete user_data[k]);

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "website",
        event_source_url: eventSourceUrl,
        user_data,
        custom_data: customData,
      },
    ],
  };

  // Only attached while a test code is in env. Remove the env var to go live — no code change.
  if (testEventCode) payload.test_event_code = testEventCode;

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events?access_token=${accessToken}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (!response.ok) {
      console.error("[MetaCAPI] Meta returned an error:", result);
      return { success: false, error: result?.error?.message || "Meta API error", response: result };
    }
    return { success: true, response: result };
  } catch (err) {
    console.error("[MetaCAPI] Request failed:", err.message);
    return { success: false, error: err.message };
  }
};

module.exports = { sendEvent };