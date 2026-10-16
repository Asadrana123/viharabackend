// controller/property/productDeleteController.js
//
// Admin hard-delete for one listing (Manage Listings).
//
// Deletes the property and its auction data — registrations, bids, auto-bid
// settings, auction rounds — plus its voice prompt and email-sequence records.
// Anything still running about the property is stopped first: buyer-match call
// schedules, Vtext follow-up texts, and the daily calls to its landing-page
// leads. The leads themselves, call logs and email/marketing history are kept
// (they're about people, not the listing).

const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");
const Product = require("../../model/property/productModel");
const AuctionRegistration = require("../../model/bidding/auctionRegistration");
const ManualBid = require("../../model/bidding/manualBiddingModel");
const AutoBidding = require("../../model/bidding/autoBiddingModel");
const AuctionRound = require("../../model/bidding/auctionRoundModel");
const VoicePrompt = require("../../model/calling/voicePromptModel");
const PropertyEmailLead = require("../../model/email/propertyEmailLeadModel");
const MatchCallCampaign = require("../../model/calling/matchCallCampaignModel");
const PropertyLead = require("../../model/leads/propertyLeadModel");
const VtextContact = require("../../model/vtext/vtextContactModel");
const { endCampaign } = require("../../services/buyerMatch/matchCallService");
const { endFollowUp } = require("../../services/vtext/vtextFollowUpEnd");

/** DELETE /api/v1/product/admin/:id */
exports.deleteProduct = catchAsyncError(async (req, res, next) => {
  const product = await Product.findById(req.params.id).select("_id slug productName").lean();
  if (!product) return next(new ErrorHandler("Property not found", 404));
  const id = product._id;

  // Stop what's running about this property before its data goes.
  const [campaigns, followUps] = await Promise.all([
    MatchCallCampaign.find({ propertyId: id, status: "active" }).lean(),
    VtextContact.find({ "followUp.status": "active", "followUp.propertyId": id }).select("_id").lean(),
  ]);
  await Promise.all([
    ...campaigns.map((c) => endCampaign(c, "property-closed")),
    ...followUps.map((c) => endFollowUp(c._id, "cancelled", "property-deleted")),
    product.slug
      ? PropertyLead.updateMany({ propertySlug: product.slug }, { $set: { callingStopped: true } })
      : null,
  ]);

  const [registrations, bids] = await Promise.all([
    AuctionRegistration.deleteMany({ auctionId: id }),
    ManualBid.deleteMany({ auctionId: id }),
    AutoBidding.deleteMany({ auctionId: id }),
    AuctionRound.deleteMany({ productId: id }),
    VoicePrompt.deleteMany({ propertyId: id }),
    PropertyEmailLead.deleteMany({ propertyId: id }),
  ]);
  await Product.deleteOne({ _id: id });

  console.log(
    `[admin] deleted property ${product.productName || id} — ${registrations.deletedCount} registrations, ${bids.deletedCount} bids`
  );
  res.status(200).json({
    success: true,
    id: String(id),
    deletedRegistrations: registrations.deletedCount,
    deletedBids: bids.deletedCount,
  });
});
