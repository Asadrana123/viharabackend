// services/leads/facebookFormLeadService.js
//
// Facebook / Instagram instant-form leads (Meta Lead Ads) get the same
// treatment as a /new-deals sign-up:
//
//   Zernio `lead.received` webhook (POST /api/webhooks/zernio)
//     → save to facebookFormLeads (Admin → Leads → "Facebook Forms")
//     → Brevo contact (New Deals list, LEAD_SOURCE "facebook-form")
//     → New Deals welcome email, once per person
//     → with consent: Maya's signup call + one call a day for 7 days
//     → Slack new-lead alert
//
// Consent comes from the form itself: a form whose custom disclaimer says the
// person agrees to calls / texts counts as consent for everyone who submits
// it. A form without one (e.g. "Toorak Buyers – Financing") is still called:
// an admin decided (2026-10-26) that every Facebook form lead gets Maya's
// calls, recorded as consentSource "admin-override" (calls only; Vtext still
// needs the form's own consent to text).
//
// The form's answers are kept as they were asked (question + chosen option)
// and also mapped onto the buy box (states, strategy, financing, budget,
// down payment) so Maya's script and the welcome email can use them.
//
// Toorak forms (config/toorakForms.js) are routed by form ID: tagged with their
// form / property / listing link, flagged hot (services/leads/toorakLeads.js),
// and a property form's lead gets that property's state and deal. A 15-minute
// poll (toorakLeadPoller.js) catches leads the webhook missed.
//
// Off unless ZERNIO_LEADS_ENABLED=true.

const FacebookFormLead = require("../../model/leads/facebookFormLeadModel");
const { request: zernioRequest } = require("../adsLoop/zernioClient");
const { normalisePhone } = require("../calling/vapiCallsService");
const { scheduleFacebookFormSignupCall } = require("../calling/newDealsCallScheduler");
const { syncNewDealsLead, sendNewDealsWelcomeEmail } = require("../integrations/brevoService");
const { maybeSendFacebookIntroText } = require("../vtext/vtextFacebookIntroService");
const { notifyNewLead, postToSlack } = require("../shared/slackService");
const { newDealsPageUrl, listingPageUrl, getSiteUrl } = require("../../config/siteUrls");
const { toorakFormFor } = require("../../config/toorakForms");
const { findDeal } = require("../../config/newDeals");
const { hotReasons, checkboxConsents, isToorakTestLead } = require("./toorakLeads");
const { scheduleToorakCalls } = require("../calling/toorakCallScheduler");
const { splitName, isValidEmail, STATE_NAMES, stateName, labelList, priceRangeText, withTimeout } = require("./buyBox");

const SOURCE = "facebook-form";
const BREVO_TIMEOUT_MS = 8000;
const FORM_CACHE_MS = 60 * 60 * 1000;

const isEnabled = () => process.env.ZERNIO_LEADS_ENABLED === "true";

// ─── Form definitions (questions, option labels, consent) ───────────────────

const formCache = new Map(); // formId → { at, form }

/**
 * The form's questions with option labels, and whether its custom disclaimer
 * is a call / text consent. Cached for an hour; null when it can't be read.
 */
async function getForm(formId) {
  const hit = formCache.get(formId);
  if (hit && Date.now() - hit.at < FORM_CACHE_MS) return hit.form;

  try {
    const data = await zernioRequest("get", `/v1/ads/lead-forms/${encodeURIComponent(formId)}`, {
      params: { accountId: process.env.ZERNIO_ADS_ACCOUNT_ID },
    });
    const raw = data?.form || data?.data || data || {};
    const disclaimer = raw.legal_content?.custom_disclaimer || null;
    const consentText = String(disclaimer?.body?.text || "").trim();
    // Optional checkboxes can be left unticked, and their answers aren't in the
    // lead, so only a plain disclaimer or required checkboxes count.
    const optionalBox = (disclaimer?.checkboxes || []).some((c) => c && c.is_required === false);
    const form = {
      id: formId,
      name: raw.name || "",
      questions: (raw.questions || []).map((q) => ({
        key: q.key,
        label: q.label || "",
        options: (q.options || []).map((o) => ({ key: o.key, value: o.value })),
      })),
      consentText,
      givesConsent: !optionalBox && consentGiven(consentText),
    };
    formCache.set(formId, { at: Date.now(), form });
    return form;
  } catch (error) {
    console.error(`[facebook-form] couldn't read form ${formId}:`, error.message);
    return null;
  }
}

