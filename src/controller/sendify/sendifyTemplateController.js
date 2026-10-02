// controller/sendify/sendifyTemplateController.js
const catchAsyncError = require("../../middleware/catchAsyncError");
const SendifyTemplate = require("../../model/sendify/sendifyTemplateModel");
const Product = require("../../model/property/productModel");
const {
  TEMPLATE_VARIABLES,
  buildPreviewValues,
  renderTemplateForProperty,
} = require("../../services/sendify/sendifyTemplateService");

/** GET /api/v1/sendify/templates/variables?propertyId?&name? — the catalog for the variable-insertion panel, optionally previewed against a real property and/or a sample name. */
const getTemplateVariables = catchAsyncError(async (req, res) => {
  const { propertyId, name } = req.query;
  let product = null;
  if (propertyId) {
    product = await Product.findById(propertyId)
      .select("productName street city state zipCode beds baths assetType propertyType startBid slug investmentData.valuation investmentData.rental")
      .lean();
  }
  return res.status(200).json({ success: true, variables: buildPreviewValues(product, name) });
});

/** POST /api/v1/sendify/templates — body: { name, body } */
const createTemplate = catchAsyncError(async (req, res) => {
  const { name, body } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ success: false, message: "name is required" });
  if (!body || !body.trim()) return res.status(400).json({ success: false, message: "body is required" });

  const template = await SendifyTemplate.create({
    name,
    body,
    createdBy: { adminId: req.user?._id, adminName: req.user?.name },
  });
  return res.status(201).json({ success: true, template });
});

/** GET /api/v1/sendify/templates */
const listTemplates = catchAsyncError(async (req, res) => {
  const templates = await SendifyTemplate.find().sort({ updatedAt: -1 });
  return res.status(200).json({ success: true, templates });
});

/** GET /api/v1/sendify/templates/:id */
const getTemplate = catchAsyncError(async (req, res) => {
  const template = await SendifyTemplate.findById(req.params.id);
  if (!template) return res.status(404).json({ success: false, message: "Template not found" });
  return res.status(200).json({ success: true, template });
});

/** PATCH /api/v1/sendify/templates/:id */
const updateTemplate = catchAsyncError(async (req, res) => {
  const { name, body } = req.body;
  const update = {};
  if (name !== undefined) update.name = name;
  if (body !== undefined) update.body = body;

  const template = await SendifyTemplate.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!template) return res.status(404).json({ success: false, message: "Template not found" });
  return res.status(200).json({ success: true, template });
});

/** DELETE /api/v1/sendify/templates/:id */
const deleteTemplate = catchAsyncError(async (req, res) => {
  const template = await SendifyTemplate.findByIdAndDelete(req.params.id);
  if (!template) return res.status(404).json({ success: false, message: "Template not found" });
  return res.status(200).json({ success: true });
});

/** POST /api/v1/sendify/templates/:id/preview — body: { propertyId, name? } → the rendered text, for the Send tab's live preview before launching a send. */
const previewTemplate = catchAsyncError(async (req, res) => {
  const { propertyId, name } = req.body;
  const { body, property } = await renderTemplateForProperty(req.params.id, propertyId, name);
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
