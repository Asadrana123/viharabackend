const Papa = require("papaparse");
const { enrichPerson, buildResearchSummary } = require("../services/fullenrichService");
const { parsePhones, dispatchCall } = require("../services/vapiService");
const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");

// Delay helper
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POST /api/vapi/launch-campaign
 * Body: { csvData: "raw csv string" }
 * Enriches each contact and dispatches VAPI calls
 */
const launchCampaign = catchAsyncError(async (req, res, next) => {
  const { csvData } = req.body;

  if (!csvData) {
    return next(new ErrorHandler("csvData is required", 400));
  }

  // Parse CSV
  const parsed = Papa.parse(csvData, {
    header: true,
    skipEmptyLines: true,
  });

  if (!parsed.data || parsed.data.length === 0) {
    return next(new ErrorHandler("No contacts found in CSV", 400));
  }

  const contacts = parsed.data.map((row) => ({
    fullName: row["Full Name"] || "",
    address: row["Address"] || "",
    city: row["City"] || "",
    state: row["State"] || "",
    zip: row["Zip Code"] || "",
    phones: parsePhones(row["Phones"]),
    email: row["Emails"] ? row["Emails"].split("|")[0].trim() : null,
  }));

  console.log(`📋 Campaign started — ${contacts.length} contacts loaded`);

  const results = [];

  for (const person of contacts) {
    if (!person.fullName) continue;

    if (!person.phones.length) {
      console.log(`⚠️ No valid phones for ${person.fullName} — skipping`);
      results.push({ name: person.fullName, status: "skipped", reason: "no valid phones" });
      continue;
    }

    // Enrich person
    console.log(`🔍 Enriching ${person.fullName}...`);
    const enrichment = await enrichPerson(person);
    const researchSummary = buildResearchSummary(person, enrichment);
    console.log("Research summary:", researchSummary);
    // Dispatch call to each phone number
    const callResults = [];
    for (const phone of person.phones) {
      const result = await dispatchCall(phone, person, researchSummary);
      callResults.push(result);
      await delay(2000); // 2 sec between calls
    }

    results.push({
      name: person.fullName,
      status: "dispatched",
      calls: callResults,
    });

    await delay(3000); // 3 sec between contacts
  }

  res.status(200).json({
    success: true,
    message: `Campaign complete — ${contacts.length} contacts processed`,
    results,
  });
});

module.exports = { launchCampaign };