// Admin decision recorded on leads whose form gave no call consent.
const ADMIN_OVERRIDE_DATE = "2026-10-26";
const adminOverrideConsent = (now, formName) => ({
  consent: true,
  consentSource: "admin-override",
  consentText: `Admin approved calling every Facebook form lead on ${ADMIN_OVERRIDE_DATE}. The form${formName ? ` "${formName}"` : ""} had no call/text consent disclaimer.`,
  consentVersion: `admin-override-${ADMIN_OVERRIDE_DATE}`,
  consentTimestamp: now,
});

/** "I agree to receive calls and text messages from Vihara..." / "By submitting this form you opt in to calls, texts..." */
const consentGiven = (text) =>
  /\b(agree|consent|opt[\s-]?in)/i.test(text) && /\b(calls?|text|texts|sms|messages?)\b/i.test(text);

/** Toorak route for this lead (config/toorakForms.js), with the property's listing link. null = not a Toorak form. */
function toorakRouteFor(lead, form) {
  const route = toorakFormFor(lead.formId, lead.formName || form?.name);
  if (!route) return null;
  return {
    ...route,
    listingUrl: route.propertySlug ? listingPageUrl(route.propertySlug) : `${getSiteUrl()}${route.path || "/auctions"}`,
  };
}

// ─── Answers → buy box ──────────────────────────────────────────────────────

const STATE_BY_NAME = Object.fromEntries(Object.entries(STATE_NAMES).map(([code, name]) => [name.toLowerCase(), code]));

const words = (s) => String(s || "").toLowerCase().replace(/[_\-–]+/g, " ");

/** Every answer as { key, question, value, label }, in the form's question order. */
function answersFrom(fields, form) {
  const byKey = new Map((form?.questions || []).map((q) => [q.key, q]));
  const keys = [...(form?.questions || []).map((q) => q.key).filter((k) => k in fields), ...Object.keys(fields).filter((k) => !byKey.has(k))];
  return keys.map((key) => {
    const q = byKey.get(key);
    const value = String(fields[key] ?? "");
    const option = q?.options?.find((o) => o.key === value);
    return { key, question: q?.label || key.replace(/[_?]+/g, " ").trim(), value, label: option?.value || "" };
  });
}

const CONTACT_KEYS = /^(full_name|first_name|last_name|email|phone_number|phone)$/;

/** The first answer whose question key matches. */
const find = (answers, re) => answers.find((a) => !CONTACT_KEYS.test(a.key) && re.test(a.key));
const text = (a) => (a ? `${a.label} ${a.value}` : "");

function statesFrom(a) {
  if (!a) return [];
  const out = new Set();
  for (const part of String(a.label || a.value).split(/[,;/|]+/)) {
    const t = words(part).trim();
    if (STATE_BY_NAME[t]) out.add(STATE_BY_NAME[t]);
    else if (/^[a-z]{2}$/.test(t) && STATE_NAMES[t.toUpperCase()]) out.add(t.toUpperCase());
  }
  return [...out];
}

function strategyFrom(a) {
  const t = words(text(a));
  const out = [];
  if (/\b(home|live|primary|own)\b/.test(t)) out.push("home");
  if (/\bflip/.test(t)) out.push("flip");
  if (/\b(rent|rental|hold)\b/.test(t)) out.push("rent");
  if (/\bbrrrr\b/.test(t)) out.push("brrrr");
  if (/\bwholesal/.test(t)) out.push("wholesale");
  if (/\b(short term|airbnb|vacation|str)\b/.test(t)) out.push("str");
  return out;
}

