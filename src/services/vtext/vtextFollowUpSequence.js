// services/vtext/vtextFollowUpSequence.js
//
// The copy and timing for the daily follow-up texts that go to a lead who
// registered on a property auction page and has not replied. PLACEHOLDER
// COPY: swap the strings in STEP_BODIES for the final text. Nothing else in
// the follow-up code depends on the wording.
//
// Variables: {{greeting}} ("Hi Sam," or "Hi,"), {{property_address}},
// {{auction_url}}, plus everything vtextTemplateService.resolvePropertyVariables
// produces (listing_url, property_name, ...).
const { renderTemplate, resolvePropertyVariables } = require("./vtextTemplateService");

const SITE_DOMAIN = "vihara.ai";

const STEP_BODIES = [
  "{{greeting}} it's Vihara following up on your price for {{property_address}}. Any questions about the property or how quotes work? Reply here anytime. Reply STOP to opt out.",
  "{{greeting}} just checking you saw our note about {{property_address}}. Happy to walk you through the next steps whenever suits you.",
  "{{greeting}} quotes on {{property_address}} close on a set date, so we wanted to make sure you didn't miss it. Details: {{auction_url}}",
  "{{greeting}} if the price you submitted for {{property_address}} needs adjusting, reply with a new number and we'll update it.",
  "{{greeting}} still thinking it over? Tell us what would help most (photos, financing, timing) and we'll send it.",
  "{{greeting}} your advisor can talk through {{property_address}} by phone if that's easier. Reply with a good time.",
  "{{greeting}} this is our last note about {{property_address}} for now. If you'd like to continue, reply here anytime or visit {{auction_url}}. Reply STOP to opt out.",
];

const TOTAL_STEPS = STEP_BODIES.length;

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

function greetingFor(name) {
  const first = String(name || "").trim().split(/\s+/)[0];
  return first ? `Hi ${first},` : "Hi,";
}

/**
 * @param {number} step - 1-based step number
 * @param {{ name?: string, product?: object }} ctx - contact name and a lean productModel doc (may be null)
 * @returns {string|null} the rendered text, or null for a step outside 1..TOTAL_STEPS
 */
function renderFollowUpBody(step, { name, product } = {}) {
  const template = STEP_BODIES[step - 1];
  if (!template) return null;
  const propertyValues = product ? resolvePropertyVariables(product) : {};
  const values = {
    ...propertyValues,
    greeting: greetingFor(name),
    property_address: propertyValues.property_address || "your property",
    auction_url: product?.slug ? `https://${SITE_DOMAIN}/auction/${product.slug}` : `https://${SITE_DOMAIN}`,
  };
  return renderTemplate(template, values);
}

module.exports = { TOTAL_STEPS, WINDOWS, windowForStep, renderFollowUpBody };
