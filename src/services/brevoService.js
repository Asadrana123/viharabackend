const axios = require("axios");

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_PERSONA_LIST_ID = Number(process.env.BREVO_PERSONA_LIST_ID);
const BREVO_EARLY_ACCESS_LIST_ID = Number(process.env.BREVO_EARLY_ACCESS_LIST_ID);
const BREVO_PROPERTY_LIST_ID = Number(process.env.BREVO_PROPERTY_LIST_ID);
// Dedicated "Nurture - Northern California" list. Admin sets the id in .env.
const BREVO_NORCAL_LIST_ID = Number(process.env.BREVO_NORCAL_LIST_ID);
// "Nurture - Partners" list = 15. Digit-strip parse guards the "#15" → NaN bug.
const BREVO_PARTNER_LIST_ID = parseInt(
  String(process.env.BREVO_PARTNER_LIST_ID || "").replace(/[^0-9]/g, ""),
  10
);

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
// Contact Attributes): MARKETS, DEAL_SIZE, LEAD_SOURCE, REGISTERING_AS,
// PROPERTY_NAME. FIRSTNAME / SMS are Brevo defaults.
//
// Per the Landing Pages → Brevo handoff, every early-access contact carries
// email, FIRSTNAME, SMS, LEAD_SOURCE, REGISTERING_AS, PROPERTY_NAME. MARKETS /
// DEAL_SIZE are kept from the original sync so no existing Brevo data is lost.
// The caller sets leadSource (early-access-lp), registeringAs (exact page label),
// and propertyName ("" for early access).
const buildEarlyAccessAttributes = (lead) => {
  const attributes = {
    FIRSTNAME: lead.fullName || "",
    MARKETS: lead.markets || "",
    DEAL_SIZE: lead.dealSize || "",
    LEAD_SOURCE: lead.leadSource || "",
    REGISTERING_AS: lead.registeringAs || "",
    PROPERTY_NAME: lead.propertyName || "",
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

// Property-page auction leads (Big Bear / Ogdensburg) → "Nurture - Property Leads"
// (BREVO_PROPERTY_LIST_ID = 12). Per the Landing Pages → Brevo handoff, every
// contact carries: email, FIRSTNAME, SMS, LEAD_SOURCE, REGISTERING_AS,
// PROPERTY_NAME. LEAD_SOURCE / REGISTERING_AS / PROPERTY_NAME are text attributes
// pre-created in Brevo. The caller (each property controller) sets leadSource +
// propertyName; registeringAs is the exact buyer label the user picked.
const buildPropertyLeadAttributes = (lead) => {
  const attributes = {
    FIRSTNAME: lead.fullName || "",
    LEAD_SOURCE: lead.leadSource || "",
    REGISTERING_AS: lead.registeringAs || "",
    PROPERTY_NAME: lead.propertyName || "",
  };

  // Pass lead.phone as the canonical E.164 (phoneNormalized) from the controller
  // so this attaches; Brevo rejects the whole upsert on a non-E.164 SMS.
  const digits = String(lead.phone || "").replace(/\D/g, "");
  if (lead.phone?.startsWith("+") && digits.length >= 11) {
    attributes.SMS = lead.phone;
  }

  return attributes;
};

/**
 * Upsert a property-page auction lead into the shared Property Leads list.
 * Idempotent via updateEnabled:true. Adding to the list is what starts the
 * property email sequence. Non-throwing — safe to fire-and-forget.
 */
const syncPropertyLead = async (lead) => {
  // Per-property override: use the property's own Brevo list id when set (a
  // positive integer, assigned in Manage Listings → productModel.brevoListId and
  // passed through by the lead controller), otherwise the shared Property Leads
  // list. Empty/invalid override → shared default, so existing pages are unaffected.
  const overrideId = Number(lead.listId);
  const targetListId =
    Number.isInteger(overrideId) && overrideId > 0 ? overrideId : BREVO_PROPERTY_LIST_ID;

  if (!BREVO_API_KEY || !targetListId) {
    console.warn("⚠️  Brevo property list not configured — skipping contact sync.");
    return { success: false, skipped: true };
  }

  try {
    await axios.post(
      `${BREVO_BASE}/contacts`,
      {
        email: lead.email,
        attributes: buildPropertyLeadAttributes(lead),
        listIds: [targetListId],
        updateEnabled: true,
      },
      {
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`✅ Brevo property synced: ${lead.email} → list ${targetListId}`);
    return { success: true };
  } catch (err) {
    const reason = err.response?.data?.message || err.message;
    console.error(`❌ Brevo property sync failed: ${lead.email}:`, reason);
    return { success: false, error: String(reason) };
  }
};

// Partner Program applicants → "Nurture - Partners" (BREVO_PARTNER_LIST_ID = 15).
// Attributes (verified live against the account): FIRSTNAME, LASTNAME, SMS,
// MARKETS (text ← primaryMarket), PARTNER_TYPE (CATEGORY ← persona mapped to id).
//
// PARTNER_TYPE is a CATEGORY attribute, so it will NOT accept a raw label string —
// it must be the enumeration id. Live values:
//   1 = Realtor / Agent   2 = Flipper / Investor   3 = Wholesaler   4 = Fund / Operator
// The page sends the label ("Realtor / agent" etc.), so we normalize + map it to
// the id. An unrecognized persona is omitted (never sent as an invalid value that
// would 400 the whole upsert).
const PARTNER_TYPE_IDS = {
  "realtor / agent": 1,
  "flipper / investor": 2,
  "wholesaler": 3,
  "fund / operator": 4,
};

const normalizePartnerType = (s) =>
  String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

const buildPartnerLeadAttributes = (lead) => {
  const attributes = {
    FIRSTNAME: lead.firstName || "",
    LASTNAME: lead.lastName || "",
    MARKETS: lead.primaryMarket || "",
  };

  // PARTNER_TYPE is a category — send the id, or omit if the label is unknown.
  const partnerTypeId = PARTNER_TYPE_IDS[normalizePartnerType(lead.persona)];
  if (partnerTypeId) attributes.PARTNER_TYPE = partnerTypeId;

  // Same E.164-only SMS guard as the other builders (controller passes E.164).
  const digits = String(lead.phone || "").replace(/\D/g, "");
  if (lead.phone?.startsWith("+") && digits.length >= 11) {
    attributes.SMS = lead.phone;
  }

  return attributes;
};

/**
 * Upsert a Partner Program applicant into the "Nurture - Partners" list.
 * Idempotent via updateEnabled:true. Adding to the list is what starts the
 * partner email sequence. Non-throwing — safe to fire-and-forget.
 *
 * @param {object} lead { email, firstName, lastName, phone, primaryMarket, persona }
 */
const syncPartnerLead = async (lead) => {
  if (!BREVO_API_KEY || !BREVO_PARTNER_LIST_ID) {
    console.warn("⚠️  Brevo partner list not configured — skipping contact sync.");
    return { success: false, skipped: true };
  }
  if (!lead.email) return { success: false, skipped: true };

  try {
    await axios.post(
      `${BREVO_BASE}/contacts`,
      {
        email: lead.email,
        attributes: buildPartnerLeadAttributes(lead),
        listIds: [BREVO_PARTNER_LIST_ID],
        updateEnabled: true,
      },
      {
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`✅ Brevo partner synced: ${lead.email}`);
    return { success: true };
  } catch (err) {
    const reason = err.response?.data?.message || err.message;
    console.error(`❌ Brevo partner sync failed: ${lead.email}:`, reason);
    return { success: false, error: String(reason) };
  }
};

// Northern California early-access leads (/northern-california-early-access) →
// dedicated "Nurture - Northern California" list (BREVO_NORCAL_LIST_ID, set in
// .env). Attributes mirror the early-access shape: FIRSTNAME, MARKETS (always
// "Northern California"), LEAD_SOURCE, REGISTERING_AS (the buyer pill), SMS.
// PROPERTY_NAME is kept for list-shape parity ("" for this funnel). All are text
// attributes pre-created in Brevo except FIRSTNAME / SMS (Brevo defaults).
const buildNorCalAttributes = (lead) => {
  const attributes = {
    FIRSTNAME: lead.fullName || "",
    MARKETS: lead.market || "Northern California",
    LEAD_SOURCE: lead.leadSource || "norcal-lp",
    REGISTERING_AS: lead.registeringAs || "",
    PROPERTY_NAME: lead.propertyName || "",
  };

  // Brevo's SMS attribute must be E.164 (controller passes phoneNormalized);
  // only attach when it clearly is, or the whole upsert is rejected.
  const digits = String(lead.phone || "").replace(/\D/g, "");
  if (lead.phone?.startsWith("+") && digits.length >= 11) {
    attributes.SMS = lead.phone;
  }

  return attributes;
};

/**
 * Upsert a Northern California early-access lead into its dedicated Brevo list.
 * Idempotent via updateEnabled:true. Adding to the list triggers that list's
 * automation. Non-throwing — safe to fire-and-forget.
 *
 * @param {object} lead { email, fullName, phone, market, registeringAs, leadSource }
 */
const syncNorCalLead = async (lead) => {
  if (!BREVO_API_KEY || !BREVO_NORCAL_LIST_ID) {
    console.warn("⚠️  Brevo NorCal list not configured — skipping contact sync.");
    return { success: false, skipped: true };
  }
  if (!lead.email) return { success: false, skipped: true };

  try {
    await axios.post(
      `${BREVO_BASE}/contacts`,
      {
        email: lead.email,
        attributes: buildNorCalAttributes(lead),
        listIds: [BREVO_NORCAL_LIST_ID],
        updateEnabled: true,
      },
      {
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`✅ Brevo NorCal synced: ${lead.email}`);
    return { success: true };
  } catch (err) {
    const reason = err.response?.data?.message || err.message;
    console.error(`❌ Brevo NorCal sync failed: ${lead.email}:`, reason);
    return { success: false, error: String(reason) };
  }
};

module.exports = { syncPersonaLead, syncEarlyAccessLead, syncPropertyLead, syncPartnerLead, syncNorCalLead };
