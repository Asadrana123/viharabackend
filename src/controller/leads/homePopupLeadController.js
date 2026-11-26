// controller/leads/homePopupLeadController.js
//
// Home page popup: full name, email, phone and cash / financing. Stored in Mongo, posted
// to Slack, and listed in Admin → Leads → "Home Popup".
//
// The phone is checked with a texted code (Twilio Verify, services/leads/twilioVerify.js).
// The lead is saved first and stays "Not verified" until the code is typed:
//   POST /api/v1/home-popup/submit               → { leadId, key, phoneVerified }
//   POST /api/v1/home-popup/:id/phone/send       { key, phone? }  text a code (phone = "Change number")
//   POST /api/v1/home-popup/:id/phone/verify     { key, code }    check it
const crypto = require("crypto");
const mongoose = require("mongoose");
const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");
const HomePopupLead = require("../../model/leads/homePopupLeadModel");
const { notifyNewLead } = require("../../services/shared/slackService");
const { getEmailEventsForEmails } = require("../../services/integrations/emailEventsService");
const { getNotesForLeads } = require("../../services/leads/leadNotesService");
const { listView, scopeQuery, unlessSummary, listSelect, shapeLeads } = require("../../services/leads/leadListView");
const { str, isValidEmail, attributionFrom, splitName } = require("../../services/leads/buyBox");
const { normalisePhone } = require("../../services/calling/vapiCallsService");
const { sendVerification, checkVerification } = require("../../services/leads/twilioVerify");
const { postToSlack } = require("../../services/shared/slackService");

const BUYER_TYPES = ["cash", "financing", "not_sure"];
const BUYER_TYPE_LABELS = { cash: "Cash buyer", financing: "Financing", not_sure: "Not sure yet" };
const TEST_NAME_REGEX = /test/i;
const LEAD_NOTE_TYPE = "homePopup"; // matches leadNoteModel.LEAD_TYPES

/**
 * POST /api/v1/home-popup/submit   (public)
 * Body: { full_name, email, phone, buyer_type, trigger, page_url, attribution }
 * Dedupe by email: a repeat submit updates the existing record.
 */
const submitHomePopupLead = catchAsyncError(async (req, res, next) => {
  const body = req.body || {};

  const fullName = str(body.full_name, 120).replace(/\s+/g, " ");
  const { firstName, lastName } = splitName(fullName);
  const email = str(body.email, 200).toLowerCase();
  const buyerType = str(body.buyer_type, 20);
  const phone = str(body.phone, 40);
  const phoneNormalized = normalisePhone(phone);

  if (!firstName || !lastName) return next(new ErrorHandler("Enter your first and last name", 400));
  if (!isValidEmail(email)) return next(new ErrorHandler("Enter a valid email address", 400));
  if (!phoneNormalized || phoneNormalized.replace(/\D/g, "").length < 10)
    return next(new ErrorHandler("Enter a valid phone number", 400));
  if (!BUYER_TYPES.includes(buyerType)) return next(new ErrorHandler("Choose cash or financing", 400));

  const fields = {
    fullName,
    firstName,
    lastName,
    email,
    phone,
    phoneNormalized,
    buyerType,
    trigger: body.trigger === "button" ? "button" : "auto",
    pageUrl: str(body.page_url, 2000),
    attribution: attributionFrom(body.attribution),
    submittedAt: new Date(),
  };

  const existing = await HomePopupLead.findOne({ email }).select("_id phoneNormalized phoneVerifiedAt").lean();
  // A new number has to be checked again.
  const keepVerified = !!existing?.phoneVerifiedAt && existing.phoneNormalized === phoneNormalized;
  if (!keepVerified) Object.assign(fields, { phoneVerifiedAt: null, phoneVerifyMethod: "" });
  // A fresh key on every submit: only this browser can send / check the code.
  const key = crypto.randomBytes(24).toString("hex");
  fields.accessKey = key;

  const lead = await HomePopupLead.findOneAndUpdate(
    { email },
    existing ? { $set: fields, $inc: { submissions: 1 } } : { $set: fields },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({ success: true, leadId: lead._id, key, phoneVerified: keepVerified, updated: !!existing });

  notifyNewLead({
    leadType: existing ? "Home Popup (updated)" : "Home Popup",
    name: lead.fullName,
    email: lead.email,
    phone: lead.phone,
    source: `home-popup · ${lead.attribution?.utm_source || "direct"}`,
    extraFields: [
      { label: "Buying with", value: BUYER_TYPE_LABELS[lead.buyerType] },
      { label: "Opened by", value: lead.trigger === "button" ? "Button" : "Auto (5s)" },
      { label: "Phone", value: keepVerified ? "Verified" : "Not verified yet (code being texted)" },
    ],
  }).catch((e) => console.error("[slack] home-popup notify failed:", e.message));
});

const sameSecret = (a, b) => {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
};

const NOT_FOUND = "We couldn't find your details. Close this and fill in the form again.";

/** The lead, only when the request carries its key. */
async function leadWithKey(req) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return null;
  const lead = await HomePopupLead.findById(id).select("+accessKey").lean();
  if (!lead || !sameSecret(req.body?.key, lead.accessKey)) return null;
  return lead;
}

