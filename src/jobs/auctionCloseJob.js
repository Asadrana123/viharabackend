// jobs/auctionCloseJob.js
//
// Closes ended auctions from the server, every minute, so closing no longer
// depends on someone having the auction page open when the countdown hits zero.
//
// It calls the same finalizeAuction the browser countdown uses. That function
// claims the property's current auction round atomically, so if a browser
// closes it first the job simply skips it — the seller report is never sent
// twice for a round.
//
// Only auctions that ended within the lookback window are picked up, so the
// first run after a deploy doesn't email sellers about long-finished auctions.

const cron = require("node-cron");
const Product = require("../model/property/productModel");
const { finalizeAuction } = require("../socket/socketHandlers");

// How far back to look for ended-but-unclosed auctions. Override with
// AUCTION_CLOSE_LOOKBACK_HOURS.
const LOOKBACK_HOURS = Math.max(1, parseInt(process.env.AUCTION_CLOSE_LOOKBACK_HOURS, 10) || 24);

const SCHEDULE = "* * * * *"; // every minute

let task = null;
let running = false;

async function closeEndedAuctions() {
  if (running) return; // previous sweep still in progress
  running = true;

  try {
    const now = new Date();
    const since = new Date(now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000);

    const due = await Product.find({
      showOnAuctions: true,
      status: { $nin: ["sold", "cancelled"] },
      auctionEndDate: { $lte: now, $gte: since }
    })
      .select("_id")
      .lean();

    for (const { _id } of due) {
      const auctionId = String(_id);
      try {
        const result = await finalizeAuction(auctionId);
        if (result) console.log(`[auction-close] closed auction ${auctionId}`);
      } catch (err) {
        console.error(`[auction-close] failed for auction ${auctionId}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[auction-close] sweep failed:", err.message);
  } finally {
    running = false;
  }
}

function startAuctionCloseJob() {
  if (task) return task; // guard against accidental double-start

  task = cron.schedule(SCHEDULE, closeEndedAuctions);

  console.log(`[auction-close] scheduled every minute (lookback ${LOOKBACK_HOURS}h)`);
  return task;
}

module.exports = { startAuctionCloseJob, closeEndedAuctions };
