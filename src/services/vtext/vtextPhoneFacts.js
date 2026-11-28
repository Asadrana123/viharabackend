// services/vtext/vtextPhoneFacts.js
//
// What we have learned about a contact's number, in one place, so every sender (forms, follow-ups, bulk scripts,
// the Inbox) obeys the same facts. Everything texts through enqueueOutbound → the compliance gate → the router:
//   - phoneStatus "invalid" / "landline": the compliance gate blocks every text (vtextComplianceService)
//   - iMessage "not reachable": the router skips the Mac and sends by Twilio SMS (vtextRouter)
// Sources: Twilio Lookup (phoneLookupService), the free format check, and Twilio's own send/receipt errors.
const IMESSAGE = "imessage-bluebubbles";

// Twilio errors that say something about the NUMBER (not the line, not a passing outage).
//   21211 "not a valid phone number" (send refused)   30005 "unknown destination": the number doesn't exist
//   21614 "not a valid mobile number" (send refused)  30006 "landline or unreachable carrier"
// 30003 (handset off / out of coverage) is left alone: that one passes.
const STATUS_FOR_TWILIO_ERROR = {
  21211: "invalid",
  30005: "invalid",
  21614: "landline",
  30006: "landline",
};

/** "TWILIO_21211" | "21211" | 21211 → "invalid" | "landline" | null */
function phoneStatusForTwilioError(code) {
  const n = Number(String(code ?? "").replace(/^TWILIO_/, ""));
  return STATUS_FOR_TWILIO_ERROR[n] || null;
}

/**
 * Record a Twilio number error on the contact so no later text (any script, any automation) tries it again.
 * Saves the contact. Returns the new status, or null when nothing changed.
 */
async function recordTwilioNumberError(contact, code) {
  const status = phoneStatusForTwilioError(code);
  if (!contact || !status || contact.phoneStatus === status) return null;
  contact.phoneStatus = status;
  await contact.save();
  return status;
}

/** Set the router's iMessage reachability on the contact (does not save). */
function setIMessageReachable(contact, reachable, now = new Date()) {
  contact.channelReachability = contact.channelReachability || [];
  const entry = contact.channelReachability.find((r) => r.channelType === IMESSAGE);
  if (entry) {
    entry.reachable = reachable;
    entry.checkedAt = now;
  } else {
    contact.channelReachability.push({ channelType: IMESSAGE, reachable, checkedAt: now });
  }
}

/** They texted us, so the number takes texts: undo an "invalid" / "landline" we guessed earlier. Does not save. */
function markTextable(contact) {
  if (contact && (contact.phoneStatus === "invalid" || contact.phoneStatus === "landline" || contact.phoneStatus === "unknown")) {
    contact.phoneStatus = "valid";
    return true;
  }
  return false;
}

module.exports = { phoneStatusForTwilioError, recordTwilioNumberError, setIMessageReachable, markTextable, IMESSAGE };
