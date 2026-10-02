// controller/sendify/sendifySettingsController.js
const catchAsyncError = require("../../middleware/catchAsyncError");
const { getSettings, updateSettings } = require("../../services/sendify/sendifySettingsService");

/** GET /api/v1/sendify/settings */
const getSendifySettings = catchAsyncError(async (req, res) => {
  const settings = await getSettings();
  return res.status(200).json({ success: true, settings });
});

/** PATCH /api/v1/sendify/settings — body: { quietHoursEnabled } */
const updateSendifySettings = catchAsyncError(async (req, res) => {
  const { quietHoursEnabled } = req.body;
  if (quietHoursEnabled !== undefined && typeof quietHoursEnabled !== "boolean") {
    return res.status(400).json({ success: false, message: "quietHoursEnabled must be a boolean" });
  }
  const settings = await updateSettings({ quietHoursEnabled });
  return res.status(200).json({ success: true, settings });
});

module.exports = { getSendifySettings, updateSendifySettings };
