// controller/property/sellingController.js
//
// POST /api/sellProperty (public, rate-limited, captcha) — the "Sell your property" form.
// Saves the submission and, when the SMS box is ticked, queues the Sell text through Vtext
// (vtextFormIntroService, off unless "sell" is in VTEXT_FORM_TEXTS). The website emails the
// team through web3forms as before, so this never blocks or replaces that.
const catchAsyncError = require("../../middleware/catchAsyncError");
const Errorhandler = require("../../utils/errorhandler");
const SellerForm = require("../../model/property/sellingModel");
const { toUsSmsNumber } = require("../../utils/usPhone");
const { maybeSendFormIntroText } = require("../../services/vtext/vtextFormIntroService");

const TEXT_FIELDS = [
  "firstName", "lastName", "email", "phoneNumber", "propertyAddress", "city", "state", "zip",
  "propertyCondition", "propertyType", "numberOfProperties", "propertyMarketHistory", "propertyOccupancy",
  "mortgageExist", "mortgageRange", "relationshipWithProperty", "sellingTime",
];
const str = (v, max = 300) => String(v ?? "").trim().slice(0, max);
const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

exports.sellProperty = catchAsyncError(async (req, res, next) => {
  const body = req.body || {};
  const fields = Object.fromEntries(TEXT_FIELDS.map((k) => [k, str(body[k])]));
  if (!fields.firstName || !fields.email || !fields.phoneNumber) {
    return next(new Errorhandler("First name, email and phone are required", 400));
  }
  const smsConsent = body.smsConsent === true;

  const isNew = !(await SellerForm.exists({ email: fields.email.toLowerCase() }));
  const lead = await SellerForm.create({
    ...fields,
    phoneNormalized: toUsSmsNumber(fields.phoneNumber) || "",
    minDesiredPrice: num(body.minDesiredPrice),
    maxDesiredPrice: num(body.maxDesiredPrice),
    smsConsent,
    smsConsentText: smsConsent ? str(body.smsConsentText, 1000) : "",
    smsConsentAt: smsConsent ? new Date() : null,
  });

  res.status(200).json({ success: true });

  // One Sell text per person: a second submission from the same email gets none.
  if (isNew) {
    maybeSendFormIntroText({ form: "sell", leadType: "sell", lead, name: `${lead.firstName} ${lead.lastName}`.trim() });
  }
});
