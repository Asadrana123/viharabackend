// config/voicePromptFollowUp.js
//
// Turns ANY base voice-prompt config into a "follow-up call" version. Used by the
// daily 1:32 PM callback sweep so a routine callback doesn't reuse the signup
// script (which says "registered seconds ago"). Applied centrally in
// leadCallService for every page — early access, Georgia St, Rensselaer, partner —
// so follow-up wording lives in exactly one place.

const FOLLOW_UP_DIRECTIVE = `FOLLOW-UP CALL (overrides any "seconds ago" wording below)
- This is NOT the person's first call. They signed up a little while ago and this is a scheduled follow-up.
- Do NOT say they "just" registered or joined, or that it was "seconds ago." Frame it as circling back on an earlier sign-up.
- Everything else below still applies — same facts, same rules, same turn discipline.

`;

const FOLLOW_UP_FIRST_MESSAGE =
  "Hi {{prospect_name}}, this is Maya from Vihara — you signed up with us a little while back, so I'm just circling back. Is now an okay time for a quick two minutes?";

const FOLLOW_UP_VOICEMAIL_MESSAGE =
  "Hi {{prospect_name}}, this is Maya from Vihara, following up on your sign-up from a little while back. I'll try you again soon — talk soon!";

/**
 * Wrap a base prompt config into its follow-up variant. Returns a NEW object of
 * the same shape; the base config is never mutated. endCallMessage is kept as-is.
 *
 * @param {object} baseConfig { systemPrompt, firstMessage, voicemailMessage, endCallMessage }
 * @returns {object} follow-up prompt config
 */
const buildFollowUp = (baseConfig = {}) => {
  const base = baseConfig || {};
  return {
    ...base, // keep extras such as auctionWindow (per-caller auction times)
    systemPrompt: base.systemPrompt
      ? `${FOLLOW_UP_DIRECTIVE}${base.systemPrompt}`
      : base.systemPrompt,
    firstMessage: FOLLOW_UP_FIRST_MESSAGE,
    voicemailMessage: FOLLOW_UP_VOICEMAIL_MESSAGE,
    endCallMessage: base.endCallMessage || "",
  };
};

// ── Callback variant ──────────────────────────────────────────────────────────
// A human-requested callback ("call me back in an hour") used to replay the
// signup script, so Maya opened with "you just told us…" on a call the person
// had explicitly asked for. buildCallback() reframes ANY base prompt as "calling
// you back like you asked". The previous conversation itself reaches Maya via
// call memory (callMemoryService), so she can pick up where they left off.

// Distinctive marker: a prompt that already carries it (e.g. the Buyer Match
// prompt, which builds its own callback wording) is never wrapped twice.
const CALLBACK_MARKER = "CALLBACK CALL (";

const CALLBACK_FIRST_MESSAGE =
  "Hi {{prospect_name}}, it's Maya from Vihara — calling you back like you asked. Is now a better time?";

const CALLBACK_VOICEMAIL_MESSAGE =
  "Hi {{prospect_name}}, it's Maya from Vihara, calling you back like you asked. Sorry I missed you — I'll try you again soon.";

/**
 * @param {object} baseConfig { systemPrompt, firstMessage, voicemailMessage, endCallMessage }
 * @param {object} [opts]     { note } — the reason they gave when asking for the callback
 */
const buildCallback = (baseConfig = {}, { note = "" } = {}) => {
  const base = baseConfig || {};
  if (String(base.systemPrompt || "").includes(CALLBACK_MARKER)) return base;

  const directive = `${CALLBACK_MARKER}overrides any "seconds ago" or first-call wording below)
- The person ASKED you to call them back at this time. This is that callback — open by saying you're calling back like they asked.
- Do NOT say they "just" signed up or registered, and do NOT restart the pitch from the top. Pick up where the last conversation left off (see what you already know about this caller).${
    note ? `\n- When they asked for the callback they said: "${String(note).replace(/"/g, "'")}". Start from that.` : ""
  }
- Everything else below still applies — same facts, same rules, same turn discipline.

`;

  return {
    ...base, // keep extras such as auctionWindow (per-caller auction times)
    systemPrompt: `${directive}${base.systemPrompt || ""}`,
    firstMessage: CALLBACK_FIRST_MESSAGE,
    voicemailMessage: CALLBACK_VOICEMAIL_MESSAGE,
    endCallMessage: base.endCallMessage || "",
  };
};

module.exports = { buildFollowUp, FOLLOW_UP_DIRECTIVE, buildCallback, CALLBACK_MARKER };