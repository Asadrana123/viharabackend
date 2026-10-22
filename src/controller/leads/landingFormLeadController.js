// controller/landingFormLeadController.js
//
// Forms on landing pages made in Admin → Landing Pages (/lp/<slug>). The
// designer picks the questions; the contact fields (name, email, phone,
// consent) are fixed so the lead can be saved, alerted and called.
//
//   POST /api/v1/landing-forms/:page/submit   (public)
//     1. Honeypot filled → pretend success, store nothing.
//     2. Validate the contact fields; keep every other answer as asked.
//     3. Dedupe by page + email (update answers, keep the original first touch).
//     4. Respond, then Slack + email alert and — with consent — Maya's call.
//
//   GET /api/v1/landing-forms   (admin) — newest leads, for the Landing Pages tab.
//
// ENV: LANDING_FORM_ALERT_EMAIL — who gets the new-lead email (default vin@vihara.ai).
const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");
const LandingFormLead = require("../../model/leads/landingFormLeadModel");
const sendEmail = require("../../utils/sendEmail");
const { normalisePhone } = require("../../services/calling/vapiCallsService");
const { notifyNewLead } = require("../../services/shared/slackService");
const { scheduleLandingFormSignupCall } = require("../../services/calling/landingFormCallScheduler");
const { sanitizeFormAnswers, answersAsFields } = require("../../services/leads/formAnswers");
const { str, isValidEmail, touchesFrom, clientIp, splitName } = require("../../services/leads/buyBox");
const { pageName } = require("../../config/landingFormVoicePrompt");

const PAGE_SLUG = /^[a-z0-9-]{3,50}$/;
const alertEmail = () => process.env.LANDING_FORM_ALERT_EMAIL || "vin@vihara.ai";

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function alertEmailHtml(lead, updated) {
  const rows = [
    ["Page", `${pageName(lead.page)} (/lp/${lead.page})`],
    ["Name", lead.fullName],
    ["Email", lead.email],
    ["Phone", lead.phone],
    ["Call consent", lead.consent ? "Yes — Maya will call" : "No"],
    ["SMS consent", lead.smsConsent ? "Yes" : "No"],
    ...lead.answers.map((a) => [a.question, a.answer]),
    ["Source", lead.lastTouch?.utm_source || "direct"],
  ];
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
  <h2 style="font-size:18px;margin:0 0 12px">${updated ? "Updated" : "New"} landing page lead</h2>
  <table style="border-collapse:collapse">${rows
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top">${escapeHtml(k)}</td><td style="padding:6px 0">${escapeHtml(v || "—")}</td></tr>`)
    .join("")}</table>
</div>`;
}

const submitLandingForm = catchAsyncError(async (req, res, next) => {
  const page = String(req.params.page || "").toLowerCase();
  if (!PAGE_SLUG.test(page)) return next(new ErrorHandler("Unknown page", 400));
  const body = req.body || {};

  // Bots fill the hidden "company_website" field; real users never see it.
  if (str(body.honeypot, 200)) {
    console.warn(`[landing-form] honeypot hit on ${page} from ${clientIp(req) || "unknown ip"} — discarded.`);
    return res.status(200).json({ success: true });
  }

  const fullName = str(body.fullName, 120).replace(/\s+/g, " ");
  const { firstName } = splitName(fullName);
  const email = str(body.email, 200).toLowerCase();
  const phone = str(body.phone, 40);
  if (!firstName) return next(new ErrorHandler("fullName is required", 400));
  if (!isValidEmail(email)) return next(new ErrorHandler("Enter a valid email address", 400));
  const phoneNormalized = normalisePhone(phone);
  if (!phoneNormalized) return next(new ErrorHandler("Enter a valid phone number", 400));

  const now = new Date();
  const consent = body.consent === true;
  const smsConsent = body.smsConsent === true;
  const consentAt = body.consentTimestamp ? new Date(body.consentTimestamp) : now;
  const { firstTouch, lastTouch } = touchesFrom(body, now);

  const fields = {
    page,
    pageUrl: str(body.pageUrl, 2000),
    fullName,
    firstName,
    email,
    phone,
    phoneNormalized,
    timezone: str(body.timezone, 60),
    answers: sanitizeFormAnswers(body.extraAnswers),
    consent,
    consentText: consent ? str(body.consentText, 1000) : "",
    consentTimestamp: consent ? (Number.isNaN(consentAt.getTime()) ? now : consentAt) : null,
    smsConsent,
    smsConsentText: smsConsent ? str(body.smsConsentText, 1000) : "",
    smsConsentAt: smsConsent ? now : null,
    eventId: str(body.eventId, 100),
    lastTouch,
  };

  // ── Dedupe by page + email: a repeat sign-up updates the answers ──────────
  let lead = await LandingFormLead.findOneAndUpdate(
    { page, email },
    { $set: fields, $inc: { submissions: 1 } },
    { new: true }
  ).lean();
  const updated = Boolean(lead);
  if (!lead) {
    try {
      lead = (await LandingFormLead.create({ ...fields, firstTouch })).toObject();
    } catch (err) {
      if (!(err && err.code === 11000)) throw err;
      // Raced with a concurrent submit for the same email — update instead.
      lead = await LandingFormLead.findOneAndUpdate({ page, email }, { $set: fields, $inc: { submissions: 1 } }, { new: true }).lean();
    }
  }

  res.status(200).json({ success: true });

  // ── Alerts and the call (fire-and-forget) ───────────────────────────────
  notifyNewLead({
    leadType: `Landing page: ${pageName(page)}${updated ? " (updated)" : ""}`,
    name: lead.fullName,
    email: lead.email,
    phone: lead.phone,
    consent: lead.consent,
    smsConsent: lead.smsConsent,
    source: `lp-${page} · ${lead.lastTouch?.utm_source || "direct"}`,
    extraFields: answersAsFields(lead.answers),
  }).catch((e) => console.error("[slack] landing-form notify failed:", e.message));

  sendEmail(alertEmail(), "Vihara", `${updated ? "Updated" : "New"} lead: ${pageName(page)} page`, alertEmailHtml(lead, updated));

  // A repeat sign-up that's already been reached isn't called again.
  if (consent && lead.callStatus !== "connected" && !lead.callingStopped) {
    scheduleLandingFormSignupCall(lead).catch((e) => console.error("[landing-form-call] scheduling failed:", e.message));
  }
});

// Newest leads for the admin Landing Pages tab.
const getLandingFormLeads = catchAsyncError(async (req, res) => {
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
  const filter = PAGE_SLUG.test(String(req.query.page || "")) ? { page: req.query.page } : {};
  const leads = await LandingFormLead.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("page fullName email phone answers consent smsConsent callStatus callAttempts submissions createdAt updatedAt")
    .lean();
  res.status(200).json({ success: true, leads });
});

module.exports = { submitLandingForm, getLandingFormLeads };
