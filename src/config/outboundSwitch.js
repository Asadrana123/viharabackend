// config/outboundSwitch.js
//
// One switch for local runs: OUTBOUND_DISABLED=true stops this backend from reaching real people or our
// team: no calls, texts, emails or Slack posts. The local database holds copies of real leads and listings,
// so a local `npm run dev` used to start every job and place real calls.
//
// With the switch on:
//   - src/index.js does not start the call schedulers, the Toorak lead poller, Buyer Match calls,
//     voice callbacks, Cal.com text reminders, the FaceTime sweep or the in-process Vtext workers
//     (texts queued locally stay in the local Redis queue, unsent);
//   - vapiService.dispatchCall refuses every call, so nothing else (a form submit, an admin's
//     single call, an outbound call campaign) can dial either;
//   - installOutboundGuards() (called first thing in src/index.js) refuses every HTTPS request that would
//     send or change something at Brevo (emails, contacts, events), Slack, Twilio, Sendblue or Vapi.
//     Reads (GET) still work. This covers axios and Node's https module, which is how all of those are sent;
//   - utils/sendEmail.js (Gmail through nodemailer) sends nothing.
// Jobs that only send email or Slack (auction close, reports) still start and run; their sends are refused.
// Never set it on Render.

const https = require("https");

const outboundDisabled = () => process.env.OUTBOUND_DISABLED === "true";

const OUTBOUND_DISABLED_ERROR = "Outbound calls are off on this server (OUTBOUND_DISABLED=true)";

// Hosts that send to people (emails, texts, calls) or to our Slack. Anything but a GET to them is refused.
const BLOCKED_HOSTS = [
  "api.brevo.com",      // transactional emails, contact upserts (start Brevo automations), events
  "api.sendinblue.com", // Brevo's old host
  "hooks.slack.com",    // Slack incoming webhooks
  "slack.com",          // Slack Web API (chat.postMessage ...)
  "api.twilio.com",     // SMS
  "api.sendblue.co",    // iMessage
  "api.vapi.ai",        // calls (dispatchCall is guarded too)
];

const isBlockedHost = (host) => {
  const h = String(host || "").toLowerCase().replace(/:\d+$/, "");
  return BLOCKED_HOSTS.some((b) => h === b || h.endsWith(`.${b}`));
};

/** The host and method of an https.request / https.get call, whatever form its arguments take. */
function describe(args) {
  let host = "", method = "GET";
  for (const a of args) {
    if (typeof a === "string") { try { host = new URL(a).hostname; } catch { /* not a URL */ } }
    else if (a instanceof URL) host = a.hostname;
    else if (a && typeof a === "object" && typeof a !== "function") {
      host = a.hostname || a.host || host;
      if (a.method) method = String(a.method).toUpperCase();
    }
  }
  return { host, method };
}

let installed = false;

/** Wraps https.request / https.get so sends to BLOCKED_HOSTS fail while the switch is on. Safe to call twice. */
function installOutboundGuards() {
  if (installed) return;
  installed = true;
  for (const name of ["request", "get"]) {
    const original = https[name];
    https[name] = function guarded(...args) {
      if (outboundDisabled()) {
        const { host, method } = describe(args);
        if (method !== "GET" && isBlockedHost(host)) {
          console.log(`[outbound] blocked ${method} ${host} (OUTBOUND_DISABLED=true)`);
          throw new Error(`Blocked ${method} ${host}: outbound sends are off on this server (OUTBOUND_DISABLED=true)`);
        }
      }
      return original.apply(this, args);
    };
  }
}

module.exports = { outboundDisabled, OUTBOUND_DISABLED_ERROR, installOutboundGuards, isBlockedHost };
