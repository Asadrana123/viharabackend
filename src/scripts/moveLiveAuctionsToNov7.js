// scripts/moveLiveAuctionsToNov7.js
//
// One-time fix: every property on the /auctions page runs its auction on
// Nov 7, 2026, 11:00–15:15 in the property's own timezone.
//
//   - Current round still open → its dates change (property and round record),
//     status goes back to "active".
//   - Current round already closed → a new round opens with these dates and the
//     same terms (like Manage Listings "Start a new auction").
//
// The old values are written to a JSON file in the temp folder before anything changes.
//
//   node src/scripts/moveLiveAuctionsToNov7.js           (preview only)
//   node src/scripts/moveLiveAuctionsToNov7.js --apply   (make the change)

require("dotenv").config();
const fs = require("fs");
const os = require("os");
const path = require("path");
const mongoose = require("mongoose");
const productModel = require("../model/property/productModel");
const AuctionRound = require("../model/bidding/auctionRoundModel");
const { resolvePropertyTimezone, wallClockToUtc, utcToWallClock } = require("../utils/resolveTimezone");
const { startNewRound } = require("../services/bidding/auctionRoundService");

const APPLY = process.argv.includes("--apply");
const DAY = "2026-11-07";
const START_TIME = "11:00";
const END_TIME = "15:15";

// Same filter as the public /auctions page.
const filter = { showOnAuctions: true, isTestProperty: { $ne: true }, status: { $ne: "sold" } };

async function main() {
  await mongoose.connect(process.env.DB_URI);

  const products = await productModel.find(filter);
  const rows = [];
  for (const p of products) {
    // Read-only: a property without rounds yet counts as closed only if it was marked sold.
    const round = p.currentRoundId ? await AuctionRound.findById(p.currentRoundId).select("closedAt").lean() : null;
    const roundClosed = round ? !!round.closedAt : p.status === "sold";
    const timezone = resolvePropertyTimezone(p);
    rows.push({
      product: p,
      roundClosed,
      timezone,
      newStart: wallClockToUtc(`${DAY}T${START_TIME}`, timezone),
      newEnd: wallClockToUtc(`${DAY}T${END_TIME}`, timezone),
    });
  }

  console.table(rows.map((r) => ({
    property: String(r.product.productName || r.product.street || r.product._id).slice(0, 40),
    status: r.product.status,
    old: `${utcToWallClock(r.product.auctionStartDate, r.timezone)} → ${utcToWallClock(r.product.auctionEndDate, r.timezone)}`,
    new: `${utcToWallClock(r.newStart, r.timezone)} → ${utcToWallClock(r.newEnd, r.timezone)}`,
    zone: r.timezone,
    action: r.roundClosed ? "new auction round" : "move dates",
  })));
  console.log(`Properties on /auctions: ${rows.length}`);

  if (!APPLY) {
    console.log("Preview only. Run again with --apply to make the change.");
    await mongoose.disconnect();
    return;
  }

  const backupFile = path.join(os.tmpdir(), `auction-dates-backup-${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(rows.map((r) => ({
    _id: String(r.product._id),
    status: r.product.status,
    auctionStartDate: r.product.auctionStartDate,
    auctionEndDate: r.product.auctionEndDate,
    currentRoundId: r.product.currentRoundId ? String(r.product.currentRoundId) : null,
  })), null, 2));
  console.log(`Old values saved to ${backupFile}`);

  for (const r of rows) {
    const p = r.product;
    const dates = { auctionStartDate: r.newStart, auctionEndDate: r.newEnd };
    try {
      if (r.roundClosed) {
        await startNewRound(p._id, {
          ...dates,
          startBid: p.startBid,
          reservePrice: p.reservePrice ?? null,
          minIncrement: p.minIncrement ?? null,
        });
      } else {
        await productModel.updateOne({ _id: p._id }, { $set: { ...dates, status: "active" } });
        if (p.currentRoundId) {
          await AuctionRound.updateOne({ _id: p.currentRoundId, closedAt: null }, { $set: dates });
        }
      }
      console.log(`✓ ${p.productName || p._id}`);
    } catch (err) {
      console.error(`✗ ${p.productName || p._id}: ${err.message}`);
    }
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
