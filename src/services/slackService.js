// services/slackService.js
//
// One small, reusable helper that posts new-lead notifications to Slack via an
// Incoming Webhook. Used by the lead controllers (Early Access, Northern
// California, Property Auction, Partner Program).
//
// Design rules (match the rest of the codebase):
//   - Best-effort / fire-and-forget. It NEVER throws to the caller and NEVER
//     blocks lead creation — exactly like the Brevo / enrichment calls.
//   - Zero new dependencies: uses Node's core `https` module (works on any Node
//     version, no axios/node-fetch assumption).
//   - Config comes from an env var, never hardcoded:
//         SLACK_LEADS_WEBHOOK_URL   (set this on Render)
//     If it's not set, the helper logs once and no-ops, so nothing breaks in
//     environments where Slack isn't configured (e.g. local/dev).
//
// Create the webhook in Slack: Apps → Incoming Webhooks → Add to the target
// channel → copy the URL into SLACK_LEADS_WEBHOOK_URL.

const https = require("https");
const { URL } = require("url");

// How long to wait on Slack before giving up (ms). Kept short so a slow Slack
// can never hold a socket open for long — the caller isn't awaiting us anyway.
const SLACK_TIMEOUT_MS = 8000;

/**
 * Low-level POST of a JSON payload to a Slack Incoming Webhook.
 * Resolves true on a 2xx; rejects on invalid URL, network error, timeout, or a
 * non-2xx response. Callers go through notifyNewLead(), which swallows all of
 * this — this stays rejectable so it's independently testable.
 */
function postToSlack(webhookUrl, payload) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(webhookUrl);
    } catch (e) {
      return reject(new Error("Invalid SLACK_LEADS_WEBHOOK_URL"));
    }

    const body = JSON.stringify(payload);
    const options = {
      method: "POST",
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true);
        } else {
          reject(new Error(`Slack responded ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(SLACK_TIMEOUT_MS, () => {
      req.destroy(new Error("Slack request timed out"));
    });

    req.write(body);
    req.end();
  });
}

/**
 * Format a timestamp in Pacific Time for the message footer. Falls back to ISO
 * if the runtime lacks full-ICU timezone data, so this can never throw.
 */
function formatTimestamp(date) {
  try {
    return `${date.toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      dateStyle: "medium",
      timeStyle: "short",
    })} PT`;
  } catch (e) {
    return date.toISOString();
  }
}

/**
 * Build a Slack Block Kit message from a normalized lead shape. Only fields that
 * actually have a value are rendered (no empty rows / placeholders — matches the
 * "no invented data" convention). Slack allows max 10 fields per section, so the
 * list is capped.
 *
 * @param {object} lead
 * @param {string} lead.leadType      Human label, e.g. "Early Access".
 * @param {string} [lead.name]        Display name.
 * @param {string} [lead.email]
 * @param {string} [lead.phone]       Display phone (raw, as entered).
 * @param {boolean} [lead.consent]    Rendered as ✅/❌ when provided.
 * @param {string} [lead.source]      Lead source string.
 * @param {Array<{label:string,value:*}>} [lead.extraFields]  Source-specific rows.
 */
function buildLeadMessage(lead) {
  const {
    leadType = "Lead",
    name = "",
    email = "",
    phone = "",
    consent,
    source = "",
    extraFields = [],
  } = lead || {};

  const fields = [];
  const addField = (label, value) => {
    if (value === undefined || value === null || String(value).trim() === "") return;
    fields.push({ type: "mrkdwn", text: `*${label}:*\n${value}` });
  };

  addField("Name", name);
  addField("Email", email);
  addField("Phone", phone);
  for (const f of Array.isArray(extraFields) ? extraFields : []) {
    addField(f.label, f.value);
  }
  if (consent !== undefined) addField("Consent", consent ? "✅ Yes" : "❌ No");
  addField("Source", source);

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `🆕 New ${leadType} Lead`, emoji: true },
    },
  ];

  const sectionFields = fields.slice(0, 10); // Slack hard limit
  if (sectionFields.length) {
    blocks.push({ type: "section", fields: sectionFields });
  }

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `📅 ${formatTimestamp(new Date())}` }],
  });

  return {
    // Plain-text fallback shown in notifications / clients that don't render blocks.
    text: `New ${leadType} lead: ${name || email || phone || "(no name)"}`,
    blocks,
  };
}

/**
 * Post a new-lead notification to Slack. Fire-and-forget: resolves true if sent,
 * false otherwise. It never throws — callers may still add .catch() for symmetry
 * with the other background side-effects, but they don't have to.
 */
async function notifyNewLead(lead = {}) {
  const webhookUrl = process.env.SLACK_LEADS_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[slack] SLACK_LEADS_WEBHOOK_URL not set — skipping lead notification");
    return false;
  }

  try {
    await postToSlack(webhookUrl, buildLeadMessage(lead));
    return true;
  } catch (e) {
    console.error("[slack] lead notification failed:", e.message);
    return false;
  }
}

module.exports = { notifyNewLead };
