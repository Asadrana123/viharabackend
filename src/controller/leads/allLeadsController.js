// controller/leads/allLeadsController.js
const catchAsyncError = require("../../middleware/catchAsyncError");
const Product = require("../../model/property/productModel");
const { ALL_LEAD_SOURCES } = require("../../services/leads/leadModelsByType");
const { sendCrossFunnelList } = require("../../services/leads/crossFunnelLeads");

// Same rule as the Interested Leads list: test-named leads live only in the Test Leads list.
const TEST_NAME_REGEX = /\btest\b/i;

// Every buyer funnel. Renovation contractor requests aren't buyers, so they stay on their own page.
const SOURCES = Object.entries(ALL_LEAD_SOURCES)
  .filter(([leadType]) => leadType !== "renovationContractor")
  .map(([leadType, { model, label }]) => ({ model, leadType, label }));

/**
 * GET /api/v1/all-leads?page=&limit=&view=&id=   (limit=all → every lead)
 *
 * Every lead from every funnel in one list, one row per signup. Rows carry
 * `leadType` / `leadTypeLabel` and `funding`, so the Leads tab can show cash vs
 * financing across funnels. Archived properties' leads stay in "Archived".
 *
 * NOTE ON SCALE: like the Interested Leads endpoint this pulls every lead and
 * filters in memory.
 */
const getAllLeads = catchAsyncError(async (req, res) => {
  const archived = await Product.distinct("slug", { archived: true });
  const archivedSlugs = new Set(archived);
  return sendCrossFunnelList(req, res, {
    sources: SOURCES,
    keep: (lead) =>
      !TEST_NAME_REGEX.test(lead.fullName || "") &&
      !lead.isTest &&
      !lead.isQaTest &&
      !(lead.leadType === "property" && archivedSlugs.has(lead.propertySlug)),
  });
});

module.exports = { getAllLeads };
