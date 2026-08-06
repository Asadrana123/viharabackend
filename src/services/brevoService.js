const axios = require("axios");

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_PERSONA_LIST_ID = Number(process.env.BREVO_PERSONA_LIST_ID);
const BREVO_EARLY_ACCESS_LIST_ID = Number(process.env.BREVO_EARLY_ACCESS_LIST_ID);

const BREVO_BASE = "https://api.brevo.com/v3";

// Brevo requires custom attributes to be pre-created in the dashboard
// (Contacts → Settings → Contact Attributes) or the request 400s.
// FIRSTNAME / LASTNAME / SMS are Brevo defaults; the rest are custom text
// attributes you must add once: MARKET, CITY, STATE, BUYER_TYPE, DEALS_CLOSED.
const buildAttributes = (lead) => {
  const attributes = {
    FIRSTNAME: lead.fullName || "",
    MARKET: lead.market || "",
    CITY: lead.city || "",
    STATE: lead.state || "",
    BUYER_TYPE: lead.buyerType || "",
    DEALS_CLOSED: lead.dealsClosed || "",
  };

  // Brevo's SMS attribute must be E.164; only attach when it clearly is,
  // otherwise the whole contact upsert is rejected.
  const digits = String(lead.phone || "").replace(/\D/g, "");
  if (lead.phone?.startsWith("+") && digits.length >= 11) {
    attributes.SMS = lead.phone;
  }

  return attributes;
};

/**
 * Upsert a persona lead into the Brevo list. updateEnabled:true makes this
 * idempotent — re-submitting the same email updates rather than erroring.
 * Adding the contact to the list is what triggers the Brevo automation
 * (welcome + drip) configured on that list.
 *
 * Non-throwing: returns { success } so callers can fire-and-forget without
 * blocking lead creation.
 */
const syncPersonaLead = async (lead) => {
  if (!BREVO_API_KEY || !BREVO_PERSONA_LIST_ID) {
    console.warn("⚠️  Brevo not configured — skipping contact sync.");
    return { success: false, skipped: true };
  }

  try {
    await axios.post(
      `${BREVO_BASE}/contacts`,
      {
        email: lead.email,
        attributes: buildAttributes(lead),
        listIds: [BREVO_PERSONA_LIST_ID],
        updateEnabled: true,
      },
      {
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`✅ Brevo synced: ${lead.email}`);
    return { success: true };
  } catch (err) {
    const reason = err.response?.data?.message || err.message;
    console.error(`❌ Brevo sync failed: ${lead.email}:`, reason);
    return { success: false, error: String(reason) };
  }
};

// Custom attributes to pre-create once in Brevo (Contacts → Settings →
// Contact Attributes): MARKETS, DEAL_SIZE. FIRSTNAME / SMS are Brevo defaults.
const buildEarlyAccessAttributes = (lead) => {
  const attributes = {
    FIRSTNAME: lead.fullName || "",
    MARKETS: lead.markets || "",
    DEAL_SIZE: lead.dealSize || "",
  };

  const digits = String(lead.phone || "").replace(/\D/g, "");
  if (lead.phone?.startsWith("+") && digits.length >= 11) {
    attributes.SMS = lead.phone;
  }

  return attributes;
};

/**
 * Upsert an early-access lead into its Brevo list. Idempotent via
 * updateEnabled:true. Adding to the list triggers that list's automation.
 * Non-throwing — safe to fire-and-forget.
 */
const syncEarlyAccessLead = async (lead) => {
  if (!BREVO_API_KEY || !BREVO_EARLY_ACCESS_LIST_ID) {
    console.warn("⚠️  Brevo early-access not configured — skipping contact sync.");
    return { success: false, skipped: true };
  }

  try {
    await axios.post(
      `${BREVO_BASE}/contacts`,
      {
        email: lead.email,
        attributes: buildEarlyAccessAttributes(lead),
        listIds: [BREVO_EARLY_ACCESS_LIST_ID],
        updateEnabled: true,
      },
      {
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`✅ Brevo early-access synced: ${lead.email}`);
    return { success: true };
  } catch (err) {
    const reason = err.response?.data?.message || err.message;
    console.error(`❌ Brevo early-access sync failed: ${lead.email}:`, reason);
    return { success: false, error: String(reason) };
  }
};

module.exports = { syncPersonaLead, syncEarlyAccessLead };
