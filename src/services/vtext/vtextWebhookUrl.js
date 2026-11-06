// services/vtext/vtextWebhookUrl.js
//
// The URL a provider (BlueBubbles, android-sms-gateway, Twilio) POSTs inbound events to
// for a line — the per-line webhookKey in the path is the security boundary
// (controller/vtext/vtextWebhookController.js), not a secret on the provider's side.
// Returns null when VTEXT_PUBLIC_BASE_URL isn't configured (e.g. plain local dev with
// no tunnel) — there's nothing reachable to build a URL to yet.

/** The public base URL with no trailing slash, or null when it isn't configured. */
function publicBaseUrl() {
  const base = process.env.VTEXT_PUBLIC_BASE_URL;
  return base ? base.replace(/\/$/, "") : null;
}

function buildWebhookUrl(line) {
  const base = publicBaseUrl();
  if (!base) return null;
  return `${base}/api/webhooks/vtext/${line.channelType}/${line.webhookKey}`;
}

module.exports = { buildWebhookUrl, publicBaseUrl };
