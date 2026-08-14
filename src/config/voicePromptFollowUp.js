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
    systemPrompt: base.systemPrompt
      ? `${FOLLOW_UP_DIRECTIVE}${base.systemPrompt}`
      : base.systemPrompt,
    firstMessage: FOLLOW_UP_FIRST_MESSAGE,
    voicemailMessage: FOLLOW_UP_VOICEMAIL_MESSAGE,
    endCallMessage: base.endCallMessage || "",
  };
};

module.exports = { buildFollowUp, FOLLOW_UP_DIRECTIVE };