function financingFrom(a) {
  const t = words(text(a));
  if (!t.trim()) return "";
  if (/\bcash\b/.test(t)) return "cash";
  if (/\b(hard money|private)\b/.test(t)) return "hard_money";
  if (/\b(conventional|mortgage|loan|bank)\b/.test(t)) return "mortgage";
  if (/\bfinanc/.test(t)) return "financing";
  if (/\bnot sure\b/.test(t)) return "not_sure";
  return "";
}

/** Only answers that mean the same thing as a /new-deals option are mapped. */
function downPaymentFrom(a) {
  const v = String(a?.value || "");
  if (["under_10", "10_20", "not_sure"].includes(v)) return v;
  if (/^(30_plus|25_plus)$/.test(v)) return "25_plus";
  return "";
}

/** "$150K–$300K" → [150000, 300000]; "Under $150K" → [0, 150000]; "$500K+" → [500000, null]. */
function priceFrom(a) {
  if (!a) return { price_min: null, price_max: null };
  const t = String(a.label || a.value).toLowerCase().replace(/,/g, "");
  const nums = [...t.matchAll(/(\d+(?:\.\d+)?)\s*([km])?/g)].map((m) => Number(m[1]) * (m[2] === "m" ? 1e6 : m[2] === "k" ? 1e3 : 1));
  if (!nums.length) return { price_min: null, price_max: null };
  if (/under|less|below|up to/.test(t)) return { price_min: 0, price_max: nums[0] };
  if (/\+|plus|over|more/.test(t) && nums.length === 1) return { price_min: nums[0], price_max: null };
  return nums.length >= 2 ? { price_min: nums[0], price_max: nums[1] } : { price_min: nums[0], price_max: nums[0] };
}

function buyBoxFrom(answers) {
  const financing = financingFrom(find(answers, /pay|fund|financ/));
  return {
    states: statesFrom(find(answers, /market|state|where|location/)),
    cities: [],
    strategy: strategyFrom(find(answers, /buying_for|strategy|purpose|plan/)),
    property_type: [],
    ...priceFrom(find(answers, /price|budget|capital|range/)),
    condition: "",
    financing,
    deals_12mo: "",
    down_payment: financing === "cash" ? "" : downPaymentFrom(find(answers, /down/)),
  };
}

// Calls go out in the lead's own time; the scheduler falls back to Eastern.
const TZ_BY_STATE = {
  CA: "America/Los_Angeles", WA: "America/Los_Angeles", OR: "America/Los_Angeles", NV: "America/Los_Angeles",
  AZ: "America/Phoenix", CO: "America/Denver", UT: "America/Denver", NM: "America/Denver",
  TX: "America/Chicago", LA: "America/Chicago", IL: "America/Chicago", MN: "America/Chicago", MO: "America/Chicago",
  AL: "America/Chicago", MS: "America/Chicago", OK: "America/Chicago", AR: "America/Chicago", TN: "America/Chicago",
  WI: "America/Chicago", IA: "America/Chicago", KS: "America/Chicago", NE: "America/Chicago",
};
const timezoneFor = (states) => (states.length === 1 && TZ_BY_STATE[states[0]]) || "";

// Facebook's lead-form testing tool sends "<test lead: dummy data for ...>".
const isTestLead = (fields) => Object.values(fields).some((v) => /test lead|dummy data/i.test(String(v)));

// ─── Welcome email (once per person) ────────────────────────────────────────

