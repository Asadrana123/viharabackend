// Checks the `limits` an admin saves on a line (PATCH /vtext/lines/:id, and the add-line form).
//
// A limit that is left out falls back to the channel's default (capacity's limitsFor), so "reset to default" is just
// saving the object without that key. A limit that is present must be a sensible whole number: a 0 or a typo like
// 10000 per minute would silently stop a line or remove its protection.
//
// Only the keys the admin screen edits are checked here. The other keys the model keeps (replyReservePct, jitterMs)
// are passed through as they are.

const LIMIT_RULES = {
  perMinute: { label: "Per minute", max: 60 },
  perDay: { label: "Per day", max: 5000 },
  newRecipientsPerHour: { label: "New people per hour", max: 1000 },
};

/**
 * @param {object|undefined|null} limits
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateLimits(limits) {
  if (limits === undefined || limits === null) return { ok: true, errors: [] };
  if (typeof limits !== "object" || Array.isArray(limits)) return { ok: false, errors: ["limits must be an object"] };

  const errors = [];
  for (const [key, { label, max }] of Object.entries(LIMIT_RULES)) {
    const value = limits[key];
    if (value === undefined || value === null) continue; // not set: the channel default applies
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      errors.push(`${label} must be a whole number of 1 or more`);
    } else if (value > max) {
      errors.push(`${label} can't be more than ${max}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

module.exports = { validateLimits, LIMIT_RULES };
