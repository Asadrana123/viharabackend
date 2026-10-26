// controller/vtext/vtextLeadController.js
//
// The Leads tab's "Text this lead" panel: given a lead, find its Vtext contact, its conversation(s) and the
// text history, plus what the panel needs to decide whether to offer the composer (valid number, opted out,
// consent, Facebook texting hours). The send itself is POST /vtext/messages with { leadType, leadId }.
const catchAsyncError = require("../../middleware/catchAsyncError");
const VtextContact = require("../../model/vtext/vtextContactModel");
const VtextConversation = require("../../model/vtext/vtextConversationModel");
const Product = require("../../model/property/productModel");
const { resolveLead } = require("../../services/vtext/vtextLeadLookupService");
const { getVtextMessagesForPhones } = require("../../services/vtext/vtextLeadMessagesService");
const { getSettings, isConsentRequired } = require("../../services/vtext/vtextSettingsService");
const { leadTextingHours } = require("../../utils/textingWindow");

/** GET /api/v1/vtext/lead-thread?leadType=&leadId= */
const getLeadThread = catchAsyncError(async (req, res) => {
  const { leadType, leadId } = req.query;
  const lead = await resolveLead(leadType, leadId);
  if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

  // Not every lead has a number we can text; say so rather than erroring, so the panel can explain.
  if (!lead.phone) {
    return res.status(200).json({
      success: true,
      canText: false,
      cantTextReason: "This lead has no valid US phone number.",
      lead: { leadType, leadId: lead.leadId, name: lead.name },
      contact: null,
      conversations: [],
      messages: [],
    });
  }

  const contact = await VtextContact.findOne({ phoneE164: lead.phone })
    .select("name optOut.isOptedOut consent.status lastInboundAt phoneStatus")
    .lean();
  const [conversations, messagesByPhone, settings, product] = await Promise.all([
    contact
      ? VtextConversation.find({ contactId: contact._id }).sort({ lastMessageAt: -1 }).select("status unreadCount lastMessageAt").lean()
      : [],
    getVtextMessagesForPhones([lead.phone]),
    getSettings(),
    leadType === "property" && lead.lead.propertySlug
      ? Product.findOne({ slug: lead.lead.propertySlug }).select("_id").lean()
      : null,
  ]);

  const optedOut = !!contact?.optOut?.isOptedOut;
  const badNumber = contact?.phoneStatus === "invalid" || contact?.phoneStatus === "landline";
  // The contact's own status wins; a contact that does not exist yet (or is still "unknown") gets consent from its lead on the first send.
  const consentStatus = optedOut || contact?.consent?.status === "opted-out"
    ? "opted-out"
    : contact?.consent?.status === "opted-in" || lead.consent.consented ? "opted-in" : "unknown";

  let cantTextReason = "";
  if (optedOut) cantTextReason = "This person has opted out of texts.";
  else if (badNumber) cantTextReason = `This number can't be texted (${contact.phoneStatus}).`;

  return res.status(200).json({
    success: true,
    canText: !cantTextReason,
    cantTextReason,
    lead: { leadType, leadId: lead.leadId, name: lead.name, phone: lead.phone },
    contact: contact ? { _id: contact._id, name: contact.name, lastInboundAt: contact.lastInboundAt || null } : null,
    consent: { status: consentStatus, required: isConsentRequired(settings) },
    conversations,
    conversationId: conversations[0]?._id || null,
    messages: messagesByPhone[lead.phone] || [],
    suggestedPropertyId: product?._id || null,
    // Warning only: is it 8 AM-9 PM for this lead? The admin can send either way.
    textingHours: leadTextingHours(lead.phone, new Date()),
  });
});

module.exports = { getLeadThread };
