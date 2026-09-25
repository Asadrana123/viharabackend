// scripts/migrateAuctionRounds.js
//
// One-time migration to auction rounds. For every property that doesn't have a
// round yet, it creates round 1 from the property's current dates and prices and
// moves all of the property's existing bids and auto-bid settings into it. A
// property whose auction was already closed gets round 1 closed with its result
// (highest bid, winner) and a snapshot of today's registration list.
//
// It also replaces the old "one auto-bid setting per user per property" index
// with "one per user per auction round", which a second round needs.
//
// Safe to run more than once — properties that already have a round are skipped.
//
// Usage:
//   node src/scripts/migrateAuctionRounds.js           (dry run: reports only)
//   node src/scripts/migrateAuctionRounds.js --apply   (writes the changes)

try { require("dotenv").config(); } catch (_) { /* env already set on Render */ }

const mongoose = require("mongoose");
const Product = require("../model/property/productModel");
const AuctionRound = require("../model/bidding/auctionRoundModel");
const ManualBid = require("../model/bidding/manualBiddingModel");
const AutoBidding = require("../model/bidding/autoBiddingModel");
const { ensureCurrentRound } = require("../services/bidding/auctionRoundService");

const APPLY = process.argv.includes("--apply");
const OLD_AUTOBID_INDEX = "userId_1_auctionId_1";

async function main() {
  const DB_URI = process.env.DB_URI;
  if (!DB_URI) throw new Error("DB_URI is not set");
  await mongoose.connect(DB_URI);

  console.log(APPLY ? "Applying auction-rounds migration…" : "Dry run — nothing will be written. Pass --apply to migrate.");

  const autoBidIndexes = await AutoBidding.collection.indexes();
  const hasOldIndex = autoBidIndexes.some((i) => i.name === OLD_AUTOBID_INDEX);

  const products = await Product.find({ currentRoundId: null });
  const bidsWithoutRound = await ManualBid.countDocuments({ roundId: null });
  const autoBidsWithoutRound = await AutoBidding.countDocuments({ roundId: null });

  console.log(`Properties without an auction round: ${products.length}`);
  console.log(`Bids without a round:                ${bidsWithoutRound}`);
  console.log(`Auto-bid settings without a round:   ${autoBidsWithoutRound}`);
  console.log(`Old auto-bid index present:          ${hasOldIndex ? "yes" : "no"}`);

  if (!APPLY) {
    await mongoose.disconnect();
    return;
  }

  // Indexes first, so round 1 is created under the unique round index.
  await AuctionRound.createIndexes();
  if (hasOldIndex) {
    await AutoBidding.collection.dropIndex(OLD_AUTOBID_INDEX);
    console.log(`Dropped index ${OLD_AUTOBID_INDEX}`);
  }
  await AutoBidding.createIndexes();
  await ManualBid.createIndexes();

  let created = 0;
  let closed = 0;
  for (const product of products) {
    const round = await ensureCurrentRound(product);
    created += 1;
    if (round.closedAt) closed += 1;
  }

  console.log(`Created round 1 for ${created} properties (${closed} already closed).`);
  console.log(`Bids still without a round:          ${await ManualBid.countDocuments({ roundId: null })}`);
  console.log(`Auto-bid settings still without one: ${await AutoBidding.countDocuments({ roundId: null })}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Auction-rounds migration failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
