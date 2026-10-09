// services/vtext/vtextFollowUpSequence.js
//
// The copy and timing rules for the follow-up texts that go to a lead who
// signed up on a property auction page and has not replied, registered or
// booked a call. Seven steps, one a day, starting the day after signup:
//
//   1..7  signup day + 1 .. signup day + 7
//
// Rules:
//   - one automatic text per person per day; the signup text counts
//   - a step whose day has already passed is skipped, never sent late
//   - nothing goes out on or after the auction day, so a close auction cuts the sequence short
//
// PLACEHOLDER COPY: swap the strings in STEPS for the final text. Nothing else
// in the follow-up code depends on the wording. Placeholders are the {{keys}}
// from vtextTemplateService.TEMPLATE_VARIABLES.
const { DateTime } = require("luxon");

const SEQUENCE_VERSION = 3; // 1 = old 7-step (unset), 2 = the 4-step auction-dated one; both are ended on sight

const STEPS = [
  {
    step: 1,
    offsetDays: 1,
    body: "Hi {{name}}, it's Vihara following up on your price for {{property_address}}. Any questions about the property or how quotes work? Reply here anytime. Reply STOP to opt out.",
    required: ["property_address"],
  },
  {
    step: 2,
    offsetDays: 2,
    body: "Hi {{name}}, just checking you saw our note about {{property_address}}. Happy to walk you through the next steps whenever suits you.",
    required: ["property_address"],
  },
  {
    step: 3,
    offsetDays: 3,
    body: "Hi {{name}}, quotes on {{property_address}} close on a set date, so we wanted to make sure you didn't miss it. Details: {{listing_url}}",
    required: ["property_address", "listing_url"],
  },
  {
    step: 4,
    offsetDays: 4,
    body: "Hi {{name}}, if the price you submitted for {{property_address}} needs adjusting, reply with a new number and we'll update it.",
    required: ["property_address"],
  },
  {
    step: 5,
    offsetDays: 5,
    body: "Hi {{name}}, still thinking it over? Tell us what would help most (photos, financing, timing) and we'll send it.",
    required: [],
  },
  {
    step: 6,
    offsetDays: 6,
    body: "Hi {{name}}, your advisor can talk through {{property_address}} by phone if that's easier. Reply with a good time.",
    required: ["property_address"],
  },
  {
    step: 7,
    offsetDays: 7,
    body: "Hi {{name}}, this is our last note about {{property_address}} for now. If you'd like to continue, reply here anytime or visit {{listing_url}}. Reply STOP to opt out.",
    required: ["property_address", "listing_url"],
  },
];

const TOTAL_STEPS = STEPS.length;

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
  valuesForStep,
  planFollowUps,
};
