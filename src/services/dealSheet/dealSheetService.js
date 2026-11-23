// services/dealSheet/dealSheetService.js
//
// A /deal lead's private deal sheet: build it (render the PDF on the website, store it on Cloudinary),
// email it (E1, template 198, with the PDF attached), and rebuild it when something on it changes.
//
//   sign-up          build, wait up to 60 s for the PDF, then email (with the PDF, or the link only)
//   phone confirmed  rebuild (version + 1) so the ✓ shows; no new email
//   wrong email      rebuild and email the new address
//   signs up again   email the sheet they already have, to the address on the lead (at most once a day)
//
// Every export is fire-and-forget safe: none of them throws.
const crypto = require("crypto");
const PropertyLead = require("../../model/leads/propertyLeadModel");
const productModel = require("../../model/property/productModel");
const { buildSheetData, emailParams } = require("./dealSheetData");
const { renderPdf, storePdf, fetchStoredPdf } = require("./dealSheetRender");
const { sendDealSheetEmail } = require("../propertyEmail/propertyEmailService");
const { PDF_WAIT_MS } = require("../../config/dealSheet");

// Everything dealSheetData and the email read from the inventory record.
const PRODUCT_FIELDS =
  "_id slug productName street city state zipCode propertyType assetType beds baths squareFootage startBid investmentData.valuation investmentData.rental occupancyStatus financeability auctionStartDate auctionEndDate image otherImages features isLandingPage emailSequenceEnabled brevoListId cashOnly advisor";

// "VH-" + 4 characters with no look-alikes (no 0/O, 1/I/L).
const REF_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const newRef = () => `VH-${Array.from({ length: 4 }, () => REF_CHARS[crypto.randomInt(REF_CHARS.length)]).join("")}`;
const newToken = () => crypto.randomBytes(18).toString("base64url");
const newMarker = () => crypto.randomBytes(6).toString("base64url");
const newAccessKey = () => crypto.randomBytes(24).toString("hex");

/** Fresh identifiers for a new /deal lead. */
function newIdentifiers() {
  return { ref: newRef(), accessKey: newAccessKey(), token: newToken(), marker: newMarker() };
}

async function loadProduct(slug) {
  return productModel.findOne({ slug }).select(PRODUCT_FIELDS).lean();
}

/** The sheet's data, read fresh (for the /s/ page and the PDF). */
async function sheetFor(lead) {
  const product = await loadProduct(lead.propertySlug);
  if (!product) return null;
  return { sheet: buildSheetData(lead, product), product };
}

/**
 * Render + store a new version of the lead's PDF. Never throws.
 * @returns {Promise<{ pdfUrl: string|null, error?: string }>}
 */
async function buildSheet(leadId) {
  const tag = `[deal-sheet] lead ${leadId}`;
  try {
    const lead = await PropertyLead.findById(leadId).lean();
    if (!lead?.dealSheet?.token) return { pdfUrl: null, error: "not a deal sheet lead" };
    const found = await sheetFor(lead);
    if (!found) return { pdfUrl: null, error: "property not found" };
    const version = (lead.dealSheet.version || 0) + 1;
    const started = Date.now();
    try {
      const pdf = await renderPdf(found.sheet);
      const pdfUrl = await storePdf(pdf, { token: lead.dealSheet.token, version });
      await PropertyLead.updateOne(
        { _id: lead._id },
        { $set: { "dealSheet.pdfUrl": pdfUrl, "dealSheet.version": version, "dealSheet.builtAt": new Date(), "dealSheet.buildError": "" } }
      );
      console.log(`${tag} built v${version} in ${Math.round((Date.now() - started) / 1000)}s`);
      return { pdfUrl, pdf };
    } catch (err) {
      await PropertyLead.updateOne({ _id: lead._id }, { $set: { "dealSheet.buildError": String(err.message).slice(0, 300) } });
      console.error(`${tag} build failed:`, err.message);
      return { pdfUrl: null, error: err.message };
    }
  } catch (err) {
    console.error(`${tag} build crashed:`, err.message);
    return { pdfUrl: null, error: err.message };
  }
}

/** The latest PDF's bytes (signed download), or null. */
async function latestPdf(lead) {
  if (!lead?.dealSheet?.pdfUrl || !lead.dealSheet.version) return null;
  try {
    return await fetchStoredPdf({ token: lead.dealSheet.token, version: lead.dealSheet.version });
  } catch (err) {
    console.error(`[deal-sheet] lead ${lead._id}: ${err.message}`);
    return null;
  }
}

/**
 * Email the sheet to the lead's address, with the PDF attached as bytes (Brevo can't download it from Cloudinary).
 * Without the bytes it goes with the link only.
 */
async function emailSheet(leadId, { pdf, dedupKey }) {
  const lead = await PropertyLead.findById(leadId).lean();
  if (!lead) return { sent: false };
  const product = await loadProduct(lead.propertySlug);
  if (!product) return { sent: false };
  const sheet = buildSheetData(lead, product);
  const result = await sendDealSheetEmail({
    property: product,
    lead,
    params: emailParams(sheet, lead),
    pdfBase64: (pdf || (await latestPdf(lead)))?.toString("base64") || "",
    dedupKey,
  });
  if (result.sent) {
    await PropertyLead.updateOne({ _id: lead._id }, { $set: { "dealSheet.sentAt": new Date(), "dealSheet.emailedTo": lead.email } });
  }
  return result;
}

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve({ pdfUrl: null, error: "timed out" }), ms))]);

/** Sign-up: build, wait up to 60 s for the PDF, then email it (or the link only). */
async function onDealSignup(leadId) {
  try {
    const built = await withTimeout(buildSheet(leadId), PDF_WAIT_MS);
    const lead = await PropertyLead.findById(leadId).select("email").lean();
    await emailSheet(leadId, { pdf: built.pdf, dedupKey: `deal-sheet|${leadId}|${lead?.email || ""}` });
  } catch (err) {
    console.error(`[deal-sheet] sign-up flow failed for lead ${leadId}:`, err.message);
  }
}

/** Phone confirmed: rebuild so the ✓ shows. No new email. */
async function onPhoneVerified(leadId) {
  await buildSheet(leadId);
}

/** Wrong email: rebuild and send it to the new address. */
async function onEmailChanged(leadId) {
  try {
    const built = await withTimeout(buildSheet(leadId), PDF_WAIT_MS);
    const lead = await PropertyLead.findById(leadId).select("email").lean();
    await emailSheet(leadId, { pdf: built.pdf, dedupKey: `deal-sheet|${leadId}|${lead?.email || ""}|v${Date.now()}` });
  } catch (err) {
    console.error(`[deal-sheet] email change flow failed for lead ${leadId}:`, err.message);
  }
}

/** Signed up again for the same deal: email the sheet they already have, to the address on the lead. */
async function resendExisting(leadId) {
  try {
    const lead = await PropertyLead.findById(leadId).lean();
    if (!lead?.dealSheet?.token) return;
    const pdf = lead.dealSheet.pdfUrl ? null : (await withTimeout(buildSheet(leadId), PDF_WAIT_MS)).pdf;
    const day = new Date().toISOString().slice(0, 10);
    await emailSheet(leadId, { pdf, dedupKey: `deal-sheet-again|${leadId}|${day}` });
  } catch (err) {
    console.error(`[deal-sheet] resend failed for lead ${leadId}:`, err.message);
  }
}

module.exports = { emailSheet, latestPdf, newIdentifiers, newRef, sheetFor, buildSheet, onDealSignup, onPhoneVerified, onEmailChanged, resendExisting, PRODUCT_FIELDS };
