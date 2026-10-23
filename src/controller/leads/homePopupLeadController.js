// controller/leads/homePopupLeadController.js
//
// Home page popup: name, email and cash / financing. Stored in Mongo, posted
// to Slack, and listed in Admin → Leads → "Home Popup".
const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");
const HomePopupLead = require("../../model/leads/homePopupLeadModel");
const { notifyNewLead } = require("../../services/shared/slackService");
const { getEmailEventsForEmails } = require("../../services/integrations/emailEventsService");
const { getNotesForLeads } = require("../../services/leads/leadNotesService");
const { listView, scopeQuery, unlessSummary, listSelect, shapeLeads } = require("../../services/leads/leadListView");
const { str, isValidEmail, attributionFrom, splitName } = require("../../services/leads/buyBox");

const BUYER_TYPES = ["cash", "financing", "not_sure"];
const BUYER_TYPE_LABELS = { cash: "Cash buyer", financing: "Financing", not_sure: "Not sure yet" };
const TEST_NAME_REGEX = /test/i;
const LEAD_NOTE_TYPE = "homePopup"; // matches leadNoteModel.LEAD_TYPES

/**
 * POST /api/v1/home-popup/submit   (public)
 * Body: { full_name, email, buyer_type, trigger, page_url, attribution }
 * Dedupe by email: a repeat submit updates the existing record.
 */
const submitHomePopupLead = catchAsyncError(async (req, res, next) => {
  const body = req.body || {};

  const fullName = str(body.full_name, 120).replace(/\s+/g, " ");
  const { firstName, lastName } = splitName(fullName);
  const email = str(body.email, 200).toLowerCase();
  const buyerType = str(body.buyer_type, 20);

  if (!firstName) return next(new ErrorHandler("Enter your name", 400));
  if (!isValidEmail(email)) return next(new ErrorHandler("Enter a valid email address", 400));
  if (!BUYER_TYPES.includes(buyerType)) return next(new ErrorHandler("Choose cash or financing", 400));

  const fields = {
    fullName,
    firstName,
    lastName,
    email,
    buyerType,
    trigger: body.trigger === "button" ? "button" : "auto",
    pageUrl: str(body.page_url, 2000),
    attribution: attributionFrom(body.attribution),
    submittedAt: new Date(),
  };

  const existing = await HomePopupLead.findOne({ email }).select("_id").lean();
  const lead = await HomePopupLead.findOneAndUpdate(
    { email },
    existing ? { $set: fields, $inc: { submissions: 1 } } : { $set: fields },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({ success: true, leadId: lead._id, updated: !!existing });

  notifyNewLead({
    leadType: existing ? "Home Popup (updated)" : "Home Popup",
    name: lead.fullName,
    email: lead.email,
    source: `home-popup · ${lead.attribution?.utm_source || "direct"}`,
    extraFields: [
      { label: "Buying with", value: BUYER_TYPE_LABELS[lead.buyerType] },
      { label: "Opened by", value: lead.trigger === "button" ? "Button" : "Auto (5s)" },
    ],
  }).catch((e) => console.error("[slack] home-popup notify failed:", e.message));
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
    leads: shapeLeads(view, leads.map((lead) => ({
      ...lead,
      // Shown as a tag on the row.
      buyerType: BUYER_TYPE_LABELS[lead.buyerType] || lead.buyerType,
      emails: eventsByEmail[String(lead.email || "").toLowerCase()] || [],
      notes: notesByLead[String(lead._id)] || [],
    }))),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

module.exports = { submitHomePopupLead, getAllHomePopupLeads };
