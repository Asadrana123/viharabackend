// scripts/moveLiveAuctionsToNov7.js
//
// One-time fix: every property on the /auctions page (including the ones the
// old close logic wrongly marked "sold") gets its auction end moved to
// Nov 7, 2026, keeping the end's time of day in the property's own timezone.
//
//   - A property whose current auction round is already closed gets a new
//     round with the same terms (the same way Manage Listings "Start a new
//     auction" does), so bidding opens again and status goes back to "active".
//   - Otherwise only the dates change and status is set to "active".
//   - The start date stays, unless it falls on or after the new end — then
//     the auction starts now.
//
// The old values are written to a JSON file before anything changes.
//
//   node src/scripts/moveLiveAuctionsToNov7.js           (preview only)
//   node src/scripts/moveLiveAuctionsToNov7.js --apply   (make the change)

require("dotenv").config();
const fs = require("fs");
const os = require("os");
const path = require("path");
const mongoose = require("mongoose");
const productModel = require("../model/property/productModel");
const { resolvePropertyTimezone, wallClockToUtc, utcToWallClock } = require("../utils/resolveTimezone");
const AuctionRound = require("../model/bidding/auctionRoundModel");
const { startNewRound } = require("../services/bidding/auctionRoundService");

const APPLY = process.argv.includes("--apply");
const NEW_END_DAY = "2026-11-07";
const DEFAULT_END_TIME = "17:00";

// Same filter as the public /auctions page, before sold properties were hidden.
const filter = { showOnAuctions: true, isTestProperty: { $ne: true } };

function plan(product) {
  const timezone = resolvePropertyTimezone(product);
  const oldEndLocal = utcToWallClock(product.auctionEndDate, timezone);
  const time = oldEndLocal ? oldEndLocal.slice(11, 16) : DEFAULT_END_TIME;
  const newEnd = wallClockToUtc(`${NEW_END_DAY}T${time}`, timezone);
  const start = product.auctionStartDate ? new Date(product.auctionStartDate) : null;
  const newStart = start && start < newEnd ? start : new Date();
  return { timezone, newStart, newEnd };
}

async function main() {
  await mongoose.connect(process.env.DB_URI);

  const products = await productModel.find(filter);
  const rows = [];
  for (const p of products) {
    // Read-only: a property without rounds yet counts as closed only if it was marked sold.
    const round = p.currentRoundId ? await AuctionRound.findById(p.currentRoundId).select("closedAt").lean() : null;
    const roundClosed = round ? !!round.closedAt : p.status === "sold";
    const { timezone, newStart, newEnd } = plan(p);
    rows.push({ product: p, roundClosed, timezone, newStart, newEnd });
  }

  console.table(rows.map((r) => ({
    property: String(r.product.productName || r.product.street || r.product._id).slice(0, 40),
    status: r.product.status,
    oldEnd: utcToWallClock(r.product.auctionEndDate, r.timezone),
    newEnd: utcToWallClock(r.newEnd, r.timezone),
    newStart: utcToWallClock(r.newStart, r.timezone),
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
    try {
      if (r.roundClosed) {
        await startNewRound(p._id, {
          auctionStartDate: r.newStart,
          auctionEndDate: r.newEnd,
          startBid: p.startBid,
          reservePrice: p.reservePrice ?? null,
          minIncrement: p.minIncrement ?? null,
        });
      } else {
        await productModel.updateOne(
          { _id: p._id },
          { $set: { auctionStartDate: r.newStart, auctionEndDate: r.newEnd, status: "active" } }
        );
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
