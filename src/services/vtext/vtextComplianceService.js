// services/vtext/vtextComplianceService.js
//
// canSend() is the compliance gate from sendify-infra.md §6.3 — checked at
// enqueue, route, and send time once the real queue exists (Phase 2), but
// the gate itself exists from Phase 1 day one per that section's own
// instruction, so nothing can ever ship without it already wired in.
//
// Order of checks (do not reorder — each one is a harder stop than the next):
//   1. opted out -> always blocked (exceptions: the system stop-confirm and
//      help replies — both must always be deliverable regardless of
//      marketing opt-out status, same as every carrier's own STOP/HELP
//      convention; a resubscribe-confirm needs no exception since the
//      contact is no longer opted out by the time it's sent)
//   2. phone status invalid/landline -> blocked
//   3. consent: opted-in -> allow; a reply to a recent inbound -> allow
//      (conversational exemption); otherwise -> blocked
const CONVERSATIONAL_WINDOW_DAYS = Number(process.env.VTEXT_CONVERSATIONAL_WINDOW_DAYS || 30);
const SYSTEM_BYPASS_TEMPLATES = new Set(["stop-confirm", "help"]);

/**
 * @param {object} contact - a vtextContactModel document (or plain object with the same shape)
 * @param {object} [message] - { isReplyToInbound, origin: { kind, templateKey } }
 * @param {object} [context] - { lastInboundAt } — when was this contact's last inbound message on the thread in question
 * @returns {{ allowed: boolean, reason?: string, errorKind?: string }}
 */
function canSend(contact, message = {}, context = {}) {
  // A system bypass template short-circuits the ENTIRE gate, not just the
  // opt-out check — found the hard way: a first version only skipped the
  // opt-out block, so a stop-confirm reply (sent to a contact whose
  // consent.status is now necessarily "opted-out", since that's the write
  // that triggered sending it) fell straight through into the consent check
  // below and got blocked there instead, by the very thing it existed to
  // confirm. STOP/HELP must always be deliverable, full stop — that's the
  // whole point of them being on the bypass list.
  if (message.origin?.kind === "system" && SYSTEM_BYPASS_TEMPLATES.has(message.origin?.templateKey)) {
    return { allowed: true };
  }

  if (contact?.optOut?.isOptedOut) {
    return { allowed: false, reason: "contact has opted out", errorKind: "compliance" };
  }

  if (contact?.phoneStatus === "invalid" || contact?.phoneStatus === "landline") {
    return { allowed: false, reason: `phone status is "${contact.phoneStatus}"`, errorKind: "compliance" };
  }

  if (contact?.consent?.status === "opted-in") {
    return { allowed: true };
  }

  if (message.isReplyToInbound && context.lastInboundAt) {
    const ageMs = Date.now() - new Date(context.lastInboundAt).getTime();
    const withinWindow = ageMs <= CONVERSATIONAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (withinWindow) {
      return { allowed: true };
    }
  }

  return { allowed: false, reason: "no consent on file and not a timely reply to an inbound message", errorKind: "compliance" };
}

// §6.2 step 6: keyword detection on inbound text. Err toward opting out on
// an ambiguous phrase — the FCC's revocation rule requires honoring opt-outs
// "by any reasonable means," so a false-positive opt-out (someone meant
// something else) is a far smaller problem than missing a real one.
const STOP_EXACT = new Set([
  "STOP", "STOPALL", "STOP ALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT", "OPT OUT",
]);
const STOP_PHRASES = [
  "stop texting", "stop messaging", "remove me", "take me off", "do not text", "don't text",
  "unsubscribe me", "wrong number",
];
const HELP_EXACT = new Set(["HELP", "INFO"]);
const START_EXACT = new Set(["START", "UNSTOP", "YES"]);

/** Trim, uppercase, strip punctuation/emoji, collapse whitespace — for matching against the exact-phrase sets above. */
function normalizeForKeywordMatch(body) {
  return String(body || "")
    .trim()
    .toUpperCase()
    .replace(/[^\w\s]/gu, "") // strips punctuation and most emoji (non-word, non-space chars)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} body - raw inbound message text
 * @returns {{ type: "stop"|"help"|"start"|null, matched: string|null, method: "exact"|"phrase"|null }}
 */
function detectKeyword(body) {
  const normalized = normalizeForKeywordMatch(body);
  if (!normalized) return { type: null, matched: null, method: null };

  if (STOP_EXACT.has(normalized)) {
    return { type: "stop", matched: normalized, method: "exact" };
  }
  const lower = normalized.toLowerCase();
  const phraseHit = STOP_PHRASES.find((p) => lower.includes(p));
  if (phraseHit) {
    return { type: "stop", matched: phraseHit, method: "phrase" };
  }
  if (HELP_EXACT.has(normalized)) {
    return { type: "help", matched: normalized, method: "exact" };
  }
  if (START_EXACT.has(normalized)) {
    return { type: "start", matched: normalized, method: "exact" };
  }
  return { type: null, matched: null, method: null };
}

module.exports = { canSend, detectKeyword, CONVERSATIONAL_WINDOW_DAYS };
