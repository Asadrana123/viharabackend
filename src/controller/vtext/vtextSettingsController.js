// controller/vtext/vtextSettingsController.js
const catchAsyncError = require("../../middleware/catchAsyncError");
const { getSettings, updateSettings } = require("../../services/vtext/vtextSettingsService");

/** GET /api/v1/vtext/settings */
const getVtextSettings = catchAsyncError(async (req, res) => {
  const settings = await getSettings();
  return res.status(200).json({ success: true, settings });
});

/** PATCH /api/v1/vtext/settings — body: { aiAutoReplyEnabled? } */
const updateVtextSettings = catchAsyncError(async (req, res) => {
  const { aiAutoReplyEnabled } = req.body;
  if (aiAutoReplyEnabled !== undefined && typeof aiAutoReplyEnabled !== "boolean") {
    return res.status(400).json({ success: false, message: "aiAutoReplyEnabled must be a boolean" });
  }
  const settings = await updateSettings({ aiAutoReplyEnabled });
  return res.status(200).json({ success: true, settings });
});

module.exports = { getVtextSettings, updateVtextSettings };