async function sendWelcomeOnce(lead) {
  const claimed = await FacebookFormLead.findOneAndUpdate(
    { _id: lead._id, welcomeEmailSentAt: null },
    { $set: { welcomeEmailSentAt: new Date() } },
    { new: true }
  ).lean();
  if (!claimed) return;

  const box = claimed.buyBox || {};
  const answer = (re) => claimed.answers.find((a) => re.test(a.key));
  // The answer as the form showed it, when Zernio gave the option's label.
  const asked = (key) => claimed.answers.find((a) => a.key === key)?.label || "";
  const route = claimed.toorak ? toorakFormFor(claimed.formId, claimed.formName) : null;
  const result = await sendNewDealsWelcomeEmail({
    email: claimed.email,
    name: claimed.fullName || claimed.firstName,
    params: {
      FIRSTNAME: claimed.firstName,
      // Toorak (marketing, 28 Oct): buying_for → STRATEGY, markets → MARKETS, price_range → PRICE_RANGE, how_pay → FINANCING.
      STRATEGY: asked("buying_for") || labelList("strategy", box.strategy),
      MARKETS: asked("markets") || (box.states || []).map(stateName).join(", "),
      PRICE_RANGE: asked("price_range") || priceRangeText(box),
      FINANCING: asked("how_pay") || labelList("financing", box.financing),
      DOWN_PAYMENT: answer(/down/)?.label || "",
      ...(route
        ? {
            // Template 189's CTA goes to /auctions; a property-specific template will carry the listing link.
            ...(route.address ? { DEAL_MARKET: route.address, ADVISOR_CALL: true } : {}),
            // Maya calls every Toorak lead (admin, 28 Oct 2026), so the email says we'll call.
            CONTACT_PREF: claimed.consent ? "call" : "email",
            LISTING_URL: claimed.toorak.listingUrl || "",
          }
        : {}),
    },
  });

  await FacebookFormLead.updateOne(
    { _id: claimed._id },
    result.success
      ? { $set: { welcomeEmailMessageId: result.messageId || "", welcomeEmailError: "" } }
      : { $set: { welcomeEmailSentAt: null, welcomeEmailError: result.error || "send failed" } }
  );
}

/** Brevo contact (same New Deals list, tagged facebook-form); the result is saved on the lead. */
async function syncToBrevo(doc) {
  const brevo = await withTimeout(
    syncNewDealsLead(
      { ...doc, smsOptInUrl: newDealsPageUrl(), marketsText: (doc.buyBox?.states || []).map(stateName).join(", "), dealText: "" },
      { source: SOURCE }
    ),
    BREVO_TIMEOUT_MS,
    { success: false, error: "Brevo timeout" }
  ).catch((e) => ({ success: false, error: e.message }));
  await FacebookFormLead.updateOne(
    { _id: doc._id },
    { $set: { brevoSynced: brevo.success === true, brevoError: brevo.success ? "" : String(brevo.error || "") } }
  ).catch(() => {});
  return brevo;
}

// ─── Save ───────────────────────────────────────────────────────────────────

/**
 * Create the person, or add this submission to their record (same email, then
 * same phone). Returns null for a lead id already handled.
 */
