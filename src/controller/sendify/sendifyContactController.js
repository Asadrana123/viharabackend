// controller/sendify/sendifyContactController.js
const catchAsyncError = require("../../middleware/catchAsyncError");
const SendifyContact = require("../../model/sendify/sendifyContactModel");
const SendifyMessage = require("../../model/sendify/sendifyMessageModel");

/** GET /api/v1/sendify/contacts/:id — contact plus its merged (all-lines) message timeline. */
const getContact = catchAsyncError(async (req, res) => {
  const contact = await SendifyContact.findById(req.params.id);
  if (!contact) return res.status(404).json({ success: false, message: "Contact not found" });

  const messages = await SendifyMessage.find({ contactId: contact._id }).sort({ createdAt: 1 }).limit(500);

  return res.status(200).json({ success: true, contact, messages });
});

/** PATCH /api/v1/sendify/contacts/:id/consent — admin-set opt-out/opt-in, audited (sendify-infra.md §8.1). */
const updateContactConsent = catchAsyncError(async (req, res) => {
  const { optedOut } = req.body;
  if (typeof optedOut !== "boolean") {
    return res.status(400).json({ success: false, message: "optedOut (boolean) is required" });
  }

  const contact = await SendifyContact.findById(req.params.id);
  if (!contact) return res.status(404).json({ success: false, message: "Contact not found" });

  contact.optOut = optedOut
    ? { isOptedOut: true, at: new Date(), method: "admin" }
    : { isOptedOut: false };
  contact.consent.status = optedOut ? "opted-out" : "opted-in";
  contact.consent.source = "admin";
  contact.consent.capturedAt = new Date();
  contact.consentEvents.push({
    type: optedOut ? "opt-out" : "opt-in",
    at: new Date(),
    method: "admin",
    adminId: req.user?._id,
    adminName: req.user?.name,
  });
  await contact.save();

  return res.status(200).json({ success: true, contact });
});

module.exports = { getContact, updateContactConsent };
