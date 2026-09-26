// services/enrichment/researchSummary.js
//
// Builds the prospect_research string for enrichment-list calls (enrich.md
// §7.2, decision #4). Built fresh from the effective contact and the
// property picked for *this* dispatch — never a hardcoded property, unlike
// shared/fullenrichService.js's buildResearchSummary (untouched, still has
// the "Oakland" text — enrich.md §11 known issue, not fixed there).

/**
 * @param {object} contact - effectiveContact() output (enrichmentContactsService.js)
 * @param {object} property - vapiPropertyService.resolveProperty() output ({ name, address, ... })
 * @returns {string} "" if there's nothing to say (no enrichment/CSV context at all)
 */
const CONTACT_TYPE_LABEL = {
  buyer: "a buyer",
  seller: "a seller",
  llc_owner: "an LLC property owner",
};

const buildResearchSummary = (contact = {}, property = {}) => {
  const parts = [];

  if (contact.fullName) parts.push(`Prospect name: ${contact.fullName}.`);
  if (contact.company) parts.push(`They are associated with ${contact.company}.`);
  if (contact.jobTitle) parts.push(`Job title: ${contact.jobTitle}.`);
  if (contact.industry) parts.push(`Industry: ${contact.industry}.`);

  const typeLabel = CONTACT_TYPE_LABEL[contact.contactType];
  if (typeLabel) parts.push(`They are ${typeLabel}.`);

  if (contact.activeMarket) parts.push(`They're active in the ${contact.activeMarket} market.`);

  const ownAddress = [contact.address, contact.city, contact.state].filter(Boolean).join(", ");
  if (ownAddress) parts.push(`They own property at ${ownAddress}.`);

  if (parts.length === 0) return "";

  const propertyName = property?.name || "the property";
  const propertyAddress = property?.address ? ` at ${property.address}` : "";
  parts.push(
    `Use this background to craft a personalized opening line that connects their profile to ${propertyName}${propertyAddress}. Make it feel natural, not scripted.`
  );

  return parts.join(" ");
};

module.exports = { buildResearchSummary };