async function saveLead({ lead, form, fields }) {
  if (await FacebookFormLead.exists({ leadgenIds: lead.leadgenId })) return null;

  const answers = answersFrom(fields, form);
  const fullName = String(fields.full_name || [fields.first_name, fields.last_name].filter(Boolean).join(" ")).replace(/\s+/g, " ").trim();
  const split = splitName(fullName);
  const email = String(fields.email || "").trim().toLowerCase();
  // First name is required on the record; a form left blank falls back to the email name.
  const firstName = split.firstName || email.split("@")[0] || "there";
  const lastName = split.lastName || "";
  const phone = String(fields.phone_number || fields.phone || "").trim();
  const phoneNormalized = normalisePhone(phone);
  const buyBox = buyBoxFrom(answers);
  const now = new Date();

  // Toorak: a property form's state comes from its property (the form doesn't ask).
  const toorak = toorakRouteFor(lead, form);
  if (toorak?.state && !buyBox.states.length) buyBox.states = [toorak.state];
  const hot = toorak ? hotReasons(answers) : [];

  // Consent. Toorak forms: only the call_consent / sms_consent checkboxes count. Other forms: the
  // form's disclaimer (and the admin override below).
  const boxes = toorak ? checkboxConsents(lead.consents) : { call: false, sms: false };
  const consent = toorak ? boxes.call : form?.givesConsent === true;

  const submission = {
    leadgenId: lead.leadgenId,
    zernioLeadId: lead.id || "",
    formId: lead.formId || "",
    formName: lead.formName || form?.name || "",
    adId: lead.adId || "",
    adsetId: lead.adsetId || "",
    campaignId: lead.campaignId || "",
    isOrganic: lead.isOrganic === true,
    answers,
    submittedAt: lead.createdAt ? new Date(lead.createdAt) : now,
  };

  const fieldsToSet = {
    fullName,
    firstName,
    lastName,
    phone,
    phoneNormalized,
    buyBox,
    timezone: timezoneFor(buyBox.states),
    formId: submission.formId,
    formName: submission.formName,
    adId: submission.adId,
    campaignId: submission.campaignId,
    isOrganic: submission.isOrganic,
    answers,
    submittedAt: submission.submittedAt,
    eventId: `fb-${lead.leadgenId}`,
    attribution: { utm_source: lead.isOrganic ? "facebook" : "meta", utm_medium: lead.isOrganic ? "organic" : "paid", utm_content: lead.adId || "" },
    // Tags from the handover: source, form, campaign / ad set / ad, property, created time (submittedAt).
    leadSource: "meta_leadform",
    adsetId: submission.adsetId,
    receivedVia: lead.receivedVia === "poll" ? "poll" : "webhook",
    ...(toorak
      ? {
          toorak: { key: toorak.key, kind: toorak.kind, known: toorak.known, propertySlug: toorak.propertySlug || "", listingUrl: toorak.listingUrl },
          hot: hot.length > 0,
          hotReasons: hot,
          // The property's spotlight deal: Maya names it on a call.
          ...(toorak.dealId && findDeal(toorak.dealId) ? { dealInterest: toorak.dealId } : {}),
        }
      : {}),
    // Consent only ever turns on: a later form without a disclaimer doesn't undo an earlier one.
    ...(consent
      ? toorak
        ? {
            consent: true,
            consentText: "Ticked the call_consent checkbox on the form.",
            consentVersion: `fb-form-${submission.formId}`,
            consentTimestamp: now,
            consentSource: "form-checkbox",
          }
        : {
            consent: true,
            consentText: form.consentText,
            consentVersion: `fb-form-${submission.formId}`,
            consentTimestamp: now,
            consentSource: "form-disclaimer",
          }
      : {}),
    ...(boxes.sms ? { smsConsent: true } : {}),
  };

  const existing =
    (email && (await FacebookFormLead.findOne({ email }))) ||
    (phoneNormalized && (await FacebookFormLead.findOne({ phoneNormalized }).sort({ createdAt: 1 })));

  if (!consent && !existing?.consent) {
    // No consent on this form and none on record → call anyway (admin override). Toorak too: the admin
    // decided (28 Oct 2026) that Maya calls every Toorak lead, call_consent ticked or not.
    Object.assign(fieldsToSet, adminOverrideConsent(now, submission.formName));
  }

  const addTo = (doc) =>
    FacebookFormLead.findByIdAndUpdate(
      doc._id,
      { $set: fieldsToSet, $push: { formSubmissions: submission }, $addToSet: { leadgenIds: lead.leadgenId }, $inc: { submissions: 1 } },
      { new: true }
    ).lean();

  if (existing) return { lead: await addTo(existing), isNew: false, previous: existing };
  try {
    const created = await FacebookFormLead.create({
      ...fieldsToSet,
      email,
      // Only on a new record: a test lead merged into a real person must not mark them as a test.
      isTest: lead.isTest === true || isTestLead(fields),
      formSubmissions: [submission],
      leadgenIds: [lead.leadgenId],
      submissions: 1,
    });
    return { lead: created.toObject(), isNew: true, previous: null };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const doc = await FacebookFormLead.findOne({ email });
    if (!doc) throw error;
    return { lead: await addTo(doc), isNew: false, previous: doc };
  }
}

// ─── Main flow ──────────────────────────────────────────────────────────────

