// utils/usPhone.js
//
// Strict US formatter for SMS. Brevo's toll-free number only texts US numbers,
// and the handout requires "+1 followed by 10 digits". Returns the canonical
// "+1XXXXXXXXXX" or null when the number can't be a valid US mobile/landline.
//
//   "+1 (415) 555-0123" -> "+14155550123"
//   "4155550123"        -> "+14155550123"
//   "+44 20 7946 0958"  -> null   (non-US)
//   "+1 015 555 0123"   -> null   (area code can't start with 0/1)

const NANP_10 = /^[2-9]\d{2}[2-9]\d{6}$/; // area code + exchange can't start with 0 or 1

const toUsSmsNumber = (raw) => {
  const input = String(raw || "").trim();
  if (!input) return null;

  const digits = input.replace(/\D/g, "");
  let national;
  if (digits.length === 11 && digits.startsWith("1")) {
    national = digits.slice(1);
  } else if (digits.length === 10 && !input.startsWith("+")) {
    national = digits; // bare 10-digit US number, no country code typed
  } else {
    return null;
  }

  return NANP_10.test(national) ? `+1${national}` : null;
};

module.exports = { toUsSmsNumber };
