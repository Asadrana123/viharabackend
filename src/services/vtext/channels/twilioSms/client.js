// services/vtext/channels/twilioSms/client.js
//
// Thin wrapper over the `twilio` SDK so the adapter (and its tests) only deal
// with three small methods. The SDK is required lazily: nothing here loads it
// until a real Twilio line is used, and tests swap in a fake with
// setClientFactoryForTests() so no test ever reaches the network.
let clientFactory = null;

/** Tests only: `fn(creds)` must return an object with sendText / getMessagingService / updateMessagingService. Pass null to restore the real client. */
function setClientFactoryForTests(fn) {
  clientFactory = fn;
}

/**
 * @param {object} creds - { accountSid, authToken, apiKeySid?, apiKeySecret? }
 * @returns {{ sendText: Function, getMessagingService: Function, updateMessagingService: Function }}
 */
function buildClient(creds) {
  if (clientFactory) return clientFactory(creds);

  const twilio = require("twilio");
  // An API key (SK…) can send instead of the account auth token, which keeps the
  // main token out of day-to-day calls. Webhook signatures are still checked with
  // the auth token (adapter.verifyWebhook), so the token is stored either way.
  const raw =
    creds.apiKeySid && creds.apiKeySecret
      ? twilio(creds.apiKeySid, creds.apiKeySecret, { accountSid: creds.accountSid })
      : twilio(creds.accountSid, creds.authToken);

  return {
    sendText: (params) => raw.messages.create(params),
    getMessagingService: (sid) => raw.messaging.v1.services(sid).fetch(),
    updateMessagingService: (sid, params) => raw.messaging.v1.services(sid).update(params),
  };
}

module.exports = { buildClient, setClientFactoryForTests };