const SENDS_PER_DAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const SEND_ERRORS = {
  invalid: ["That number can't get texts. Check it, or use a mobile number.", 422],
  country: ["We can only text US numbers for now.", 422],
  blocked: ["We couldn't text that number. Check it and try again.", 422],
  limit: ["We've sent the most codes we can for now. Try again later.", 429],
  not_configured: ["We couldn't send the text just now. Try again in a moment.", 503],
  error: ["We couldn't send the text just now. Try again in a moment.", 502],
};

/** POST /:id/phone/send — text a code; `phone` set = "Change number". */
const sendHomePopupCode = catchAsyncError(async (req, res, next) => {
  const lead = await leadWithKey(req);
  if (!lead) return next(new ErrorHandler(NOT_FOUND, 404));

  let phone = lead.phoneNormalized;
  const set = {};
  if (req.body.phone !== undefined) {
    const raw = str(req.body.phone, 40);
    phone = normalisePhone(raw);
    if (!phone || phone.replace(/\D/g, "").length < 10) return next(new ErrorHandler("Enter a valid phone number", 400));
    if (phone !== lead.phoneNormalized) Object.assign(set, { phone: raw, phoneNormalized: phone, phoneVerifiedAt: null, phoneVerifyMethod: "" });
  }
  if (lead.phoneVerifiedAt && !set.phoneNormalized) return res.json({ success: true, phoneVerified: true });

  const now = Date.now();
  const recent = (lead.phoneCodeSends || []).filter((t) => now - new Date(t).getTime() < DAY_MS);
  if (recent.length >= SENDS_PER_DAY) return next(new ErrorHandler(SEND_ERRORS.limit[0], 429));

  const result = await sendVerification(phone);
  // Every attempt counts (Twilio charges for the text either way).
  await HomePopupLead.updateOne({ _id: lead._id }, { $set: { ...set, phoneCodeSends: [...recent, new Date(now)] } });
  if (!result.ok) {
    const [message, status] = SEND_ERRORS[result.reason] || SEND_ERRORS.error;
    return next(new ErrorHandler(message, status));
  }
  res.json({ success: true, phoneVerified: false });
});

const CHECK_ERRORS = {
  mismatch: "That code doesn't match. Check the text and try again.",
  expired: "That code has expired. Tap Resend for a new one.",
  attempts: "Too many tries. Tap Resend for a new code.",
  error: "We couldn't check the code just now. Try again in a moment.",
  not_configured: "We couldn't check the code just now. Try again in a moment.",
};

/** POST /:id/phone/verify — check the code. */
const verifyHomePopupCode = catchAsyncError(async (req, res, next) => {
  const lead = await leadWithKey(req);
  if (!lead) return next(new ErrorHandler(NOT_FOUND, 404));
  if (lead.phoneVerifiedAt) return res.json({ success: true, phoneVerified: true });

  const result = await checkVerification(lead.phoneNormalized, req.body.code);
  if (!result.ok) {
    const status = result.reason === "error" || result.reason === "not_configured" ? 502 : 400;
    return next(new ErrorHandler(CHECK_ERRORS[result.reason] || CHECK_ERRORS.mismatch, status));
  }

  await HomePopupLead.updateOne({ _id: lead._id }, { $set: { phoneVerifiedAt: new Date(), phoneVerifyMethod: "code" } });
  res.json({ success: true, phoneVerified: true });

  const webhook = process.env.SLACK_LEADS_WEBHOOK_URL;
  if (webhook && !TEST_NAME_REGEX.test(lead.fullName || "")) {
    postToSlack(webhook, { text: `✅ *Phone confirmed* · ${lead.fullName} · Home Popup (entered the code)` }).catch((e) =>
      console.error("[slack] home-popup phone confirmed post failed:", e.message)
    );
  }
});

/**
 * GET /api/v1/home-popup?page=&limit=&buyerType=   (admin)
 * Newest first. ?view=summary for light rows, ?id= for one full lead.
 */
const getAllHomePopupLeads = catchAsyncError(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const view = listView(req);
  if (view.badId) return res.status(400).json({ success: false, message: "Invalid id" });

  const query = { fullName: { $not: TEST_NAME_REGEX } };
  if (BUYER_TYPES.includes(req.query.buyerType)) query.buyerType = req.query.buyerType;

  const [leads, total] = await Promise.all([
    HomePopupLead.find(scopeQuery(view, query)).select(listSelect(view)).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    HomePopupLead.countDocuments(scopeQuery(view, query)),
  ]);

  const [eventsByEmail, notesByLead] = await Promise.all([
    getEmailEventsForEmails(unlessSummary(view, leads.map((l) => l.email).filter(Boolean))),
    getNotesForLeads(LEAD_NOTE_TYPE, unlessSummary(view, leads.map((l) => l._id))),
  ]);

  res.status(200).json({
    success: true,
    leads: await shapeLeads(view, leads.map((lead) => ({
      ...lead,
      // Shown as a tag on the row.
      buyerType: BUYER_TYPE_LABELS[lead.buyerType] || lead.buyerType,
      emails: eventsByEmail[String(lead.email || "").toLowerCase()] || [],
      notes: notesByLead[String(lead._id)] || [],
    }))),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

module.exports = { submitHomePopupLead, sendHomePopupCode, verifyHomePopupCode, getAllHomePopupLeads };
