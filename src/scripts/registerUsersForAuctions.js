// scripts/registerUsersForAuctions.js
//
// ONE-TIME admin backfill: register a fixed list of already-known-interested
// users for specific auctions, on their behalf, as buyerType "Buy and hold".
//
// For each (auctionId, userId) pair below:
//   - Looks up the user (for firstName/lastName/email) and the auction, to
//     make sure both exist.
//   - If no AuctionRegistration exists yet for that (userId, auctionId) pair,
//     creates one with buyerType "Buy and hold" and status "approved" (since
//     this is an admin-initiated registration, not a self-serve submission
//     awaiting review).
//   - If one already exists and is "approved", leaves it alone.
//   - If one already exists as "pending"/"rejected", updates it to "approved"
//     with the buyerType/contact info below (mirrors what the public
//     submitAuctionRegistration controller does on resubmission).
//   - Does NOT send any of the registration emails the public route sends
//     (received/admin-notification) - this is a silent backend backfill.
//
// Usage:
//   node src/scripts/registerUsersForAuctions.js --dry   # preview only
//   node src/scripts/registerUsersForAuctions.js         # apply

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../model/userModel");
const Product = require("../model/productModel");
const AuctionRegistration = require("../model/auctionRegistration");

const DRY_RUN = process.argv.includes("--dry");
const BUYER_TYPE = "Buy and hold";

const registrations = [
  {
    auctionId: "6a6df107c3c887ac5ab9c02a",
    userId: "6a7fafb9080f48aea90881e8", // Leandre Whitlow
    mobilePhone: "+1 (213) 656-3516",
  },
  {
    auctionId: "6a6df107c3c887ac5ab9c02a",
    userId: "6a90a66fa34e37ca5645f125", // Jerry
    mobilePhone: "+1 (562) 209-0383",
  },
  {
    auctionId: "6a6df107c3c887ac5ab9c02a",
    userId: "6a907b47a34e37ca5645bac4", // Alex Whitaker
    mobilePhone: "+1 (714) 329-3030",
  },
  {
    auctionId: "6a6df107c3c887ac5ab9c01e",
    userId: "6a91d2a55219b18b1feabe6c", // David Weisz
    mobilePhone: "+1 (347) 408-9772",
  },
];

async function main() {
  if (!process.env.DB_URI) throw new Error("DB_URI is not set");
  await mongoose.connect(process.env.DB_URI, { serverSelectionTimeoutMS: 5000 });
  console.log(`[register] connected${DRY_RUN ? " (DRY RUN - no writes)" : ""}`);

  const summary = { created: 0, updated: 0, alreadyApproved: 0, skipped: 0 };

  for (const entry of registrations) {
    const user = await User.findById(entry.userId);
    if (!user) {
      console.warn(`[register] skip: user not found ${entry.userId}`);
      summary.skipped++;
      continue;
    }

    const auction = await Product.findById(entry.auctionId);
    if (!auction) {
      console.warn(`[register] skip: auction not found ${entry.auctionId}`);
      summary.skipped++;
      continue;
    }

    const firstName = user.name;
    const lastName = user.last_name;
    const email = user.email;

    if (!firstName || !lastName || !email) {
      console.warn(`[register] skip: user ${entry.userId} missing name/last_name/email`);
      summary.skipped++;
      continue;
    }

    const existing = await AuctionRegistration.findOne({
      userId: entry.userId,
      auctionId: entry.auctionId,
    });

    if (existing) {
      if (existing.status === "approved") {
        console.log(`[register] already approved: ${firstName} ${lastName} -> auction ${entry.auctionId}`);
        summary.alreadyApproved++;
        continue;
      }

      console.log(`[register] updating existing (${existing.status} -> approved): ${firstName} ${lastName} -> auction ${entry.auctionId}`);
      summary.updated++;
      if (!DRY_RUN) {
        existing.firstName = firstName;
        existing.lastName = lastName;
        existing.email = email;
        existing.mobilePhone = entry.mobilePhone;
        existing.buyerType = BUYER_TYPE;
        existing.status = "approved";
        existing.updatedAt = new Date();
        await existing.save();
      }
      continue;
    }

    console.log(`[register] creating: ${firstName} ${lastName} <${email}> -> auction ${entry.auctionId}`);
    summary.created++;
    if (!DRY_RUN) {
      await AuctionRegistration.create({
        userId: entry.userId,
        auctionId: entry.auctionId,
        firstName,
        lastName,
        email,
        mobilePhone: entry.mobilePhone,
        buyerType: BUYER_TYPE,
        status: "approved",
      });
    }
  }

  console.log("[register] done:", summary);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("[register] fatal:", err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
