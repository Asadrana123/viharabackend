// utils/internationalPhone.js
//
// General E.164 phone normalizer for Vtext's shared (channel-agnostic)
// address handling — unlike usPhone.js's toUsSmsNumber (deliberately strict
// US-only, built for Brevo's US-only toll-free SMS number), Vtext's
// primary channel is iMessage, which reaches any country. Using the US-only
// validator here was a real bug, found during the first real-device test:
// a reply to a real Indian contact was rejected outbound ("to is not a
// valid US phone number") and the same contact was marked phoneStatus
// "invalid" on the inbound side, which separately blocks it in the
// compliance gate too — both via code that quietly assumed every Vtext
// contact is a US number.
//
// This is intentionally more permissive than NANP-style format checking
// (no area-code/exchange-can't-start-with-0/1 rule — that's a US-specific
// convention with no equivalent that generalizes to other countries): any
// string that's a '+' followed by 7-15 digits, the first of which isn't 0,
// is accepted as a plausible E.164 number. A bare 10-digit number with no
// '+' is still assumed US (same convenience toUsSmsNumber offers), since
// that's overwhelmingly how US numbers get typed into admin tools.
const E164 = /^\+[1-9]\d{6,14}$/;

const normalizeInternationalPhone = (raw) => {
  const input = String(raw || "").trim();
  if (!input) return null;

  if (input.startsWith("+")) {
    const compact = `+${input.slice(1).replace(/\D/g, "")}`;
    return E164.test(compact) ? compact : null;
  }

  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) {
    const withCountryCode = `+1${digits}`;
    return E164.test(withCountryCode) ? withCountryCode : null;
  }

  // No '+' and not a bare 10-digit number -> ambiguous (which country?) —
  // reject rather than guess.
  return null;
};

module.exports = { normalizeInternationalPhone };
