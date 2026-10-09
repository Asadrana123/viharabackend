// controller/brand/brandKitController.js
//
// The Brand Kit: the colours, fonts and messaging every page uses.
//   GET  — public: the website loads it on every page to apply the colours/fonts
//   PUT  — admin: save changes from the Brand Kit page
//   POST /reset — admin: go back to the defaults
const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");
const BrandKit = require("../../model/brand/brandKitModel");
const { ALLOWED_FONTS, COLOR_FIELDS } = require("../../config/brandKitDefaults");
const { MESSAGING_FIELDS, mergeWithDefaults } = require("../../services/brand/brandKitService");

const HEX = /^#[0-9a-f]{6}$/i;

const adminName = (user) =>
  [user?.name, user?.last_name].filter(Boolean).join(" ") || user?.email || "Admin";

const respond = (res, saved) =>
  res.status(200).json({
    success: true,
    brandKit: mergeWithDefaults(saved),
    options: { fonts: ALLOWED_FONTS, colorFields: COLOR_FIELDS },
  });

// Returns { update } or { error }. Only fields present in the body are changed.
const pickUpdate = (body) => {
  const update = {};
  if (body.colors !== undefined) {
    if (!body.colors || typeof body.colors !== "object") return { error: "colors must be an object" };
    for (const [key, value] of Object.entries(body.colors)) {
      if (!COLOR_FIELDS[key]) return { error: `Unknown colour "${key}"` };
      if (typeof value !== "string" || !HEX.test(value)) {
        return { error: `${COLOR_FIELDS[key].label} must be a colour like #0c4bea` };
      }
      update[`colors.${key}`] = value.toLowerCase();
    }
  }
  if (body.fonts !== undefined) {
    for (const slot of ["heading", "body"]) {
      const font = body.fonts?.[slot];
      if (font === undefined) continue;
      if (!ALLOWED_FONTS.includes(font)) return { error: `"${font}" is not an allowed font` };
      update[`fonts.${slot}`] = font;
    }
  }
  if (body.radius !== undefined) {
    const n = Number(body.radius);
    if (!Number.isInteger(n) || n < 0 || n > 24) return { error: "Corner roundness must be 0–24" };
    update.radius = n;
  }
  if (body.messaging !== undefined) {
    for (const field of MESSAGING_FIELDS) {
      const value = body.messaging?.[field];
      if (value === undefined) continue;
      if (typeof value !== "string") return { error: `${field} must be text` };
      update[`messaging.${field}`] = value.trim();
    }
  }
  return { update };
};

exports.getBrandKit = catchAsyncError(async (req, res) => {
  const saved = await BrandKit.findOne({ key: "default" });
  respond(res, saved);
});

exports.updateBrandKit = catchAsyncError(async (req, res, next) => {
  const { update, error } = pickUpdate(req.body || {});
  if (error) return next(new ErrorHandler(error, 400));
  if (Object.keys(update).length === 0) return next(new ErrorHandler("Nothing to update", 400));

  const saved = await BrandKit.findOneAndUpdate(
    { key: "default" },
    { $set: { ...update, updatedByName: adminName(req.user) } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  respond(res, saved);
});

exports.resetBrandKit = catchAsyncError(async (req, res) => {
  await BrandKit.deleteOne({ key: "default" });
  respond(res, null);
});
