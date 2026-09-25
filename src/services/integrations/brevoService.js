const axios = require("axios");
const { toUsSmsNumber } = require("../../utils/usPhone");

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

// ============================================================================
// SMS ATTRIBUTES + CONTACT UPSERT  (shared by property / NorCal / partner syncs)
// ----------------------------------------------------------------------------
// Brevo sends every SMS from its automation. The backend only saves what the
// automation needs on the contact:
//   SMS             — always sent when the phone is valid (ticked or not).
//                     US numbers are formatted as +1 followed by 10 digits.
//   SMS_OPT_IN      — true, ONLY when the SMS box was ticked. Never sent as
//   SMS_OPT_IN_AT     false, so an earlier true is never overwritten.
//   SMS_OPT_IN_URL
// SMS_OPT_IN (Boolean), SMS_OPT_IN_AT (Date) and SMS_OPT_IN_URL (Text) must be
// pre-created in Brevo (Contacts → Settings → Contact Attributes).

// Canonical SMS number: strict US "+1XXXXXXXXXX" when possible, otherwise any
// clear E.164 (the previous behaviour), otherwise null. Brevo rejects the whole
// upsert on a non-E.164 SMS value.
const smsNumberOf = (phone) => {
  const us = toUsSmsNumber(phone);
  if (us) return us;
  const raw = String(phone || "");
  const digits = raw.replace(/\D/g, "");
  return raw.startsWith("+") && digits.length >= 11 ? raw : null;
};

const buildSmsAttributes = (lead) => {
  const attributes = {};
  const sms = smsNumberOf(lead.phone);
  if (sms) attributes.SMS = sms;

  if (lead.smsOptIn === true) {
    if (!sms) console.warn(`⚠️  Brevo: ${lead.email} ticked SMS but phone "${lead.phone}" is invalid.`);
    attributes.SMS_OPT_IN = true;
    attributes.SMS_OPT_IN_AT = new Date(lead.smsOptInAt || Date.now()).toISOString();
    attributes.SMS_OPT_IN_URL = lead.smsOptInUrl || "";
  }
  return attributes;
};

// Brevo answers 400 (code "duplicate_parameter") when the SMS number already
// belongs to a different contact.
const isSmsTakenError = (err) => {
  if (err.response?.status !== 400) return false;
  const { code = "", message = "" } = err.response?.data || {};
  return /sms/i.test(message) && (code === "duplicate_parameter" || /already|another contact/i.test(message));
};

/**
 * POST /contacts (upsert). If Brevo says the SMS number is already on another
 * contact, the contact is saved again WITHOUT the SMS number and the conflict
 * is logged. Throws on any other error (callers already catch + log).
 * @returns {Promise<{ smsConflict: boolean }>}
 */
const upsertContact = async ({ email, attributes, listIds }, label) => {
  const post = (attrs) =>
    axios.post(
      `${BREVO_BASE}/contacts`,
      { email, attributes: attrs, listIds, updateEnabled: true },
      {
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

  try {
    await post(attributes);
    return { smsConflict: false };
  } catch (err) {
    if (!attributes.SMS || !isSmsTakenError(err)) throw err;
  }

  const { SMS, ...withoutSms } = attributes;
  console.warn(`⚠️  Brevo ${label}: SMS ${SMS} is already on another contact — saving ${email} without SMS.`);
  await post(withoutSms);
  return { smsConflict: true };
};

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
// LISTING_URL (text, pre-created in Brevo) is the property's /listing/:slug page,
// used by the Brevo SMS automation. SMS fields come from buildSmsAttributes.
const buildPropertyLeadAttributes = (lead) => ({
  FIRSTNAME: lead.fullName || "",
  LEAD_SOURCE: lead.leadSource || "",
  REGISTERING_AS: lead.registeringAs || "",
  PROPERTY_NAME: lead.propertyName || "",
  LISTING_URL: lead.listingUrl || "",
  ...buildSmsAttributes(lead),
});

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
    const { smsConflict } = await upsertContact(
      {
        email: lead.email,
        attributes: buildPropertyLeadAttributes(lead),
        listIds: [targetListId],
      },
      "property"
    );

    console.log(`✅ Brevo property synced: ${lead.email} → list ${targetListId}`);
    return { success: true, smsConflict };
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

  return { ...attributes, ...buildSmsAttributes(lead) };
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
    const { smsConflict } = await upsertContact(
      {
        email: lead.email,
        attributes: buildPartnerLeadAttributes(lead),
        listIds: [BREVO_PARTNER_LIST_ID],
      },
      "partner"
    );

    console.log(`✅ Brevo partner synced: ${lead.email}`);
    return { success: true, smsConflict };
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

  return { ...attributes, ...buildSmsAttributes(lead) };
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
    const { smsConflict } = await upsertContact(
      {
        email: lead.email,
        attributes: buildNorCalAttributes(lead),
        listIds: [BREVO_NORCAL_LIST_ID],
      },
      "NorCal"
    );

    console.log(`✅ Brevo NorCal synced: ${lead.email}`);
    return { success: true, smsConflict };
  } catch (err) {
    const reason = err.response?.data?.message || err.message;
    console.error(`❌ Brevo NorCal sync failed: ${lead.email}:`, reason);
    return { success: false, error: String(reason) };
  }
};

