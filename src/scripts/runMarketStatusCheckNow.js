// scripts/runMarketStatusCheckNow.js
//
// Run the daily market status check by hand (same code as jobs/marketSyncJob.js):
//   node src/scripts/runMarketStatusCheckNow.js
// Every live property's listing status is read; changes and off-market
// properties not reported yet are posted to Slack with Hide / Keep live buttons.

require("dotenv").config();
const mongoose = require("mongoose");
const { checkAllStatuses } = require("../services/property/marketStatusWatchService");

async function main() {
    await mongoose.connect(process.env.DB_URI);
    const startedAt = Date.now();
    const summary = await checkAllStatuses();
    console.log(`Done in ${((Date.now() - startedAt) / 60000).toFixed(1)} min:`, summary);
    await mongoose.disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
