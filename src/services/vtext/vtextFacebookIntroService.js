// services/vtext/vtextFacebookIntroService.js
//
// Automatic intro text for a NEW Facebook / Instagram form lead, queued through Vtext right after the Maya
// call is scheduled (services/leads/facebookFormLeadService.js). The wording and the skip rules are shared
// with the one-off script (services/leads/facebookIntroText.js).
//
// Consent follows the Vtext consent switch, like the property signup text. Switch ON (the default): only a
// form whose disclaimer gives call / text consent (lead.consent + consentSource "form-disclaimer"). Switch
// OFF: every new lead is texted; Vtext's own gate still blocks opted-out contacts and bad numbers.
// No texting-hours check, same as the signup call. Off unless
// FACEBOOK_AUTO_TEXT_ENABLED=true (and VTEXT_ENABLED=true, since sending needs the Vtext queue).
const VtextContact = require("../../model/vtext/vtextContactModel");
const VtextMessage = require("../../model/vtext/vtextMessageModel");
const { enqueueOutbound } = require("./vtextMessageService");
const { getSettings, isConsentRequired } = require("./vtextSettingsService");
const { toUsSmsNumber } = require("../../utils/usPhone");
const { notifyVtextAlert } = require("../shared/slackService");
const { TEMPLATE_KEY, keyFor, planLeads } = require("../leads/facebookIntroText");

const AUTO_ENABLED = () => process.env.VTEXT_ENABLED === "true" && process.env.FACEBOOK_AUTO_TEXT_ENABLED === "true";

/** What planLeads needs to know about this one lead's phone: its contact, an earlier message with this key, an earlier intro to the number. */
async function lookupsFor(lead, phone) {
  const contact = await VtextContact.findOne({ phoneE164: phone }).select("phoneE164 optOut consent phoneStatus").lean();
  const prior = await VtextMessage.findOne({ idempotencyKey: keyFor(lead._id) }).select("idempotencyKey status").lean();
  const earlierIntro = contact ? await VtextMessage.exists({ "origin.templateKey": TEMPLATE_KEY, contactId: contact._id }) : null;
  return {
    contactsByPhone: new Map(contact ? [[phone, contact]] : []),
    sentByKey: new Map(prior ? [[keyFor(lead._id), prior]] : []),
    phonesAlreadyTexted: new Set(earlierIntro ? [phone] : []),
  };
}

// Skips that need no Slack message: nothing to look into, or already shown elsewhere (the lead alert
// says whether the form gave consent).
const QUIET_SKIP = /already|same phone|repeat|imported|gave no call|not both true|admin stopped/i;

/** Tells the Vtext Slack channel about a lead that did not get its text, for a reason somebody should see. */
async function alertNotTexted(doc, reason, notify = notifyVtextAlert) {
  if (QUIET_SKIP.test(reason)) return;
  const phone = String(doc.phoneNormalized || doc.phone || "");
  await notify({
    level: "warning",
    title: "Facebook lead was not texted",
    fields: [
      { label: "Lead", value: doc.fullName || doc.firstName },
      { label: "Phone", value: phone ? `…${phone.slice(-4)}` : "none" },
      { label: "Form", value: doc.formName || doc.formId },
      { label: "Why", value: reason },
    ],
  });
}

/**
 * Fire-and-forget; never throws.
 * @param {object} params
 * @param {object} params.doc - the Facebook form lead record
 * @param {boolean} params.isNew - false for a repeat submission from someone already on file
 * @param {object} [deps] - injected by tests: { enqueueOutbound, lookupsFor, notify, consentRequired }
 */
async function maybeSendFacebookIntroText({ doc, isNew }, deps = {}) {
  const send = deps.enqueueOutbound || enqueueOutbound;
  const lookup = deps.lookupsFor || lookupsFor;
  const consentRequired = deps.consentRequired || (async () => isConsentRequired(await getSettings()));
  const id = doc?._id;
  const skip = async (reason) => {
    console.log(`[facebook-form-text] SKIPPED ${id} — ${reason}`);
    await alertNotTexted(doc, reason, deps.notify).catch((e) => console.error("[facebook-form-text] Slack alert failed:", e.message));
  };
  try {
    if (!AUTO_ENABLED()) return await skip("VTEXT_ENABLED / FACEBOOK_AUTO_TEXT_ENABLED not both true");
    if (!isNew) return await skip("repeat submission, already on file");
    if (doc.importedFromHistory) return await skip("imported from history");
    if ((await consentRequired()) && (doc.consent !== true || doc.consentSource !== "form-disclaimer")) {
      return await skip("the form gave no call / text consent");
    }

    const phone = toUsSmsNumber(doc.phoneNormalized) || toUsSmsNumber(doc.phone);
    const { sendable, skipped } = planLeads([doc], phone ? await lookup(doc, phone) : { contactsByPhone: new Map(), sentByKey: new Map(), phonesAlreadyTexted: new Set() });
    if (!sendable.length) return await skip(skipped[0]?.reason || "not sendable");

    const { text, first } = sendable[0];
    const { message, blocked, reason } = await send({
      to: phone,
      body: text,
      origin: { kind: "automation", templateKey: TEMPLATE_KEY, leadRef: { leadType: "facebookForm", leadId: id } },
      contactName: doc.fullName || first,
      idempotencyKey: keyFor(id),
    });
    if (blocked) return await skip(`blocked by Vtext: ${reason}`);
    console.log(`[facebook-form-text] queued intro text for ${id} (message ${message?._id})`);
  } catch (err) {
    if (err?.code === 11000) return await skip("already texted (duplicate key)");
    console.error(`[facebook-form-text] failed for ${id}:`, err.message);
    await alertNotTexted(doc, `error: ${err.message}`, deps.notify).catch(() => {});
  }
}

module.exports = { maybeSendFacebookIntroText };
