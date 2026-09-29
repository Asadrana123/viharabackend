const multer = require("multer");
const catchAsyncError = require("../../middleware/catchAsyncError");
const Errorhandler = require("../../utils/errorhandler");
const templateService = require("../../services/marketing/templateService");
const { TEMPLATE_LIMITS } = require("../../config/marketing/templateConfig");

// All business logic lives in services/marketing/templateService.js.
// These handlers only read the request and shape the response.

// ─── IMAGE UPLOAD MIDDLEWARE ────────────────────────────────────────────────
// One image in the "image" field, kept in memory and streamed to Cloudinary.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TEMPLATE_LIMITS.maxAssetBytes, files: 1 },
});

exports.uploadAssetFile = (req, res, next) => {
  upload.single("image")(req, res, (error) => {
    if (!error) return next();
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? `Template images must be ${TEMPLATE_LIMITS.maxAssetBytes / (1024 * 1024)} MB or smaller`
        : error.message || "Image upload failed";
    next(new Errorhandler(message, 400));
  });
};

// ─── LIST ───────────────────────────────────────────────────────────────────
// ?includeArchived=true also returns archived templates.
exports.listTemplates = catchAsyncError(async (req, res) => {
  const templates = await templateService.listTemplates({
    includeArchived: req.query.includeArchived === "true",
  });
  res.status(200).json({ success: true, templates });
});

// ─── GET ONE (with HTML) ───────────────────────────────────────────────────
exports.getTemplate = catchAsyncError(async (req, res) => {
  const template = await templateService.getTemplate(req.params.templateId);
  res.status(200).json({ success: true, template });
});

// ─── VERSIONS ───────────────────────────────────────────────────────────────
exports.listTemplateVersions = catchAsyncError(async (req, res) => {
  const versions = await templateService.listTemplateVersions(req.params.templateId);
  res.status(200).json({ success: true, versions });
});

// ─── CREATE ─────────────────────────────────────────────────────────────────
// Body: { name, description, html: { square, tall }, slots, assets }
exports.createTemplate = catchAsyncError(async (req, res) => {
  const template = await templateService.createTemplate({ data: req.body, userId: req.user._id });
  res.status(201).json({ success: true, message: "Template saved", template });
});

// ─── EDIT (saves a new version) ────────────────────────────────────────────
exports.updateTemplate = catchAsyncError(async (req, res) => {
  const template = await templateService.updateTemplate({
    templateId: req.params.templateId,
    data: req.body,
    userId: req.user._id,
  });
  res.status(200).json({ success: true, message: `Saved as version ${template.version}`, template });
});

// ─── PREVIEW ────────────────────────────────────────────────────────────────
// Body: { html: { square, tall }, assets }. Returns PNG data URIs per format.
exports.previewTemplate = catchAsyncError(async (req, res) => {
  const previews = await templateService.previewTemplate(req.body);
  res.status(200).json({ success: true, previews });
});

// ─── DEFAULTS ───────────────────────────────────────────────────────────────
// Body: { slots: ["staticA", ...] } - this template becomes the default for
// exactly these slots.
exports.setTemplateDefaults = catchAsyncError(async (req, res) => {
  const templates = await templateService.setTemplateDefaults({
    templateId: req.params.templateId,
    slots: req.body?.slots,
  });
  res.status(200).json({ success: true, message: "Defaults updated", templates });
});

// ─── ARCHIVE / RESTORE ─────────────────────────────────────────────────────
exports.archiveTemplate = catchAsyncError(async (req, res) => {
  const template = await templateService.archiveTemplate({ templateId: req.params.templateId, userId: req.user._id });
  res.status(200).json({ success: true, message: "Template archived", template });
});

exports.restoreTemplate = catchAsyncError(async (req, res) => {
  const template = await templateService.restoreTemplate({ templateId: req.params.templateId });
  res.status(200).json({ success: true, message: "Template restored", template });
});

// ─── UPLOAD A TEMPLATE IMAGE ───────────────────────────────────────────────
// multipart/form-data, field "image". Returns { url, publicId } to put in the
// template's assets list.
exports.uploadTemplateAsset = catchAsyncError(async (req, res) => {
  const asset = await templateService.uploadTemplateAsset(req.file);
  res.status(201).json({ success: true, message: "Image uploaded", asset });
});