// ============================================================================
// OUTBOUND SMS  (admin-triggered — see outboundplan.md §4/§5.2)
// ----------------------------------------------------------------------------
// Unlike the sync* functions above (which react to a public lead-form
// submission), this is called from an admin-launched campaign
// (outboundSmsService.js). Every property that needs outbound SMS has its
// OWN dedicated Brevo list (productModel.brevoOutboundSmsListId) with its
// own automation — there is no shared list and no env-var fallback. A
// contact with no resolved list id should never reach this function; callers
// are expected to check `resolveOutboundSmsListId(property)` first and skip
// the whole campaign launch when it's null.
//
// Removes the contact from the target list before upserting it back in, so
// every send looks like a fresh "contact added to list" to Brevo's
// automation — Brevo may not re-fire that trigger for a contact who's
// already a member (outboundplan.md §4, "re-sends"). The remove call is
// best-effort: a failure there (e.g. the contact wasn't on the list yet)
// never blocks the upsert that follows.

/**
 * @param {object} contact { email, phone, name, listId, smsOptIn, property: { name, slug, listingUrl } }
 * @returns {Promise<{ success: boolean, smsConflict?: boolean, error?: string, skipped?: boolean }>}
 */
const syncOutboundSmsContact = async (contact) => {
  const listId = Number(contact.listId);
  if (!Number.isInteger(listId) || listId <= 0) {
    return { success: false, error: "no outbound SMS list" };
  }
  if (!BREVO_API_KEY) {
    console.warn("⚠️  Brevo not configured — skipping outbound SMS sync.");
    return { success: false, skipped: true };
  }

  try {
    await axios.post(
      `${BREVO_BASE}/contacts/lists/${listId}/contacts/remove`,
      { emails: [contact.email] },
      { headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" } }
    );
  } catch (err) {
    // Expected/harmless when the contact wasn't already on this list —
    // never let a remove failure block the upsert below.
  }

  try {
    const { smsConflict } = await upsertContact(
      {
        email: contact.email,
        attributes: {
          FIRSTNAME: contact.name || "",
          OUTBOUND_PROPERTY_NAME: contact.property?.name || "",
          OUTBOUND_LISTING_URL: contact.property?.listingUrl || "",
          OUTBOUND_PROPERTY_SLUG: contact.property?.slug || "",
          OUTBOUND_SENT_AT: new Date().toISOString(),
          ...buildSmsAttributes({
            phone: contact.phone,
            smsOptIn: contact.smsOptIn === true,
            smsOptInAt: new Date(),
            smsOptInUrl: contact.property?.listingUrl || "",
          }),
        },
        listIds: [listId],
      },
      "outbound-sms"
    );

    console.log(`✅ Brevo outbound SMS synced: ${contact.email} → list ${listId}`);
    return { success: true, smsConflict };
  } catch (err) {
    const reason = err.response?.data?.message || err.message;
    console.error(`❌ Brevo outbound SMS sync failed: ${contact.email}:`, reason);
    return { success: false, error: String(reason) };
  }
};

// ============================================================================
// BEHAVIORAL EVENTS  (Realtor Referral Events handoff)
// Brevo's Events API (POST /v3/events, 204 on success) — distinct from the
// /contacts upsert above. Used to trigger automations off in-app actions
// (property_shared, buyer_registered) rather than list-signup forms.
// event_name must pre-exist as an event in Brevo (or Brevo auto-creates it on
// first fire — either way this call is non-throwing / fire-and-forget).
// contact_properties written here must be pre-created as contact attributes
// in Brevo (Contacts → Settings → Contact Attributes) — e.g.
// FIRST_PROPERTY_SHARED_AT — or Brevo may silently drop the unknown field.
const trackEvent = async ({ eventName, email, eventProperties = {}, contactProperties }) => {
  if (!BREVO_API_KEY) {
    console.warn(`⚠️  Brevo not configured — skipping event: ${eventName}`);
    return { success: false, skipped: true };
  }
  if (!email) return { success: false, skipped: true };

  const body = {
    event_name: eventName,
    identifiers: { email_id: email },
    event_properties: eventProperties,
  };
  if (contactProperties && Object.keys(contactProperties).length) {
    body.contact_properties = contactProperties;
  }

  try {
    await axios.post(`${BREVO_BASE}/events`, body, {
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
      },
    });

    console.log(`✅ Brevo event tracked: ${eventName} (${email})`);
    return { success: true };
  } catch (err) {
    const reason = err.response?.data?.message || err.message;
    console.error(`❌ Brevo event failed: ${eventName} (${email}):`, reason);
    return { success: false, error: String(reason) };
  }
};

module.exports = {
  syncPersonaLead,
  syncEarlyAccessLead,
  syncPropertyLead,
  syncPartnerLead,
  syncNorCalLead,
  syncOutboundSmsContact,
  trackEvent,
};
