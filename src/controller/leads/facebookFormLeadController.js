// controller/leads/facebookFormLeadController.js
//
// Admin → Leads → "Facebook Forms": Facebook / Instagram instant-form leads
// (saved by services/leads/facebookFormLeadService.js from Zernio's
// lead.received webhook), with their Maya calls, email events and notes —
// the same view as the New Deals tab.

const catchAsyncError = require("../../middleware/catchAsyncError");
const FacebookFormLead = require("../../model/leads/facebookFormLeadModel");
const { getEmailEventsForEmails } = require("../../services/integrations/emailEventsService");
const { getNotesForLeads } = require("../../services/leads/leadNotesService");
const { listView, scopeQuery, unlessSummary, listSelect, callsForList, shapeLeads } = require("../../services/leads/leadListView");
const { getVtextMessagesForPhones } = require("../../services/vtext/vtextLeadMessagesService");
const { normalisePhone } = require("../../services/calling/vapiCallsService");
const mongoose = require("mongoose");
const { TOORAK_FORMS } = require("../../config/toorakForms");
const { LEAD_STATUSES, MANUAL_STATUSES, leadStatusOf, formReport } = require("../../services/leads/toorakLeads");
const { writebackLeadStatus } = require("../../services/leads/toorakStatusWriteback");
const EmailEvent = require("../../model/integrations/emailEventModel");

const LEAD_NOTE_TYPE = "facebookForm"; // matches leadNoteModel.LEAD_TYPES

/**
 * GET /api/v1/facebook-leads?page=&limit=&formId=   (admin)
 * Newest first. ?view=summary for light rows, ?id= for one full lead.
 */
const getAllFacebookFormLeads = catchAsyncError(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const view = listView(req);
  if (view.badId) return res.status(400).json({ success: false, message: "Invalid id" });

  const query = {};
  if (typeof req.query.formId === "string" && req.query.formId) query.formId = req.query.formId;

  const [leads, total, forms] = await Promise.all([
    FacebookFormLead.find(scopeQuery(view, query)).select(listSelect(view)).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    FacebookFormLead.countDocuments(scopeQuery(view, query)),
    // The forms seen so far, for the tab's filter.
    FacebookFormLead.aggregate([{ $group: { _id: "$formId", name: { $last: "$formName" }, leads: { $sum: 1 } } }, { $sort: { leads: -1 } }]),
  ]);

  const [messagesByPhone, callsFor, eventsByEmail, notesByLead] = await Promise.all([
    getVtextMessagesForPhones(unlessSummary(view, leads.map((l) => l.phone).filter(Boolean))),
    callsForList(view, leads.map((l) => l.phone).filter(Boolean)),
    getEmailEventsForEmails(unlessSummary(view, leads.map((l) => l.email).filter(Boolean))),
    getNotesForLeads(LEAD_NOTE_TYPE, unlessSummary(view, leads.map((l) => l._id))),
  ]);

  res.status(200).json({
    success: true,
    leads: shapeLeads(view, leads.map((lead) => ({
      ...lead,
      fullName: lead.fullName || lead.firstName,
      ...callsFor(lead.phone),
      emails: eventsByEmail[String(lead.email || "").toLowerCase()] || [],
      notes: notesByLead[String(lead._id)] || [],
      messages: messagesByPhone[normalisePhone(lead.phone)] || [],
    }))),
    forms: forms.map((f) => ({ formId: f._id, name: f.name, leads: f.leads })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// ─── Toorak lead forms (handover 28 Oct 2026) ───────────────────────────────

const QUEUE_FIELDS =
  "fullName firstName email phone formId formName adId campaignId toorak hot hotReasons leadStatus leadStatusHistory " +
  "callStatus callAttempts lastCallAt nextCallAt consent consentSource callingStopped smsConsent phoneInvalid answers createdAt submittedAt " +
  "receivedVia formSubmissions.zernioLeadId formSubmissions.leadgenId leadgenIds";
const formNameOf = (id, lead) => TOORAK_FORMS[id]?.name || lead?.formName || id;

/** Emails (lowercase) that hard-bounced, from the Brevo email events. */
async function bouncedEmails(emails) {
  if (!emails.length) return new Set();
  const list = await EmailEvent.distinct("email", { email: { $in: emails }, event: "hard_bounce" });
  return new Set(list);
}

/**
 * GET /api/v1/facebook-leads/toorak?status=&formId=   (admin)
 * Per-form report (total, hot, each status) and the dial queue: hot first,
 * then newest. Test leads are left out.
 */
const getToorakLeads = catchAsyncError(async (req, res) => {
  const base = { toorak: { $ne: null }, isTest: { $ne: true } };
  const all = await FacebookFormLead.find(base).select(QUEUE_FIELDS).sort({ hot: -1, createdAt: -1 }).lean();
  const bounced = await bouncedEmails([...new Set(all.map((l) => String(l.email || "").toLowerCase()).filter(Boolean))]);
  const isBounced = (l) => bounced.has(String(l.email || "").toLowerCase());

  const status = String(req.query.status || "");
  const formId = String(req.query.formId || "");
  const queue = all
    .map(({ formSubmissions, leadgenIds, ...l }) => ({
      ...l,
      fullName: l.fullName || l.firstName,
      emailBounced: isBounced(l),
      status: leadStatusOf(l, { emailBounced: isBounced(l) }),
    }))
    .filter((l) => (!status || l.status === status) && (!formId || l.formId === formId))
    .slice(0, 500);

  res.status(200).json({
    success: true,
    statuses: LEAD_STATUSES,
    forms: formReport(all, formNameOf, bounced),
    leads: queue,
    total: all.length,
  });
});

/**
 * PATCH /api/v1/facebook-leads/:id/status   (admin)   body { status?, phoneInvalid? }
 * status: contacted | unreachable | qualified | converted | disqualified, or ""
 * to go back to following the calls; kept with who set it and when, and copied
 * to Zernio (toorakStatusWriteback, when switched on).
 * phoneInvalid: the team found the number wrong (with a bounced email → disqualified).
 */
const updateLeadStatus = catchAsyncError(async (req, res) => {
  const body = req.body || {};
  const hasStatus = Object.prototype.hasOwnProperty.call(body, "status");
  const status = String(body.status ?? "");
  if (hasStatus && status && !MANUAL_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: `status must be one of ${MANUAL_STATUSES.join(", ")}, or empty` });
  }
  if (!hasStatus && typeof body.phoneInvalid !== "boolean") {
    return res.status(400).json({ success: false, message: "Send status and/or phoneInvalid" });
  }
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid id" });

  const by = req.user?.email || req.user?.name || "admin";
  const update = { $set: {} };
  if (hasStatus) {
    update.$set.leadStatus = status;
    update.$push = { leadStatusHistory: { status: status || "auto", by, at: new Date() } };
  }
  if (typeof body.phoneInvalid === "boolean") update.$set.phoneInvalid = body.phoneInvalid;

  const lead = await FacebookFormLead.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
  if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

  const emailBounced = (await bouncedEmails([String(lead.email || "").toLowerCase()])).size > 0;
  const effective = leadStatusOf(lead, { emailBounced });
  writebackLeadStatus(lead, effective).catch(() => {});
  res.status(200).json({ success: true, status: effective, leadStatus: lead.leadStatus, phoneInvalid: lead.phoneInvalid, emailBounced });
});

module.exports = { getAllFacebookFormLeads, getToorakLeads, updateLeadStatus };
