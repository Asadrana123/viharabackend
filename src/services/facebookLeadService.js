const axios = require("axios");
const productModel = require("../model/productModel");
const { resolveProperty } = require("./vapiPropertyService");
const { resolvePromptConfig } = require("./vapiPromptService");
const { runSingleCall } = require("./vapiCampaignService");

// Graph API version is env-overridable so it can be bumped without a code
// change when Meta deprecates an older one.
const GRAPH_API_VERSION = process.env.FB_GRAPH_API_VERSION || "v21.0";
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

// Every Facebook lead is pitched this one property for now. Override per
// environment with FB_LEAD_PROPERTY_SLUG.
const FB_LEAD_PROPERTY_SLUG =
  process.env.FB_LEAD_PROPERTY_SLUG || "1703-brookside-pine-ln-kingwood";

// ─── Field mapping ──────────────────────────────────────────────────────────
// Facebook returns field_data as [{ name, values: [...] }]. Field keys vary by
// how the form was built, so each of our fields accepts more than one alias.

const pickField = (fieldData, ...names) => {
  for (const name of names) {
    const entry = fieldData.find((f) => f.name === name);
    const value = entry?.values?.[0];
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
};

const mapLeadToContact = (lead) => {
  const fieldData = Array.isArray(lead.field_data) ? lead.field_data : [];

  const fullName =
    pickField(fieldData, "full_name") ||
    [pickField(fieldData, "first_name"), pickField(fieldData, "last_name")]
      .filter(Boolean)
      .join(" ");

  return {
    fullName,
    // parsePhones (inside buildContact) normalises this to E.164.
    phones: pickField(fieldData, "phone_number", "phone"),
    email: pickField(fieldData, "email") || null,
    city: pickField(fieldData, "city"),
    state: pickField(fieldData, "state"),
  };
};

// ─── Graph API ──────────────────────────────────────────────────────────────

/**
 * The webhook only carries a leadgen_id — the real field values must be
 * fetched from the Graph API with the Page access token.
 */
const fetchLead = async (leadgenId) => {
  if (!FB_PAGE_ACCESS_TOKEN) {
    throw new Error("FB_PAGE_ACCESS_TOKEN is not configured");
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${leadgenId}`;
  const { data } = await axios.get(url, {
    params: {
      access_token: FB_PAGE_ACCESS_TOKEN,
      fields: "field_data,created_time,id",
    },
  });

  return data;
};

// ─── Pitch resolution ───────────────────────────────────────────────────────

/**
 * Resolve the fixed FB property and its admin-authored prompt. Throws if the
 * slug does not match a property, if the property has no starting bid, or if
 * no prompt has been written — mirroring the call launcher's fail-fast rules.
 */
const resolveFbPitch = async () => {
  const product = await productModel
    .findOne({ slug: FB_LEAD_PROPERTY_SLUG })
    .select("_id productName")
    .lean();

  if (!product) {
    throw new Error(
      `FB lead property not found for slug "${FB_LEAD_PROPERTY_SLUG}"`
    );
  }

  const property = await resolveProperty(product._id);
  const promptConfig = await resolvePromptConfig(product._id);
  return { property, promptConfig };
};

// ─── Entry point ────────────────────────────────────────────────────────────

/**
 * Fetch one lead by id and dispatch Maya's call. Enrichment is off — Maya
 * starts fresh on Facebook leads for now.
 */
const processLead = async (leadgenId) => {
  const lead = await fetchLead(leadgenId);
  const contact = mapLeadToContact(lead);

  if (!contact.fullName || !contact.phones) {
    console.warn(
      `⚠️  FB lead ${leadgenId} missing name or phone — skipping call.`,
      contact
    );
    return { called: false, reason: "missing name or phone" };
  }

  const { property, promptConfig } = await resolveFbPitch();

  const result = await runSingleCall(contact, {
    enrich: false,
    property,
    promptConfig,
  });

  const anySuccess = result.calls.some((c) => c.success);
  console.log(
    `${anySuccess ? "✅" : "❌"} FB lead ${leadgenId} (${contact.fullName}) → call ${
      anySuccess ? "dispatched" : "failed"
    }`
  );

  return { called: anySuccess, contact: contact.fullName };
};

module.exports = {
  processLead,
  mapLeadToContact,
  resolveFbPitch,
};
