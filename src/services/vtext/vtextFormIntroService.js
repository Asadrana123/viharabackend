// services/vtext/vtextFormIntroService.js
//
// The automatic first text for a NEW lead from a website form (Deal Finder, /deal financing, NorCal,
// Partner, New Deals, Buyer List, Early Access, /lp pages, auction registration, Sell). Wording:
// formIntroTexts.js. Rules (Prajwal, 6 Nov 2026):
//   - Only forms listed in VTEXT_FORM_TEXTS (comma list of keys, or "all"), and only with VTEXT_ENABLED=true.
//     Nothing is listed by default, so each form is turned on by hand on Render.
//   - Consent follows the Vtext consent switch, like every other text. Switch ON: only when the person
//     ticked the SMS box on the form. Switch OFF: every new lead, ticked or not.
//   - Only 9 AM to 8 PM in the lead's time zone (utils/textingHours.js); a lead at night is texted at 9 AM.
//   - New leads only (callers don't call this for repeat sign-ups), one text per lead, once per number for
//     each form (per property for the two texts that name one), and no text when the number already got an
//     automatic text in the last 24 hours (e.g. the property quote text).
//   - No follow-ups.
// Vtext's own gate (canSend) still blocks opted-out contacts and bad numbers.
const VtextContact = require("../../model/vtext/vtextContactModel");
const VtextMessage = require("../../model/vtext/vtextMessageModel");
const { enqueueOutbound } = require("./vtextMessageService");
const { toUsSmsNumber } = require("../../utils/usPhone");
const { maskPhone } = require("../../utils/maskPii");
const { notifyVtextAlert } = require("../shared/slackService");
const { nextTextingTime } = require("../../utils/textingHours");
const { getSettings, isConsentRequired } = require("./vtextSettingsService");
const { FORM_TEXTS, renderFormText, templateKeyFor } = require("./formIntroTexts");

const RECENT_MS = 24 * 3_600_000;

/** Is this form's text turned on? VTEXT_FORM_TEXTS="partner,norcal" or "all". */
function formTextEnabled(form, env = process.env) {
  if (env.VTEXT_ENABLED !== "true") return false;
  const list = String(env.VTEXT_FORM_TEXTS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes("all") || list.includes(form);
}

/** Has this number had this form's text, or any automatic text in the last 24 hours? */
async function alreadyTexted(phone, form, now) {
  const contact = await VtextContact.findOne({ phoneE164: phone }).select("_id").lean();
  if (!contact) return null;
  if (!FORM_TEXTS[form]?.perProperty) {
    const same = await VtextMessage.exists({ contactId: contact._id, direction: "out", "origin.templateKey": templateKeyFor(form) });
    if (same) return "this number already got this form's text";
  }
  const recent = await VtextMessage.exists({
    contactId: contact._id,
    direction: "out",
    "origin.kind": "automation",
    createdAt: { $gte: new Date(now.getTime() - RECENT_MS) },
  });
  return recent ? "this number got another automatic text in the last 24 hours" : null;
}

// Skips that need no Slack message: expected, or a setting.
const QUIET_SKIP = /not turned on|did not tick|already got|another automatic text|no valid US/i;

/**
 * Fire-and-forget; never throws.
 * @param {object} params
 * @param {string} params.form - a FORM_TEXTS key
 * @param {string} params.leadType - stored on the message's leadRef (e.g. "partner")
 * @param {object} params.lead - needs _id, smsConsent and a phone (phoneNormalized / phone / mobilePhone / phoneNumber)
 * @param {string} [params.name] - the person's name, full or first
 * @param {object} [params.values] - property_short, page_title, auction_date when the form's text needs them
 * @param {object} [deps] - injected by tests: { enqueueOutbound, alreadyTexted, notify, now, env, consentRequired }
 * @returns {Promise<{ queued: boolean, reason?: string, at?: Date }>}
 */
async function maybeSendFormIntroText({ form, leadType, lead, name, values = {} }, deps = {}) {
  const send = deps.enqueueOutbound || enqueueOutbound;
  const checkTexted = deps.alreadyTexted || alreadyTexted;
  const notify = deps.notify || notifyVtextAlert;
  const consentRequired = deps.consentRequired || (async () => isConsentRequired(await getSettings()));
  const now = deps.now ? deps.now() : new Date();
  const label = FORM_TEXTS[form]?.label || form;
  const id = lead?._id;
  const rawPhone = lead?.phoneNormalized || lead?.phone || lead?.mobilePhone || lead?.phoneNumber;

  const skip = async (reason) => {
    console.log(`[form-text:${form}] SKIPPED ${id} — ${reason}`);
    if (QUIET_SKIP.test(reason)) return { queued: false, reason };
    await notify({
      level: "warning",
      title: "Form lead was not texted",
      fields: [
        { label: "Form", value: label },
        { label: "Lead", value: name || String(id) },
        { label: "Phone", value: rawPhone ? `…${String(rawPhone).slice(-4)}` : "none" },
        { label: "Why", value: reason },
      ],
    }).catch((e) => console.error(`[form-text:${form}] Slack alert failed:`, e.message));
    return { queued: false, reason };
  };

  try {
    if (!formTextEnabled(form, deps.env)) return { queued: false, reason: "not turned on" };
    if (!lead) return await skip("no lead");
    // Switch ON: the SMS tick is needed. Switch OFF: everyone (Vtext's gate still blocks opt-outs and bad numbers).
    if (lead.smsConsent !== true && (await consentRequired())) return await skip("did not tick the SMS box (consent check is ON)");
    const phone = toUsSmsNumber(rawPhone);
    if (!phone) return await skip("no valid US mobile number");

    const { text, skip: renderProblem } = renderFormText(form, { name, ...values });
    if (!text) return await skip(renderProblem);

    const texted = await checkTexted(phone, form, now);
    if (texted) return await skip(texted);

    const hold = nextTextingTime(phone, now);
    const { message, blocked, reason } = await send({
      to: phone,
      body: text,
      origin: { kind: "automation", templateKey: templateKeyFor(form), leadRef: { leadType, leadId: id } },
      contactName: name || undefined,
      isReplyToInbound: false,
      idempotencyKey: `form-intro:${form}:${id}`,
      scheduledFor: hold.waited ? hold.at : undefined,
    });
    if (blocked) return await skip(`blocked by Vtext: ${reason}`);
    console.log(`[form-text:${form}] QUEUED for ${id} (${maskPhone(phone)}), message ${message?._id}${hold.waited ? `, held until ${hold.at.toISOString()}` : ""}`);
    return { queued: true, at: hold.waited ? hold.at : now };
  } catch (err) {
    if (err?.code === 11000) return skip("already got this form's text (duplicate key)");
    console.error(`[form-text:${form}] FAILED for ${id}:`, err.message);
    return skip(`error: ${err.message}`);
  }
}

module.exports = { maybeSendFormIntroText, formTextEnabled };
