// services/vtext/vtextTemplateService.js
//
// Property-scoped {{variable}} templates for the Send tab (sfy- UI). Deliberately
// its own, independent variable catalog and resolver — NOT a reuse of
// vapiPropertyService.js's buildVariableValues, because that one formats
// currency as spoken words for VAPI's text-to-speech ("eight hundred
// thousand dollars"), which is wrong for a text message ("$800,000").
const mongoose = require("mongoose");
const Product = require("../../model/property/productModel");
const VtextTemplate = require("../../model/vtext/vtextTemplateModel");
const Errorhandler = require("../../utils/errorhandler");

const SITE_DOMAIN = "vihara.ai";

/**
 * Canonical list of variables a template can use — shown in the admin UI's
 * variable-insertion panel. Keep in sync with resolvePropertyVariables/
 * resolveContactVariables below; every key here must be produced there, even
 * when empty. `scope: "contact"` variables vary per recipient (so a bulk
 * send renders once per recipient, not once for the whole batch); `scope:
 * "property"` variables are the same for everyone in a given send.
 */
const TEMPLATE_VARIABLES = [
  { key: "name", label: "Contact name", scope: "contact", example: "Jane" },
  { key: "property_name", label: "Property name", scope: "property", example: "Kings Point Village Estate" },
  { key: "property_address", label: "Property address", scope: "property", example: "1703 Brookside Pine Ln, Kingwood, TX 77345" },
  { key: "property_type", label: "Property type", scope: "property", example: "Single Family Home" },
  { key: "property_beds", label: "Bedrooms", scope: "property", example: "5" },
  { key: "property_baths", label: "Bathrooms", scope: "property", example: "5" },
  { key: "property_price", label: "Starting bid", scope: "property", example: "$800,000" },
  { key: "estimated_value", label: "Vihara estimate", scope: "property", example: "$1,037,000" },
  { key: "monthly_rent", label: "Estimated monthly rent", scope: "property", example: "$4,499" },
  { key: "listing_url", label: "Listing URL", scope: "property", example: "vihara.ai/listing/1703-brookside-pine-ln-kingwood" },
];

const formatCurrency = (n) => (typeof n === "number" && !Number.isNaN(n) ? `$${Math.round(n).toLocaleString("en-US")}` : "");

function buildAddress(product) {
  return [product.street, product.city, `${product.state || ""} ${product.zipCode || ""}`.trim()]
    .filter(Boolean)
    .join(", ");
}

function buildListingUrl(product) {
  return product.slug ? `https://${SITE_DOMAIN}/listing/${product.slug}` : `https://${SITE_DOMAIN}`;
}

/** @param {object} product - a lean productModel document */
function resolvePropertyVariables(product = {}) {
  const valuation = product.investmentData?.valuation || {};
  const rental = product.investmentData?.rental || {};

  return {
    property_name: product.productName || "",
    property_address: buildAddress(product),
    property_type: product.propertyType || product.assetType || "",
    property_beds: product.beds != null ? String(product.beds) : "",
    property_baths: product.baths != null ? String(product.baths) : "",
    property_price: formatCurrency(product.startBid),
    estimated_value: formatCurrency(valuation.ViharaValue || valuation.highRange),
    monthly_rent: formatCurrency(rental.estimatedMonthlyRent || rental.rentalValue),
    listing_url: buildListingUrl(product),
  };
}

/** @param {string} [name] - contact's name, blank when unknown — never guessed. */
function resolveContactVariables(name) {
  return { name: name || "" };
}

/** Preview values for the template editor — real property data if given, else the catalog's own examples; `name` uses its own example (or a given sample name) since it's never resolved from a property. */
function buildPreviewValues(product, name) {
  const live = product ? { ...resolvePropertyVariables(product), ...resolveContactVariables(name) } : null;
  return TEMPLATE_VARIABLES.map((v) => ({ ...v, value: live ? live[v.key] || "" : name && v.key === "name" ? name : v.example }));
}

/** Replaces every {{key}} in body with values[key]. A key with no match in `values` is left as a literal {{key}} — same convention as vapiPromptService, so a typo'd variable is visible/debuggable rather than silently dropped. */
function renderTemplate(body, values) {
  return String(body || "").replace(/\{\{(\w+)\}\}/g, (match, key) => (key in values ? values[key] : match));
}

/** Loads a property once — the shared half of a bulk send's per-recipient rendering, so the DB isn't hit once per number. */
async function loadTemplateAndProperty(templateId, propertyId) {
  if (!templateId) throw new Errorhandler("templateId is required", 400);
  if (!propertyId) throw new Errorhandler("propertyId is required", 400);
  if (!mongoose.Types.ObjectId.isValid(propertyId)) throw new Errorhandler("Invalid property id", 400);

  const template = await VtextTemplate.findById(templateId).lean();
  if (!template) throw new Errorhandler("Template not found", 404);

  const product = await Product.findById(propertyId)
    .select("productName street city state zipCode beds baths assetType propertyType startBid slug investmentData.valuation investmentData.rental")
    .lean();
  if (!product) throw new Errorhandler("Property not found", 404);

  return { template, product, propertyValues: resolvePropertyVariables(product) };
}

/** Loads a property and renders a template against it (+ an optional recipient name) in one call — what the Send tab's single-send and preview both need. */
async function renderTemplateForProperty(templateId, propertyId, name) {
  const { template, product, propertyValues } = await loadTemplateAndProperty(templateId, propertyId);
  const values = { ...propertyValues, ...resolveContactVariables(name) };
  return { template, property: product, body: renderTemplate(template.body, values), values };
}

module.exports = {
  TEMPLATE_VARIABLES,
  resolvePropertyVariables,
  resolveContactVariables,
  buildPreviewValues,
  renderTemplate,
  loadTemplateAndProperty,
  renderTemplateForProperty,
};
