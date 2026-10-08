// controller/vtext/vtextTemplateController.js
const catchAsyncError = require("../../middleware/catchAsyncError");
const VtextTemplate = require("../../model/vtext/vtextTemplateModel");
const Product = require("../../model/property/productModel");
const {
  PRODUCT_TEMPLATE_FIELDS,
  findUnknownPlaceholders,
  buildPreviewValues,
  renderTemplateForProperty,
  loadTemplateAndProperty,
} = require("../../services/vtext/vtextTemplateService");

/** 400 text for a body that uses a {{placeholder}} we don't have, or null when every one is known. */
const unknownPlaceholderMessage = (body) => {
  const unknown = findUnknownPlaceholders(body);
  return unknown.length ? `Unknown placeholder${unknown.length > 1 ? "s" : ""}: ${unknown.map((k) => `{{${k}}}`).join(", ")}. Use the variable list in the editor.` : null;
};

/** GET /api/v1/vtext/templates/variables?propertyId?&name? — the catalog for the variable-insertion panel, optionally previewed against a real property and/or a sample name. */
const getTemplateVariables = catchAsyncError(async (req, res) => {
  const { propertyId, name } = req.query;
  let product = null;
  if (propertyId) {
    product = await Product.findById(propertyId).select(PRODUCT_TEMPLATE_FIELDS).lean();
  }
  return res.status(200).json({ success: true, variables: buildPreviewValues(product, name) });
});

/** POST /api/v1/vtext/templates — body: { name, body } */
const createTemplate = catchAsyncError(async (req, res) => {
  const { name, body } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ success: false, message: "name is required" });
  if (!body || !body.trim()) return res.status(400).json({ success: false, message: "body is required" });
  const badPlaceholder = unknownPlaceholderMessage(body);
  if (badPlaceholder) return res.status(400).json({ success: false, message: badPlaceholder });

  const template = await VtextTemplate.create({
    name,
    body,
    createdBy: { adminId: req.user?._id, adminName: req.user?.name },
  });
  return res.status(201).json({ success: true, template });
});

/** GET /api/v1/vtext/templates */
const listTemplates = catchAsyncError(async (req, res) => {
  const templates = await VtextTemplate.find().sort({ updatedAt: -1 });
  return res.status(200).json({ success: true, templates });
});

/** GET /api/v1/vtext/templates/:id */
const getTemplate = catchAsyncError(async (req, res) => {
  const template = await VtextTemplate.findById(req.params.id);
  if (!template) return res.status(404).json({ success: false, message: "Template not found" });
  return res.status(200).json({ success: true, template });
});

const AUTO_SIGNUP_ROLES = ["", "quote_in_range", "quote_short"];

/** PATCH /api/v1/vtext/templates/:id — body may also include autoSignupRole ("quote_in_range" | "quote_short" | "") to designate this one for the automated signup text (clears that role on every other template first, so each role has at most one). */
const updateTemplate = catchAsyncError(async (req, res) => {
  const { name, body, autoSignupRole } = req.body;
  if (body !== undefined) {
    const badPlaceholder = unknownPlaceholderMessage(body);
    if (badPlaceholder) return res.status(400).json({ success: false, message: badPlaceholder });
  }
  if (autoSignupRole !== undefined && !AUTO_SIGNUP_ROLES.includes(autoSignupRole)) {
    return res.status(400).json({ success: false, message: "autoSignupRole must be quote_in_range, quote_short or empty" });
  }
  const update = {};
  if (name !== undefined) update.name = name;
  if (body !== undefined) update.body = body;
  if (autoSignupRole !== undefined) update.autoSignupRole = autoSignupRole;

  if (autoSignupRole) {
    await VtextTemplate.updateMany({ _id: { $ne: req.params.id }, autoSignupRole }, { $set: { autoSignupRole: "" } });
  }

  const template = await VtextTemplate.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!template) return res.status(404).json({ success: false, message: "Template not found" });
  return res.status(200).json({ success: true, template });
});

/** DELETE /api/v1/vtext/templates/:id */
const deleteTemplate = catchAsyncError(async (req, res) => {
  const template = await VtextTemplate.findByIdAndDelete(req.params.id);
  if (!template) return res.status(404).json({ success: false, message: "Template not found" });
  return res.status(200).json({ success: true });
});

/** POST /api/v1/vtext/templates/:id/preview — body: { propertyId, name? } → the rendered text, for the Send tab's live preview before launching a send. */
const previewTemplate = catchAsyncError(async (req, res) => {
  const { propertyId, name } = req.body;
  const { template, product } = await loadTemplateAndProperty(req.params.id, propertyId);
  // A quote template has no real quote in a preview, so show a sample: the starting bid for the in-range text, a little under it for the short one.
  const startBid = Number(product.startBid) || 0;
  const quotePrice = req.body.quotePrice || (template.autoSignupRole === "quote_short" ? Math.max(startBid - 15000, 0) : startBid) || undefined;
  const { body, property } = await renderTemplateForProperty(req.params.id, propertyId, name, { quotePrice });
  return res.status(200).json({ success: true, body, property: { id: property._id, name: property.productName } });
});

module.exports = {
  getTemplateVariables,
  createTemplate,
  listTemplates,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  previewTemplate,
};
