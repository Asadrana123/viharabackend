// controller/leads/dealSheetController.js
//
// The /deal form's private deal sheet endpoints (config/dealSheet.js, services/dealSheet/).
//
// The form's own (it gets leadId + key back from POST /api/v1/property-lead/:slug/register with form "deal"):
//   POST /api/v1/property-lead/lead/:id/phone         { key, phone, smsConsent, smsConsentText }  resend / new number
//   POST /api/v1/property-lead/lead/:id/phone/verify  { key, code }                               check the code
//   POST /api/v1/property-lead/lead/:id/email         { key, email }                              "Wrong email?"
// The website's (vihara.ai/s/<token> and vihara.ai/b/<ref>):
//   GET  /api/v1/deal-sheet/:token?v=<marker>   the sheet's data; ?v= (texted link only) confirms the number
//   GET  /api/v1/deal-sheet/book/:ref?k=...     where /b/<ref> redirects: the strategy call, then the walkthrough
const crypto = require("crypto");
const mongoose = require("mongoose");
const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");
const PropertyLead = require("../../model/leads/propertyLeadModel");
const productModel = require("../../model/property/productModel");
const { normalisePhone } = require("../../services/calling/vapiCallsService");
const isValidEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e) && e.length <= 254;
const { sendCode, verifyCode } = require("../../services/dealSheet/phoneCodeService");
const { confirmPhone } = require("../../services/dealSheet/phoneVerified");
const dealSheetService = require("../../services/dealSheet/dealSheetService");
const { bookByDate, dealFields } = require("../../services/dealSheet/dealSheetData");
const { sheetUrl, bookKey, STRATEGY_CALL_URL, WALKTHROUGH_URL } = require("../../config/dealSheet");

const NOT_FOUND = "We couldn't find that deal sheet.";

const sameSecret = (a, b) => {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** The lead, only when the request carries its key. */
async function leadWithKey(req) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return null;
  const lead = await PropertyLead.findById(id).select("+accessKey").lean();
  if (!lead || lead.form !== "deal" || !sameSecret(req.body?.key, lead.accessKey)) return null;
  return lead;
}

const streetOf = async (slug) => {
  const p = await productModel.findOne({ slug }).select("street productName").lean();
  return p?.street || p?.productName || "";
};

const CODE_ERRORS = {
  limit: ["We've sent the most codes we can for now. Use the link in the text, or try again tomorrow.", 429],
  blocked: ["We couldn't text that number. Check it and try again.", 422],
  error: ["We couldn't send the text just now. Try again in a moment.", 502],
};

/** POST /lead/:id/phone — Resend, or send to a corrected number ("Change number"). */
const sendPhoneCode = catchAsyncError(async (req, res, next) => {
  const lead = await leadWithKey(req);
  if (!lead) return next(new ErrorHandler(NOT_FOUND, 404));

  const phone = normalisePhone(req.body.phone || lead.phone);
  if (!phone) return next(new ErrorHandler("Enter a valid mobile number.", 400));

  // The consent box may have changed on the way back ("Change number" shows the form again).
  const consentSet =
    typeof req.body.smsConsent === "boolean"
      ? {
          consent: req.body.smsConsent,
          smsConsent: req.body.smsConsent,
          smsConsentText: req.body.smsConsent ? String(req.body.smsConsentText || "").slice(0, 2000) : "",
          smsConsentAt: req.body.smsConsent ? new Date() : null,
        }
      : {};

  let existingLeadId = null;
  if (phone !== lead.phoneNormalized) {
    // A number that already has a lead for this deal: send the code as normal and tie it to THAT lead on the
    // backend; the buyer sees nothing different (Prajwal, 21 Nov 2026).
    const existing = await PropertyLead.findOne({ propertySlug: lead.propertySlug, phoneNormalized: phone, _id: { $ne: lead._id } })
      .select("_id")
      .lean();
    if (existing) {
      existingLeadId = existing._id;
      if (Object.keys(consentSet).length) await PropertyLead.updateOne({ _id: lead._id }, { $set: consentSet });
    } else {
      try {
        await PropertyLead.updateOne(
          { _id: lead._id },
          { $set: { phone: String(req.body.phone).trim(), phoneNormalized: phone, phoneVerifiedAt: null, phoneVerifyMethod: "", ...consentSet } }
        );
      } catch (err) {
        if (err?.code !== 11000) throw err;
        return next(new ErrorHandler(CODE_ERRORS.error[0], 409)); // registered a moment ago; rare
      }
    }
  } else if (Object.keys(consentSet).length) {
    await PropertyLead.updateOne({ _id: lead._id }, { $set: consentSet });
  }

  const result = await sendCode(lead, { phone, street: await streetOf(lead.propertySlug), existingLeadId });
  if (!result.ok) {
    const [message, status] = CODE_ERRORS[result.reason] || CODE_ERRORS.error;
    return next(new ErrorHandler(message, status));
  }
  res.json({ success: true });
});

const VERIFY_ERRORS = {
  mismatch: "That code doesn't match. Check the text and try again.",
  expired: "That code has expired. Tap Resend for a new one.",
  attempts: "Too many tries. Tap Resend for a new code.",
};

