// scripts/zernioAccounts.js
//
// Prints the Zernio accounts connected to ZERNIO_API_KEY, so their ids can be
// put in .env for the Meta Ads Loop. Read-only: it only calls GET /v1/accounts.
//
//   node src/scripts/zernioAccounts.js

require("dotenv").config();
const { listAccounts } = require("../services/adsLoop/zernioClient");

(async () => {
    const data = await listAccounts();
    const accounts = Array.isArray(data) ? data : data.accounts || [];
    if (!accounts.length) {
        console.log("No accounts are connected to this API key yet. Connect Facebook, Instagram and Meta Ads in Zernio first.");
        return;
    }
    for (const a of accounts) {
        console.log(`\n${a.platform}  ${a.displayName || a.username || ""}`);
        console.log(`  Zernio account id: ${a._id}`);
        // Ad accounts behind an ads connection (act_...), when Zernio returns them.
        const adAccounts = a.adAccounts || a.metadata?.adAccounts || a.platformAdAccounts;
        if (Array.isArray(adAccounts)) {
            for (const ad of adAccounts) console.log(`  Meta ad account: ${ad.id || ad.accountId || ad} ${ad.name ? `(${ad.name})` : ""}`);
        }
    }
    console.log("\nFull response (for anything not shown above):");
    console.log(JSON.stringify(data, null, 2));
})().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
