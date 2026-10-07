// services/vtext/vtextFollowUpSequence.js
//
// The copy and timing rules for the follow-up texts that go to a lead who
// signed up on a property auction page and has not replied, registered or
// booked a call. Four steps, each with a target day:
//
//   1  the day after signup           (signup-based)
//   2  three days after signup        (signup-based)
//   3  three days before the auction  (auction-based)
//   4  the day before the auction     (auction-based)
//
// Rules (from the sending rules in the Vtext copy spec):
//   - one automatic text per person per day; the signup text counts
//   - a step whose day has already passed is skipped, never sent late
//   - when two steps want the same day, the auction-based one wins
//   - nothing goes out on or after the auction day
//
// Placeholders are the {{keys}} from vtextTemplateService.TEMPLATE_VARIABLES.
const { DateTime } = require("luxon");

const ADVISOR_CALL_URL = "https://cal.com/vihara-ai-advisor/walkthrough";
const SEQUENCE_VERSION = 2; // contacts enrolled under the old 7-step sequence have none

const STEPS = [
  {
    step: 1,
    anchor: "signup",
    offsetDays: 1,
    body: "Hi {{name}}, quick one: bidding on {{property_short}} starts at {{opening_bid}} on {{auction_date}}. Registering is free: {{listing_url}}",
    required: ["property_short", "opening_bid", "auction_date", "listing_url"],
  },
  {
    step: 2,
    anchor: "signup",
    offsetDays: 3,
    body: `Most buyers set their max with an advisor before bidding. Want 15 min on {{property_short}}? Pick a time: ${ADVISOR_CALL_URL}`,
    required: ["property_short"],
  },
  {
    step: 3,
    anchor: "auction",
    offsetDays: -3,
    body: "Registration has to happen early so the team can verify them. {{property_short}} goes to auction {{auction_date}}. Register now so we can verify you in time: {{listing_url}}",
    required: ["property_short", "auction_date", "listing_url"],
  },
  {
    step: 4,
    anchor: "auction",
    offsetDays: -1,
    body: "Last call. Tomorrow's the day! {{property_short}} goes to auction {{auction_time}}. Still time to register: {{listing_url}}",
    // The time is optional: without it the text says "tomorrow". The date is needed to schedule the step at all.
    required: ["property_short", "auction_date", "listing_url"],
    fallbacks: { auction_time: "tomorrow" },
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
 * @param {string|null} p.auctionDay - the auction's calendar day ("YYYY-MM-DD"), or null when the property has no date
 * @param {number[]} [p.doneSteps] - steps already sent or skipped
 * @param {string[]} [p.takenDays] - local days that already had an automatic text (the signup day, the last follow-up's day)
 * @returns {{ step: number, day: string }[]}
 */
function planFollowUps({ signupDay, today, auctionDay, doneSteps = [], takenDays = [] }) {
  const candidates = [];
  for (const def of STEPS) {
    if (doneSteps.includes(def.step)) continue;
    // Steps that quote the auction date can't be scheduled without one.
    if (def.required.includes("auction_date") && !auctionDay) continue;

    const base = def.anchor === "auction" ? auctionDay : signupDay;
    if (!base) continue;
    const day = DateTime.fromISO(base, { zone: "utc" }).plus({ days: def.offsetDays }).toISODate();

    if (day < today) continue; // its day has passed
    if (auctionDay && day >= auctionDay) continue; // the auction has started or is today
    if (takenDays.includes(day)) continue; // one text a day
    candidates.push({ step: def.step, day, anchor: def.anchor });
  }

  // One per day. Auction-based steps beat signup-based ones.
  const byDay = new Map();
  for (const c of candidates) {
    const current = byDay.get(c.day);
    if (!current || (c.anchor === "auction" && current.anchor !== "auction")) byDay.set(c.day, c);
  }
  return [...byDay.values()]
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.step - b.step))
    .map(({ step, day }) => ({ step, day }));
}

module.exports = {
  ADVISOR_CALL_URL,
  SEQUENCE_VERSION,
  TOTAL_STEPS,
  WINDOWS,
  windowForStep,
  stepDefinition,
  valuesForStep,
  planFollowUps,
};
