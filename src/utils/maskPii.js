// utils/maskPii.js
//
// Masks customer emails and phone numbers for log lines, so Render logs don't
// collect full contact details but a person can still be recognised:
//   maskEmail("jane.doe@gmail.com") -> "j***@gmail.com"
//   maskPhone("+1 (555) 123-4567")  -> "***4567"

const maskEmail = (email) => {
  if (email === undefined || email === null || email === "") return email;
  const s = String(email).trim();
  const at = s.lastIndexOf("@");
  if (at < 1) return "***";
  return `${s[0]}***${s.slice(at)}`;
};

const maskPhone = (phone) => {
  if (phone === undefined || phone === null || phone === "") return phone;
  const digits = String(phone).replace(/\D/g, "");
  return digits.length >= 4 ? `***${digits.slice(-4)}` : "***";
};

module.exports = { maskEmail, maskPhone };
