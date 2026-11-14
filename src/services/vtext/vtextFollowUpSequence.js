// services/vtext/vtextFollowUpSequence.js
//
// The copy and timing rules for the follow-up texts that go to a lead who
// signed up on a property auction page and has not replied, registered or
// booked a call. Three steps, spread over a week:
//
//   1  signup day + 1
//   2  signup day + 3
//   3  signup day + 6
//
// Why three and spaced out (14 Nov 2026): the iMessage line providers (Linq, Photon, Blooio) all cap
// texts to someone who hasn't replied at 2-3, days apart, and treat more as a spam pattern that gets
// the Apple ID flagged. The sequence used to be 7 texts on 7 days, with memes on days 3-5.
//
// Rules:
//   - one automatic text per person per day; the signup text counts
//   - a step whose day has already passed is skipped, never sent late
//   - nothing goes out on or after the auction day, so a close auction cuts the sequence short
//   - text only: no images or links, since everyone here has not replied yet (vtextRichContentGate
//     would leave them out anyway)
//
// Each step has a few wordings. A contact always gets the same one for a step (picked from its id),
// and different contacts get different ones, so the line doesn't send one identical text to everyone
// (Blooio flags a repeated text as a template pattern).
//
// Copy: taken from the old 7-step texts. Swap the strings in STEPS for final wording if needed; nothing
// else in the follow-up code depends on it. Placeholders are the {{keys}} from
// vtextTemplateService.TEMPLATE_VARIABLES.
const { DateTime } = require("luxon");

// Left at 3 on purpose: sequences already running carry on under the new steps (steps they already got
// count as done; one that already had 3+ texts goes straight to the final reply wait). A new version
// would end every running sequence at once. 1 = old 7-step (unset), 2 = the 4-step auction-dated one.
const SEQUENCE_VERSION = 3;

const STEPS = [
  {
    step: 1,
    offsetDays: 1,
    bodies: [
      "Hi {{name}}, checking in to see if you will be participating in the auction?",
      "Hi {{name}}, just following up. Are you planning to take part in the auction?",
    ],
    required: [],
  },
  {
    step: 2,
    offsetDays: 3,
    bodies: [
      "Hi {{name}}, wanted to check whether you're still interested in bidding. Happy to answer any questions.",
      "Hi {{name}}, are you still thinking about joining the auction? Let us know if anything is holding you back.",
      "Hi {{name}}, quick check-in. Do you plan to bid? Reply here and we'll help you get set up.",
    ],
    required: [],
  },
  {
    step: 3,
    offsetDays: 6,
    bodies: [
      "Hi {{name}}, last check-in from us. Will you be participating in the auction?",
      "Hi {{name}}, checking in one last time. Will you be taking part in the auction?",
    ],
    required: [],
  },
];

const TOTAL_STEPS = STEPS.length;

/**
 * The wording a contact gets for a step: the same one every time for the same contact.
 * @param {object} def - a step from STEPS
 * @param {string|object} contactId
 * @returns {string}
 */
function bodyForContact(def, contactId) {
  const key = String(contactId || "");
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return def.bodies[hash % def.bodies.length];
}

// Local-time windows, in hours on a 24h clock. Odd steps go out at lunch,
// even steps in the evening, so reply rates can be compared by window.
const WINDOWS = [
  { startHour: 12, endHour: 14 },
  { startHour: 17, endHour: 19 },
];

/** @param {number} step - 1-based step number */
function windowForStep(step) {
  return WINDOWS[(step - 1) % WINDOWS.length];
}

/** @param {number} step - 1-based step number; undefined for a step outside 1..TOTAL_STEPS */
function stepDefinition(step) {
  return STEPS[step - 1];
}

/**
 * Values for one step: the contact/property values, plus the step's own
 * fallbacks for optional placeholders that came out empty.
 */
function valuesForStep(def, values) {
  const merged = { ...values };
  for (const [key, fallback] of Object.entries(def.fallbacks || {})) {
    if (!merged[key]) merged[key] = fallback;
  }
  return merged;
}

/**
 * Which steps can still go out, and on what local day, oldest day first.
 * Pure: nothing here touches the database.
 *
 * @param {object} p
 * @param {string} p.signupDay - local calendar day of the signup text, "YYYY-MM-DD"
 * @param {string} p.today - the contact's local calendar day right now, "YYYY-MM-DD"
 * @param {string|null} p.auctionDay - the auction's calendar day ("YYYY-MM-DD"), or null when the property has no date (then only the 7-day limit applies)
 * @param {number[]} [p.doneSteps] - steps already sent or skipped
 * @param {string[]} [p.takenDays] - local days that already had an automatic text (the signup day, the last follow-up's day)
 * @returns {{ step: number, day: string }[]}
 */
function planFollowUps({ signupDay, today, auctionDay, doneSteps = [], takenDays = [] }) {
  const plan = [];
  for (const def of STEPS) {
    if (doneSteps.includes(def.step)) continue;
    const day = DateTime.fromISO(signupDay, { zone: "utc" }).plus({ days: def.offsetDays }).toISODate();

    if (day < today) continue; // its day has passed
    if (auctionDay && day >= auctionDay) continue; // the auction has started or is today
    if (takenDays.includes(day)) continue; // one text a day
    plan.push({ step: def.step, day });
  }
  return plan.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.step - b.step));
}

module.exports = {
  SEQUENCE_VERSION,
  TOTAL_STEPS,
  WINDOWS,
  windowForStep,
  stepDefinition,
  bodyForContact,
  valuesForStep,
  planFollowUps,
};
