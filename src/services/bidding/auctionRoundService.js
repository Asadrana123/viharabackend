// services/bidding/auctionRoundService.js
//
// Auction rounds: a property can be auctioned many times, and each time is a
// round (auctionRoundModel). The property keeps the live values of its current
// round, so the bidding flow reads the property as before; bids and auto-bid
// settings carry a roundId so each round keeps its own bid list.
//
// Registrations stay per property: one approval covers every round.

const Product = require("../../model/property/productModel");
const AuctionRound = require("../../model/bidding/auctionRoundModel");
const ManualBid = require("../../model/bidding/manualBiddingModel");
const AutoBidding = require("../../model/bidding/autoBiddingModel");
const AuctionRegistration = require("../../model/bidding/auctionRegistration");

// Query filter for the bids / auto-bids of a property's current round. A
// property that has never been migrated has no round yet — its bids are then
// matched by property alone, exactly as before rounds existed.
function roundFilter(product) {
  return product.currentRoundId
    ? { auctionId: product._id, roundId: product.currentRoundId }
    : { auctionId: product._id };
}

// Same as roundFilter, looked up from just the property id.
async function currentRoundFilter(auctionId, session = null) {
  const product = await Product.findById(auctionId, "currentRoundId", { session }).lean();
  return product ? roundFilter(product) : { auctionId };
}

// "upcoming" | "live" | "ended". An open round reads its dates from the
// property (they can change while it runs, e.g. bid-time extensions).
function roundStatus(round, product) {
  if (round.closedAt) return "ended";
  const isCurrent = product && String(product.currentRoundId) === String(round._id);
  const start = isCurrent ? product.auctionStartDate : round.auctionStartDate;
  const end = isCurrent ? product.auctionEndDate : round.auctionEndDate;
  const now = Date.now();
  if (end && now > new Date(end).getTime()) return "ended";
  if (start && now < new Date(start).getTime()) return "upcoming";
  return "live";
}

// The property's registration list right now (rejected excluded), in the shape
// stored on a closed round.
async function snapshotRegistrations(productId) {
  const regs = await AuctionRegistration.find({ auctionId: productId, status: { $ne: "rejected" } })
    .select("userId firstName lastName buyerType status submittedAt")
    .sort({ submittedAt: -1 })
    .lean();
  return regs.map((r) => ({
    registrationId: r._id,
    userId: r.userId,
    name: `${r.firstName || ""} ${r.lastName || ""}`.trim() || "Unknown",
    buyerType: r.buyerType || "",
    status: r.status || "pending",
    submittedAt: r.submittedAt || null
  }));
}

function termsFromProduct(product) {
  return {
    auctionStartDate: product.auctionStartDate || null,
    auctionEndDate: product.auctionEndDate || null,
    startBid: product.startBid ?? null,
    reservePrice: product.reservePrice ?? null,
    minIncrement: product.minIncrement ?? null
  };
}

// Return the property's current round, creating round 1 for a property that
// predates rounds. Round 1 takes the property's current terms and every
// existing bid and auto-bid setting. If the property's auction was already
// closed under the old system, round 1 is created closed with its result.
// Safe to call concurrently and more than once.
async function ensureCurrentRound(product) {
  if (product.currentRoundId) {
    const existing = await AuctionRound.findById(product.currentRoundId);
    if (existing) return existing;
  }

  // The old per-property close marker is no longer on the schema; read it raw.
  const raw = await Product.collection.findOne(
    { _id: product._id },
    { projection: { auctionClosedForEndDate: 1 } }
  );
  const closedMarker = raw && raw.auctionClosedForEndDate;
  const alreadyClosed =
    product.status === "sold" ||
    (closedMarker && product.auctionEndDate &&
      new Date(closedMarker).getTime() === new Date(product.auctionEndDate).getTime());

  let round;
  try {
    round = await AuctionRound.create({
      productId: product._id,
      roundNumber: 1,
      ...termsFromProduct(product)
    });
  } catch (err) {
    if (err.code !== 11000) throw err;
    round = await AuctionRound.findOne({ productId: product._id, roundNumber: 1 });
  }

  // Claim the property for this round; if another caller got there first, use theirs.
  const claim = await Product.updateOne(
    { _id: product._id, currentRoundId: null },
    { $set: { currentRoundId: round._id } }
  );
  if (!claim.modifiedCount) {
    const fresh = await Product.findById(product._id).select("currentRoundId").lean();
    if (fresh && fresh.currentRoundId && String(fresh.currentRoundId) !== String(round._id)) {
      product.currentRoundId = fresh.currentRoundId;
      return AuctionRound.findById(fresh.currentRoundId);
    }
  }
  product.currentRoundId = round._id;

  // Move every pre-round bid and auto-bid setting into round 1.
  await ManualBid.updateMany({ auctionId: product._id, roundId: null }, { $set: { roundId: round._id } });
  await AutoBidding.updateMany({ auctionId: product._id, roundId: null }, { $set: { roundId: round._id } });

  if (alreadyClosed && !round.closedAt) {
    round.closedAt = product.auctionEndDate || new Date();
    await fillRoundResult(round, product, {
      highestBid: product.currentBidder ? product.currentBid : null,
      winnerId: product.currentBidder || null
    });
  }

  return round;
}

