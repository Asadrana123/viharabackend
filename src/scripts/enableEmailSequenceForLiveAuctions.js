// scripts/enableEmailSequenceForLiveAuctions.js
//
// One-time fix: turns the backend email sequence (E1, R1, R2, PT1) on for every
// property already live on the /auctions page. New ones get it automatically
// when they go live (productModel pre-save hook).
//
//   node src/scripts/enableEmailSequenceForLiveAuctions.js           (preview only)
//   node src/scripts/enableEmailSequenceForLiveAuctions.js --apply   (make the change)

require("dotenv").config();
const mongoose = require("mongoose");
const productModel = require("../model/property/productModel");

const APPLY = process.argv.includes("--apply");

// Same filter as the public /auctions page.
const filter = {
    showOnAuctions: true,
    isTestProperty: { $ne: true },
    emailSequenceEnabled: { $ne: true },
};

async function main() {
    await mongoose.connect(process.env.DB_URI);

    const products = await productModel.find(filter).select("productName street city").lean();
    console.table(products.map((p) => ({
        id: String(p._id),
        property: String(p.productName || [p.street, p.city].filter(Boolean).join(", ")).slice(0, 50),
    })));
    console.log(`Live on /auctions with emails off: ${products.length}`);

    if (!APPLY) {
        console.log("Preview only. Run again with --apply to switch emails on for these.");
    } else if (products.length) {
        const res = await productModel.updateMany(
            { _id: { $in: products.map((p) => p._id) } },
            { $set: { emailSequenceEnabled: true } }
        );
        console.log(`Switched emails on for ${res.modifiedCount} properties.`);
    }

    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await mongoose.disconnect();
    process.exit(1);
});
