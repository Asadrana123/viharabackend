const axios = require("axios");
const FbProcessedLead = require("../model/fbProcessedLeadModel");
const { mapLeadToContact, resolveFbPitch } = require("./facebookLeadService");
const { runSingleCall } = require("./vapiCampaignService");

const GRAPH_API_VERSION = process.env.FB_GRAPH_API_VERSION || "v21.0";
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

// How often to check for new leads. Default: every 2 minutes.
const FB_POLL_INTERVAL_MS = Number(process.env.FB_POLL_INTERVAL_MS) || 120000;

// Lead form(s) to poll. Comma-separated. Defaults to the current investor form.
const FB_LEAD_FORM_IDS = (process.env.FB_LEAD_FORM_IDS || "2245024179596337")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Marks that first-run seeding has completed.
const SEED_SENTINEL = "__SEEDED__";

// ─── Graph API ──────────────────────────────────────────────────────────────

// Fetch recent leads for one form. This is the same call proven to work with
// the system-user token — no App Review required for your own page's leads.
const fetchFormLeads = async (formId) => {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${formId}/leads`;
  const { data } = await axios.get(url, {
    params: {
      access_token: FB_PAGE_ACCESS_TOKEN,
      fields: "id,created_time,field_data",
      limit: 50,
    },
  });
  return Array.isArray(data?.data) ? data.data : [];
};

const collectLeads = async () => {
  const all = [];
  for (const formId of FB_LEAD_FORM_IDS) {
    try {
      const leads = await fetchFormLeads(formId);
      all.push(...leads);
    } catch (err) {
      console.error(
        `❌ FB poll: failed fetching leads for form ${formId}:`,
        err.response?.data?.error?.message || err.message
      );
    }
  }
  return all;
};

// ─── Seeding ────────────────────────────────────────────────────────────────

// One-time on first ever run: mark every existing lead as processed WITHOUT
// calling, so old leads already in the system are never auto-dialled. Only
// leads that arrive after this runs will be called.
const seedIfNeeded = async () => {
  const seeded = await FbProcessedLead.findOne({ leadgenId: SEED_SENTINEL }).lean();
  if (seeded) return;

  const leads = await collectLeads();
  const docs = leads.map((l) => ({ leadgenId: String(l.id) }));
  docs.push({ leadgenId: SEED_SENTINEL });

  // ordered:false + catch so duplicate keys never throw.
  await FbProcessedLead.insertMany(docs, { ordered: false }).catch(() => {});
  console.log(
    `✅ FB poll: seeded ${leads.length} existing lead(s) as handled — they will not be called.`
  );
};

// ─── Poll cycle ─────────────────────────────────────────────────────────────

const pollOnce = async () => {
  if (!FB_PAGE_ACCESS_TOKEN) return;

  const leads = await collectLeads();
  if (!leads.length) return;

  let pitch = null; // resolved once per cycle, only if there's a new lead

  for (const lead of leads) {
    const leadgenId = String(lead.id);

    // Atomic claim: creating the processed record first means two overlapping
    // polls can never both call the same lead. Duplicate key => already done.
    try {
      await FbProcessedLead.create({ leadgenId });
    } catch (e) {
      continue;
    }

    const contact = mapLeadToContact(lead);
    if (!contact.fullName || !contact.phones) {
      console.warn(`⚠️  FB poll: lead ${leadgenId} missing name/phone — skipped.`);
      continue;
    }

    try {
      if (!pitch) pitch = await resolveFbPitch();
      const result = await runSingleCall(contact, {
        enrich: false,
        property: pitch.property,
        promptConfig: pitch.promptConfig,
      });
      const ok = result.calls.some((c) => c.success);
      console.log(
        `${ok ? "✅" : "❌"} FB poll: lead ${leadgenId} (${contact.fullName}) → call ${
          ok ? "dispatched" : "failed"
        }`
      );
    } catch (err) {
      console.error(`❌ FB poll: call failed for ${leadgenId}:`, err.message);
    }
  }
};

// ─── Start ──────────────────────────────────────────────────────────────────

const startPolling = async () => {
  if (!FB_PAGE_ACCESS_TOKEN) {
    console.log("ℹ️  FB poll: FB_PAGE_ACCESS_TOKEN not set — polling disabled.");
    return;
  }

  try {
    await seedIfNeeded();
  } catch (err) {
    console.error("❌ FB poll: seeding error:", err.message);
  }

  setInterval(() => {
    pollOnce().catch((err) => console.error("❌ FB poll cycle error:", err.message));
  }, FB_POLL_INTERVAL_MS);

  console.log(
    `✅ FB poll: started — every ${Math.round(
      FB_POLL_INTERVAL_MS / 1000
    )}s, forms: ${FB_LEAD_FORM_IDS.join(", ")}`
  );
};

module.exports = { startPolling, pollOnce };
