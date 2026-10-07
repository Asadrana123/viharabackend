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
const { firstNameOf } = require("../../utils/firstName");
const { resolvePropertyTimezone } = require("../../utils/resolveTimezone");
const { getSiteUrl, listingPageUrl } = require("../../config/siteUrls");
const { formatShortMoney, formatAuctionDate, formatAuctionTime } = require("./vtextFormatters");

// Every property field the variables below read — one list so the preview,
// the Send tab and the follow-ups all load the same fields.
const PRODUCT_TEMPLATE_FIELDS =
  "productName street city state zipCode beds baths assetType propertyType startBid slug auctionStartDate auctionEndDate investmentData.valuation investmentData.rental";

/**
 * Canonical list of variables a template can use — shown in the admin UI's
 * variable-insertion panel. Keep in sync with resolvePropertyVariables/
 * resolveContactVariables below; every key here must be produced there, even
 * when empty. `scope: "contact"` variables vary per recipient (so a bulk
 * send renders once per recipient, not once for the whole batch); `scope:
 * "property"` variables are the same for everyone in a given send.
 */
const TEMPLATE_VARIABLES = [
  { key: "name", label: "Contact first name", scope: "contact", example: "Jane" },
  { key: "property_name", label: "Property name", scope: "property", example: "Kings Point Village Estate" },
  { key: "property_address", label: "Property address", scope: "property", example: "1703 Brookside Pine Ln, Kingwood, TX 77345" },
  { key: "property_type", label: "Property type", scope: "property", example: "Single Family Home" },
  { key: "property_beds", label: "Bedrooms", scope: "property", example: "5" },
  { key: "property_baths", label: "Bathrooms", scope: "property", example: "5" },
  { key: "property_short", label: "Street address only", scope: "property", example: "449 Georgia St" },
  { key: "city", label: "City", scope: "property", example: "Big Bear Lake" },
  { key: "property_price", label: "Starting bid", scope: "property", example: "$800,000" },
  { key: "opening_bid", label: "Opening bid (short)", scope: "property", example: "$525K" },
  { key: "auction_date", label: "Auction day", scope: "property", example: "Sat, Oct 17" },
  { key: "auction_time", label: "Auction hours", scope: "property", example: "11 AM–3:15 PM PT" },
  { key: "estimated_value", label: "Vihara estimate", scope: "property", example: "$1,037,000" },
  { key: "monthly_rent", label: "Estimated monthly rent", scope: "property", example: "$4,499" },
  { key: "listing_url", label: "Listing URL", scope: "property", example: "https://www.vihara.ai/listing/1703-brookside-pine-ln-kingwood" },
];

const formatCurrency = (n) => (typeof n === "number" && !Number.isNaN(n) ? `$${Math.round(n).toLocaleString("en-US")}` : "");

function buildAddress(product) {
  return [product.street, product.city, `${product.state || ""} ${product.zipCode || ""}`.trim()]
    .filter(Boolean)
    .join(", ");
}

function buildListingUrl(product) {
  return product.slug ? listingPageUrl(product.slug) : getSiteUrl();
}

/** @param {object} product - a lean productModel document */
function resolvePropertyVariables(product = {}) {
  const valuation = product.investmentData?.valuation || {};
  const rental = product.investmentData?.rental || {};
  const tz = resolvePropertyTimezone(product);

  return {
    property_name: product.productName || "",
    property_address: buildAddress(product),
    property_type: product.propertyType || product.assetType || "",
    property_beds: product.beds != null ? String(product.beds) : "",
    property_baths: product.baths != null ? String(product.baths) : "",
    property_short: product.street || "",
    city: product.city || "",
    property_price: formatCurrency(product.startBid),
    opening_bid: formatShortMoney(product.startBid),
    auction_date: formatAuctionDate(product.auctionStartDate, tz),
    auction_time: formatAuctionTime(product.auctionStartDate, product.auctionEndDate, tz),
    estimated_value: formatCurrency(valuation.ViharaValue || valuation.highRange),
    monthly_rent: formatCurrency(rental.estimatedMonthlyRent || rental.rentalValue),
    listing_url: buildListingUrl(product),
  };
}

