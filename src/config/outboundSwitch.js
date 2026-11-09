// config/outboundSwitch.js
//
// One switch for local runs: OUTBOUND_DISABLED=true stops this backend from calling or texting real people.
// The local database holds copies of real leads, so a local `npm run dev` used to start every call and text
// job and place real calls.
//
// With the switch on:
//   - src/index.js does not start the call schedulers, the Toorak lead poller, Buyer Match calls,
//     voice callbacks, Cal.com text reminders, the FaceTime sweep or the in-process Vtext workers
//     (texts queued locally stay in the local Redis queue, unsent);
//   - vapiService.dispatchCall refuses every call, so nothing else (a form submit, an admin's
//     single call, an outbound call campaign) can dial either.
// Never set it on Render.

const outboundDisabled = () => process.env.OUTBOUND_DISABLED === "true";

const OUTBOUND_DISABLED_ERROR = "Outbound calls are off on this server (OUTBOUND_DISABLED=true)";

module.exports = { outboundDisabled, OUTBOUND_DISABLED_ERROR };