/** POST /lead/:id/phone/verify — check the 6-digit code. */
const verifyPhoneCode = catchAsyncError(async (req, res, next) => {
  const lead = await leadWithKey(req);
  if (!lead) return next(new ErrorHandler(NOT_FOUND, 404));

  const result = await verifyCode(lead, req.body.code);
  if (!result.ok) return next(new ErrorHandler(VERIFY_ERRORS[result.reason] || VERIFY_ERRORS.mismatch, 400));

  if (result.existingLeadId) {
    // The confirmed number belongs to an older lead for this deal: that lead is the one Maya calls.
    await PropertyLead.updateOne({ _id: lead._id }, { $set: { duplicateOf: result.existingLeadId, callingStopped: true } });
  }
  await confirmPhone(result.verifiedLeadId, "code");
  res.json({ success: true, sheetUrl: sheetUrl(lead.dealSheet.token) });
});

/** POST /lead/:id/email — "Wrong email?": change it, rebuild the sheet and send it again. */
const changeEmail = catchAsyncError(async (req, res, next) => {
  const lead = await leadWithKey(req);
  if (!lead) return next(new ErrorHandler(NOT_FOUND, 404));
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!isValidEmail(email)) return next(new ErrorHandler("That email doesn't look complete. Check it and try again.", 400));
  if (email !== lead.email) await PropertyLead.updateOne({ _id: lead._id }, { $set: { email } });
  dealSheetService.onEmailChanged(lead._id);
  res.json({ success: true });
});

/** GET /deal-sheet/:token — the sheet's data for vihara.ai/s/<token>. Counts the open; ?v= confirms the number. */
const getDealSheet = catchAsyncError(async (req, res, next) => {
  const token = String(req.params.token || "");
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return next(new ErrorHandler(NOT_FOUND, 404));
  let lead = await PropertyLead.findOne({ "dealSheet.token": token }).lean();
  if (!lead) return next(new ErrorHandler(NOT_FOUND, 404));

  const marker = String(req.query.v || "");
  if (marker && !lead.phoneVerifiedAt && !lead.duplicateOf && sameSecret(marker, lead.dealSheet.marker)) {
    if (await confirmPhone(lead._id, "sms_link")) lead = await PropertyLead.findById(lead._id).lean();
  }

  const now = new Date();
  await PropertyLead.updateOne(
    { _id: lead._id },
    { $inc: { "dealSheet.openCount": 1 }, $set: { "dealSheet.lastOpenedAt": now, ...(lead.dealSheet.firstOpenedAt ? {} : { "dealSheet.firstOpenedAt": now }) } }
  );

  const found = await dealSheetService.sheetFor(lead);
  if (!found) return next(new ErrorHandler(NOT_FOUND, 404));
  res.set("Cache-Control", "no-store");
  // Download PDF goes through vihara.ai/s/<token>/pdf (Cloudinary won't deliver PDFs directly).
  res.json({ success: true, sheet: found.sheet, pdfUrl: lead.dealSheet.pdfUrl ? `${sheetUrl(token)}/pdf` : "" });
});

/** GET /deal-sheet/:token/pdf — the latest PDF's bytes, for vihara.ai/s/<token>/pdf. */
const getDealSheetPdf = catchAsyncError(async (req, res, next) => {
  const token = String(req.params.token || "");
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return next(new ErrorHandler(NOT_FOUND, 404));
  const lead = await PropertyLead.findOne({ "dealSheet.token": token }).lean();
  const pdf = lead && (await dealSheetService.latestPdf(lead));
  if (!pdf) return next(new ErrorHandler(NOT_FOUND, 404));
  const street = (await streetOf(lead.propertySlug)).replace(/[^A-Za-z0-9 .-]/g, "");
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="Vihara deal sheet - ${street}.pdf"`,
    "Cache-Control": "private, no-store",
  });
  res.send(pdf);
});

/** GET /deal-sheet/book/:ref — where vihara.ai/b/<ref> sends the buyer. */
const getBookingLink = catchAsyncError(async (req, res) => {
  // "VH-ABCD" or "VH-ABCD.<key>" (the email's link carries the key in the path: it can't have a query string).
  const [refPart, keyInPath = ""] = String(req.params.ref || "").split(".");
  const ref = refPart.toUpperCase();
  const linkKey = String(req.query.k || keyInPath);
  const utm = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content"]) {
    if (req.query[k]) utm[k] = String(req.query[k]).slice(0, 100);
  }

  const lead = /^VH-[A-Z0-9]{4}$/.test(ref) ? await PropertyLead.findOne({ ref }).lean() : null;
  if (!lead) {
    return res.json({ success: true, url: `${STRATEGY_CALL_URL}?${new URLSearchParams(utm)}` });
  }

  const product = await productModel.findOne({ slug: lead.propertySlug }).select("slug state zipCode auctionStartDate").lean();
  const by = bookByDate(dealFields(product || {}));
  // After the book-by date (sale − 2 days): the public walkthrough instead of the founder call.
  const late = by && Date.now() > by.getTime();
  const q = new URLSearchParams(utm);
  if (sameSecret(linkKey, bookKey(lead.dealSheet?.token))) {
    q.set("name", lead.fullName);
    q.set("email", lead.email);
  }
  // Hidden fields: the cal.com webhook ties the booking back to the lead.
  q.set("metadata[ref]", lead.ref);
  q.set("metadata[slug]", lead.propertySlug);
  q.set("metadata[leadId]", String(lead._id));

  await PropertyLead.updateOne({ _id: lead._id }, { $inc: { "dealSheet.bookClicks": 1 } });
  console.log(`[deal-sheet] book link for ${lead.ref} (${utm.utm_source || "direct"})${late ? " — after book-by, walkthrough" : ""}`);
  res.json({ success: true, url: `${late ? WALKTHROUGH_URL : STRATEGY_CALL_URL}?${q}` });
});

module.exports = { sendPhoneCode, verifyPhoneCode, changeEmail, getDealSheet, getDealSheetPdf, getBookingLink };