/** @param {string} [name] - contact's name (full or first); only a safe first name is used (see utils/firstName.js). Blank when unknown — never guessed. */
function resolveContactVariables(name) {
  return { name: firstNameOf(name) };
}

/** Preview values for the template editor — real property data if given, else the catalog's own examples; `name` uses its own example (or a given sample name) since it's never resolved from a property. */
function buildPreviewValues(product, name) {
  const live = product ? { ...resolvePropertyVariables(product), ...resolveContactVariables(name) } : null;
  return TEMPLATE_VARIABLES.map((v) => ({ ...v, value: live ? live[v.key] || "" : name && v.key === "name" ? firstNameOf(name) : v.example }));
}

/** Replaces every {{key}} in body with values[key]. A key with no match in `values` is left as a literal {{key}} — same convention as vapiPromptService, so a typo'd variable is visible/debuggable rather than silently dropped. */
function renderTemplate(body, values) {
  let text = String(body || "");
  // No usable name: drop {{name}} with its leading space, so "Hi {{name}}, ..." reads "Hi, ..." and not "Hi , ...".
  if (values && values.name === "") {
    const nameFirst = /^\s*\{\{name\}\}[ \t,:;-]*/;
    if (nameFirst.test(text)) {
      text = text.replace(nameFirst, "");
      text = text.charAt(0).toUpperCase() + text.slice(1);
    }
    text = text.replace(/[ \t]*\{\{name\}\}/g, "");
  }
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => (key in values ? values[key] : match));
}

const ALLOWED_KEYS = new Set(TEMPLATE_VARIABLES.map((v) => v.key));

/** {{keys}} in `body` that are not in the catalog. A typo here would otherwise reach a lead as literal "{{typo}}". */
function findUnknownPlaceholders(body) {
  const unknown = new Set();
  for (const m of String(body || "").matchAll(/\{\{(\w+)\}\}/g)) if (!ALLOWED_KEYS.has(m[1])) unknown.add(m[1]);
  return [...unknown];
}

/**
 * Safety check on a rendered message. Returns a reason string when it must not
 * be sent — a {{placeholder}} is still in the text, or a required value that
 * the template uses is empty — and null when it is fine.
 * @param {string} templateBody - the body before rendering
 * @param {string} renderedText - the body after rendering
 * @param {object} values - the values it was rendered with
 * @param {string[]} requiredKeys - keys that must have a value when the template uses them
 */
function checkRendered(templateBody, renderedText, values, requiredKeys = []) {
  const left = String(renderedText || "").match(/\{\{\w+\}\}/);
  if (left) return `unresolved placeholder ${left[0]}`;
  const missing = requiredKeys.filter((k) => String(templateBody || "").includes(`{{${k}}}`) && !values[k]);
  if (missing.length) return `missing ${missing.join(", ")}`;
  return null;
}

/** Loads a property once — the shared half of a bulk send's per-recipient rendering, so the DB isn't hit once per number. */
async function loadTemplateAndProperty(templateId, propertyId) {
  if (!templateId) throw new Errorhandler("templateId is required", 400);
  if (!propertyId) throw new Errorhandler("propertyId is required", 400);
  if (!mongoose.Types.ObjectId.isValid(propertyId)) throw new Errorhandler("Invalid property id", 400);

  const template = await VtextTemplate.findById(templateId).lean();
  if (!template) throw new Errorhandler("Template not found", 404);

  const product = await Product.findById(propertyId).select(PRODUCT_TEMPLATE_FIELDS).lean();
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
  PRODUCT_TEMPLATE_FIELDS,
  findUnknownPlaceholders,
  checkRendered,
  resolvePropertyVariables,
  resolveContactVariables,
  buildPreviewValues,
  renderTemplate,
  loadTemplateAndProperty,
  renderTemplateForProperty,
};
