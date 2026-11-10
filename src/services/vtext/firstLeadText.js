// services/vtext/firstLeadText.js
//
// The first text every new lead gets, over iMessage or the Twilio line (senior's wording, 10 Nov 2026):
//   "Hi {first name} - this is Maya from Vihara. Are you there? Reply STOP to opt out."
// Used by every first-text path: website forms (formIntroTexts.js), Facebook / Instagram and Toorak
// leads (leads/facebookIntroText.js) and the /deal price signup (vtextAutoSignupService.js).
// Follow-up texts are separate and unchanged. Change the wording here only.

/**
 * @param {string} [firstName] - already cleaned up; blank when there is no safe first name
 * @returns {string}
 */
function firstLeadText(firstName) {
  const name = String(firstName || "").trim();
  const greeting = name ? `Hi ${name} - this is Maya` : "Hi, this is Maya";
  return `${greeting} from Vihara. Are you there? Reply STOP to opt out.`;
}

module.exports = { firstLeadText };
