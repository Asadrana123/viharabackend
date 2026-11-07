// scripts/skipSellerEmailForDay.js
//
// Stops the "auction closed" seller email for every still-open auction round
// that ends on the given day (default 2026-11-07, UTC day window widened to
// cover US timezones).
//
//   node src/scripts/skipSellerEmailForDay.js            (preview only)
//   node src/scripts/skipSellerEmailForDay.js --apply    (set skipSellerEmail)
//   node src/scripts/skipSellerEmailForDay.js --undo     (clear it again)

require("dotenv").config();
const mongoose = require("mongoose");
const productModel = require("../model/property/productModel");
const AuctionRound = require("../model/bidding/auctionRoundModel");

const APPLY = process.argv.includes("--apply");
const UNDO = process.argv.includes("--undo");
const dayArg = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const DAY = dayArg || "2026-11-07";

async function main() {
  await mongoose.connect(process.env.DB_URI);

  // 11:00–15:15 local in any US zone falls between 12:00 and 23:59 UTC that day.
  const from = new Date(`${DAY}T00:00:00Z`);
  const to = new Date(`${DAY}T23:59:59Z`);
  const rounds = await AuctionRound.find({
    closedAt: null,
    auctionEndDate: { $gte: from, $lte: to },
  }).lean();

  const products = await productModel
    .find({ _id: { $in: rounds.map((r) => r.productId) } })
    .select("productName street sellerIds")
    .lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  console.table(rounds.map((r) => {
    const p = byId.get(String(r.productId)) || {};
    return {
      property: String(p.productName || p.street || r.productId).slice(0, 40),
      round: r.roundNumber,
      ends: r.auctionEndDate && r.auctionEndDate.toISOString(),
      sellers: (p.sellerIds || []).length,
      skipSellerEmail: !!r.skipSellerEmail,
    };
  }));
  console.log(`Open rounds ending ${DAY}: ${rounds.length}`);

  if (!APPLY && !UNDO) {
    console.log("Preview only. Run with --apply (or --undo).");
  } else {
    const res = await AuctionRound.updateMany(
      { _id: { $in: rounds.map((r) => r._id) }, closedAt: null },
      { $set: { skipSellerEmail: !UNDO } }
    );
    console.log(`${UNDO ? "Cleared" : "Set"} skipSellerEmail on ${res.modifiedCount} round(s).`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
