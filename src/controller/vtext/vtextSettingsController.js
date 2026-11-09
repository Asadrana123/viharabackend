// controller/vtext/vtextSettingsController.js
const catchAsyncError = require("../../middleware/catchAsyncError");
const { getSettings, updateSettings, isConsentRequired } = require("../../services/vtext/vtextSettingsService");
const { notifyVtextAlert } = require("../../services/shared/slackService");

/** GET /api/v1/vtext/settings */
const getVtextSettings = catchAsyncError(async (req, res) => {
  const settings = await getSettings();
  return res.status(200).json({ success: true, settings });
});

/** PATCH /api/v1/vtext/settings — body: { aiAutoReplyEnabled?, followUpsEnabled?, requireConsent?, smsOnly? } */
const updateVtextSettings = catchAsyncError(async (req, res) => {
  const { aiAutoReplyEnabled, followUpsEnabled, requireConsent, smsOnly } = req.body;
  if (smsOnly !== undefined && typeof smsOnly !== "boolean") {
    return res.status(400).json({ success: false, message: "smsOnly must be a boolean" });
  }
  if (aiAutoReplyEnabled !== undefined && typeof aiAutoReplyEnabled !== "boolean") {
    return res.status(400).json({ success: false, message: "aiAutoReplyEnabled must be a boolean" });
  }
  if (followUpsEnabled !== undefined && typeof followUpsEnabled !== "boolean") {
    return res.status(400).json({ success: false, message: "followUpsEnabled must be a boolean" });
  }
  if (requireConsent !== undefined && typeof requireConsent !== "boolean") {
    return res.status(400).json({ success: false, message: "requireConsent must be a boolean" });
  }

  const before = await getSettings();
  const settings = await updateSettings({ aiAutoReplyEnabled, followUpsEnabled, requireConsent, smsOnly }, req.user);

  // Moving texts between iMessage and SMS changes who sees which number and what it costs: tell the channel.
  if (smsOnly !== undefined && Boolean(before.smsOnly) !== smsOnly) {
    notifyVtextAlert({
      level: smsOnly ? "warning" : "info",
      icon: smsOnly ? "📱" : "💬",
      title: smsOnly ? "SMS only turned ON" : "SMS only turned OFF, iMessage is back",
      fields: [
        { label: "By", value: req.user?.name || "unknown admin" },
        {
          label: "Effect",
          value: smsOnly
            ? "New texts to US numbers go out by SMS on the Twilio line, not iMessage (Twilio: 100 a day, 20 new people an hour; the rest wait). Images, non-US numbers and texts pinned to a channel still use iMessage."
            : "New texts go by iMessage first again, with SMS as the fallback.",
          wide: true,
        },
      ],
    }).catch(() => {});
  }

  // Someone moving the consent switch is worth a Slack message either way.
  if (requireConsent !== undefined && isConsentRequired(before) !== requireConsent) {
    notifyVtextAlert({
      level: requireConsent ? "info" : "warning",
      icon: requireConsent ? "🔒" : "🔓",
      title: requireConsent ? "Consent check turned ON" : "Consent check turned OFF", // Slack adds the "Vtext:" prefix itself
      fields: [
        { label: "By", value: req.user?.name || "unknown admin" },
        { label: "Effect", value: requireConsent ? "Only contacts with consent are texted again" : "Contacts with no consent on file can now be texted. Opt-outs are still blocked." },
      ],
    }).catch(() => {});
  }

  return res.status(200).json({ success: true, settings });
});

module.exports = { getVtextSettings, updateVtextSettings };