// Atomically mark a round closed. Returns the round, or null if it was
// already closed by someone else.
function claimRoundClose(roundId) {
  return AuctionRound.findOneAndUpdate(
    { _id: roundId, closedAt: null },
    { $set: { closedAt: new Date() } },
    { new: true }
  );
}

function releaseRoundClose(roundId) {
  return AuctionRound.updateOne({ _id: roundId }, { $set: { closedAt: null } });
}

// Copy the final terms, result and registration snapshot onto a closed round.
async function fillRoundResult(round, product, { highestBid = null, winnerId = null, winnerName = null } = {}) {
  if (winnerId && !winnerName) {
    const User = require("../../model/users/userModel");
    const winner = await User.findById(winnerId).select("name").lean();
    winnerName = winner ? winner.name || "Unknown" : "Unknown";
  }

  Object.assign(round, termsFromProduct(product), {
    highestBid,
    winnerId,
    winnerName: winnerId ? winnerName : null,
    totalBids: await ManualBid.countDocuments({ auctionId: product._id, roundId: round._id }),
    registrations: await snapshotRegistrations(product._id)
  });
  await round.save();
  return round;
}

// Close a round that ended without being finalized (no seller email), so a new
// round can start after it.
async function closeRoundQuietly(round, product) {
  const claimed = await claimRoundClose(round._id);
  if (!claimed) return AuctionRound.findById(round._id);
  return fillRoundResult(claimed, product, {
    highestBid: product.currentBidder ? product.currentBid : null,
    winnerId: product.currentBidder || null
  });
}

// Reset the property's live auction fields and point it at `round`.
function openRoundOnProduct(productId, round) {
  return Product.findByIdAndUpdate(
    productId,
    {
      $set: {
        ...termsFromProduct(round),
        currentBid: round.startBid ?? 0,
        currentBidder: null,
        lastBidId: null,
        auctionExtensionCount: 0,
        status: "active",
        currentRoundId: round._id
      }
    },
    { new: true }
  );
}

// Start a new auction round for a property. The current round must have ended;
// if it ended without being finalized it is closed now (no seller email).
// `terms` = { auctionStartDate, auctionEndDate, startBid, reservePrice, minIncrement }.
async function startNewRound(productId, terms, createdBy = null) {
  const product = await Product.findById(productId);
  if (!product) {
    const err = new Error("Auction not found");
    err.statusCode = 404;
    throw err;
  }

  let current = await ensureCurrentRound(product);
  if (!current.closedAt) {
    const end = product.auctionEndDate ? new Date(product.auctionEndDate).getTime() : null;
    if (end && end > Date.now()) {
      const err = new Error("The current auction hasn't ended yet. Wait for it to end before starting a new one.");
      err.statusCode = 409;
      throw err;
    }
    current = await closeRoundQuietly(current, product);
  }

  const round = await AuctionRound.create({
    productId: product._id,
    roundNumber: current.roundNumber + 1,
    ...terms,
    createdBy
  });

  const updatedProduct = await openRoundOnProduct(product._id, round);
  return { product: updatedProduct, round, previousRound: current };
}

// A property being published again (re-approved submission) reuses its product.
// Call before overwriting the product: if its current round is over, that round
// is closed and a new round must be opened after the save (returns true).
async function prepareRelist(product) {
  const current = await ensureCurrentRound(product);
  if (current.closedAt) return true;
  const end = product.auctionEndDate ? new Date(product.auctionEndDate).getTime() : null;
  if (end && end <= Date.now()) {
    await closeRoundQuietly(current, product);
    return true;
  }
  return false;
}

// After prepareRelist returned true and the product was saved with its new terms.
async function openRelistRound(product) {
  const last = await AuctionRound.findOne({ productId: product._id }).sort({ roundNumber: -1 });
  const round = await AuctionRound.create({
    productId: product._id,
    roundNumber: (last ? last.roundNumber : 0) + 1,
    ...termsFromProduct(product)
  });
  return openRoundOnProduct(product._id, round);
}

module.exports = {
  roundFilter,
  currentRoundFilter,
  roundStatus,
  snapshotRegistrations,
  ensureCurrentRound,
  claimRoundClose,
  releaseRoundClose,
  fillRoundResult,
  startNewRound,
  prepareRelist,
  openRelistRound
};
