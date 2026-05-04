const axios = require("axios");

const FULLENRICH_API_KEY = process.env.FULLENRICH_API_KEY;
const BASE_URL = "https://app.fullenrich.com/api/v2";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Step 1 — Submit reverse email lookup
const submitEnrichment = async (email, customId) => {
  try {
    const response = await axios.post(
      `${BASE_URL}/contact/reverse/email/bulk`,
      {
        name: `Vihara Lookup ${customId}`,
        data: [{ email, custom: { user_id: customId } }],
      },
      {
        headers: {
          Authorization: `Bearer ${FULLENRICH_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data.enrichment_id;
  } catch (err) {
    console.error(`Fullenrich submit failed:`, err.message);
    return null;
  }
};

// Step 2 — Poll for enrichment result
const getEnrichmentResult = async (enrichmentId) => {
  for (let i = 0; i < 10; i++) {
    try {
      const response = await axios.get(
        `${BASE_URL}/contact/reverse/email/bulk/${enrichmentId}`,
        {
          headers: {
            Authorization: `Bearer ${FULLENRICH_API_KEY}`,
          },
        }
      );

      const status = response.data.status;
      if (status === "FINISHED") {
        const profile = response.data.data?.[0]?.profile || null;
        console.log("Enrichment result:", JSON.stringify(profile, null, 2));
        return profile;
      }
      if (status === "FAILED") return null;

      console.log(`Enrichment pending (attempt ${i + 1})... waiting 3s`);
      await delay(3000);
    } catch (err) {
      console.error(`Fullenrich poll failed:`, err.message);
      return null;
    }
  }
  return null;
};

// Main enrichment function
const enrichPerson = async (person) => {
  if (!person.email) {
    console.log(`No email for ${person.fullName} — skipping enrichment`);
    return null;
  }

  const enrichmentId = await submitEnrichment(person.email, person.fullName);
  if (!enrichmentId) return null;

  return await getEnrichmentResult(enrichmentId);
};

// Build research summary from enrichment profile
const buildResearchSummary = (person, profile) => {
  let summary = `Prospect name: ${person.fullName}. Location: ${person.city}, ${person.state}. They own property at ${person.address}.`;

  if (profile) {
    if (profile.employment?.current?.title)
      summary += ` Current job: ${profile.employment.current.title}.`;
    if (profile.employment?.current?.company?.name)
      summary += ` Company: ${profile.employment.current.company.name}.`;
    if (profile.employment?.current?.company?.industry?.main_industry)
      summary += ` Industry: ${profile.employment.current.company.industry.main_industry}.`;
    if (profile.skills?.length)
      summary += ` Skills: ${profile.skills.slice(0, 3).join(", ")}.`;
  }

  summary += ` Use this background to craft a personalized opening line that connects their profile to the Oakland investment property opportunity. Make it feel natural, not scripted.`;

  return summary;
};

module.exports = { enrichPerson, buildResearchSummary };