async function handleLead(payload) {
  const lead = payload.lead || {};
  const fields = lead.fields || {};
  if (!lead.leadgenId) return;

  const form = lead.formId ? await getForm(lead.formId) : null;
  const toorakForm = toorakRouteFor(lead, form);

  // Facebook test leads. Toorak: with TOORAK_TEST_EMAIL + TOORAK_TEST_PHONE set, the whole flow runs on those
  // internal contacts instead of the lead's (a real lead's number never gets anything); without them, saved only.
  const test = toorakForm ? isToorakTestLead(lead, fields) : isTestLead(fields);
  const testContacts = test && toorakForm ? internalTestContacts() : null;
  if (test) lead.isTest = true;
  if (testContacts) {
    fields.email = testContacts.email;
    fields.phone_number = testContacts.phone;
  }

  const email = String(fields.email || "").trim().toLowerCase();
  const phoneNormalized = normalisePhone(fields.phone_number || fields.phone || "");

  if (!isValidEmail(email) || !phoneNormalized) {
    console.warn(`[facebook-form] lead ${lead.leadgenId} has no valid email or phone; not saved.`);
    notifyNewLead({
      leadType: "Facebook Form (incomplete, not saved)",
      name: String(fields.full_name || ""),
      email,
      phone: String(fields.phone_number || ""),
      source: `${SOURCE} · ${lead.formName || lead.formId}`,
    }).catch(() => {});
    return;
  }

  const saved = await saveLead({ lead, form, fields });
  if (!saved) return; // already handled (Zernio retry / redelivery)
  let { lead: doc } = saved;
  const { isNew, previous } = saved;

  if (test && !testContacts) {
    console.log(`[facebook-form] test lead ${lead.leadgenId} saved; no Brevo, email, call or Slack.`);
    return;
  }
  if (testContacts) {
    // Every test runs the full flow again on the internal record: fresh welcome email and calls.
    doc = await FacebookFormLead.findByIdAndUpdate(
      doc._id,
      { $set: { isTest: true, welcomeEmailSentAt: null, callStatus: "pending", nextCallAt: null, callAttempts: 0 } },
      { new: true }
    ).lean();
    console.log(`[facebook-form] test lead ${lead.leadgenId}: running the flow on the internal test contacts.`);
  }

  // A Toorak-named form that isn't in config/toorakForms.js: handled in the default Toorak queue, and the team is told.
  if (doc.toorak && doc.toorak.known === false) {
    postToSlack(process.env.SLACK_LEADS_WEBHOOK_URL, {
      text:
        `:warning: Lead from a Toorak form that isn't in config/toorakForms.js: "${lead.formName || "(no name)"}" (form ${lead.formId}). ` +
        `It went to the default Toorak queue (${doc.toorak.kind}). Add the form ID to the config to route it properly.`,
    }).catch((e) => console.error("[facebook-form] unknown Toorak form alert failed:", e.message));
  }

  await syncToBrevo(doc);

  sendWelcomeOnce(doc).catch((e) => console.error("[facebook-form] welcome email failed:", e.message));

  // Maya, unless this person is already in (or done with) the call loop.
  // Toorak: 3 attempts (toorakCallScheduler), with the checkbox or the admin override.
  // Other forms: with consent (incl. the admin override), the signup call + 7-day loop.
  const inLoop = previous && ["no-answer", "connected"].includes(previous.callStatus) && previous.consent;
  let callNote;
  if (doc.toorak) {
    const at = testContacts || !inLoop ? await scheduleToorakCalls(doc).catch((e) => console.error("[toorak-calls] scheduling failed:", e.message)) : null;
    callNote = at ? `yes, first try ${at.toISOString()}` : doc.consent ? "already in call loop" : "no: dial by hand";
  } else {
    if (doc.consent && !doc.callingStopped && !inLoop) {
      scheduleFacebookFormSignupCall(doc).catch((e) => console.error("[facebook-form-call] scheduling failed:", e.message));
    } else if (!doc.consent) {
      console.log(`[facebook-form] no consent on form "${doc.formName}"; not calling ${doc.phoneNormalized}`);
    }
    callNote = doc.consent ? (inLoop ? "already in call loop" : "yes") : "no (form has no call consent)";
  }

  // Intro text through Vtext: new leads only, with form consent. Off unless FACEBOOK_AUTO_TEXT_ENABLED=true.
  // Toorak: never without the sms_consent checkbox.
  if (!doc.toorak || doc.smsConsent) {
    maybeSendFacebookIntroText({ doc, isNew }).catch((e) => console.error("[facebook-form-text] failed:", e.message));
  }

  // Hot Toorak lead: its own alert (name, phone, property / form, answers, admin link) instead of the usual one.
  if (doc.toorak && doc.hot) {
    postToSlack(process.env.SLACK_LEADS_WEBHOOK_URL, { text: hotLeadAlert(doc, { test: !!testContacts }) }).catch((e) =>
      console.error("[slack] hot Toorak alert failed:", e.message)
    );
    return;
  }

  notifyNewLead({
    leadType: `${testContacts ? "[TEST] " : ""}${doc.toorak ? "Toorak" : "Facebook Form"}${isNew ? "" : " (repeat)"}`,
    name: doc.fullName || doc.firstName,
    email: doc.email,
    phone: doc.phone,
    consent: doc.consent,
    source: `${SOURCE} · ${doc.formName || doc.formId}`,
    extraFields: [
      { label: "Form", value: doc.formName || doc.formId },
      { label: "Ad", value: doc.adId || (doc.isOrganic ? "organic" : "—") },
      ...(doc.toorak
        ? [
            { label: "Property", value: doc.toorak.propertySlug ? doc.toorak.listingUrl : "General (financing form)" },
            ...(doc.hot ? [{ label: "Hot because", value: doc.hotReasons.join(", ") }] : []),
          ]
        : []),
      ...(doc.receivedVia === "poll" ? [{ label: "Received via", value: "15-minute poll (the webhook missed it)" }] : []),
      ...doc.answers
        .filter((a) => !CONTACT_KEYS.test(a.key))
        .slice(0, 5)
        .map((a) => ({ label: a.question, value: a.label || a.value })),
      { label: "Maya call", value: callNote },
    ],
  }).catch((e) => console.error("[slack] facebook-form notify failed:", e.message));
}

/** TOORAK_TEST_EMAIL + TOORAK_TEST_PHONE: where a Toorak test lead's emails and calls go. null when either is missing. */
function internalTestContacts() {
  const email = String(process.env.TOORAK_TEST_EMAIL || "").trim().toLowerCase();
  const phone = String(process.env.TOORAK_TEST_PHONE || "").trim();
  return isValidEmail(email) && normalisePhone(phone) ? { email, phone } : null;
}

/** The hot-lead Slack alert: who, how to reach them, which form / property, their answers, and the admin link. */
function hotLeadAlert(doc, { test = false } = {}) {
  const answers = (doc.answers || []).filter((a) => !CONTACT_KEYS.test(a.key)).map((a) => `• ${a.question}: ${a.label || a.value}`);
  return [
    `${test ? "[TEST] " : ""}:fire: *Hot Toorak lead* — ${doc.hotReasons.join(", ")}`,
    `*${doc.fullName || doc.firstName}* · ${doc.phone} · ${doc.email}`,
    `Form: ${doc.formName || doc.formId}${doc.toorak.propertySlug ? ` · Property: ${doc.toorak.listingUrl}` : ""}`,
    ...answers,
    `Calls: ${doc.callingStopped ? "stopped — dial by hand" : "Maya (3 tries)"}`,
    `Admin: ${getSiteUrl()}/admin/toorakLeads`,
  ].join("\n");
}

/**
 * Entry point from POST /api/webhooks/zernio (after the 200 and the signature
 * check). Never throws.
 */
function processFacebookFormLeadWebhook(payload) {
  if (!isEnabled()) return;
  if (payload?.event !== "lead.received" || payload.test) return;
  handleLead(payload).catch((e) =>
    console.error(`[facebook-form] lead ${payload?.lead?.leadgenId} failed:`, e.message)
  );
}

module.exports = {
  processFacebookFormLeadWebhook,
  handleLead,
  saveLead,
  getForm,
  syncToBrevo,
  sendWelcomeOnce,
  isValidLead: (fields) => isValidEmail(String(fields.email || "").trim().toLowerCase()) && Boolean(normalisePhone(fields.phone_number || fields.phone || "")),
  answersFrom,
  buyBoxFrom,
  consentGiven,
  toorakRouteFor,
  hotLeadAlert,
  adminOverrideConsent,
  isTestLead,
  isEnabled,
};
