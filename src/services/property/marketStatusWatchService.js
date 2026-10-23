// services/property/marketStatusWatchService.js
//
// Daily check of the market data listing status (FOR_SALE, PENDING,
// RECENTLY_SOLD, ...) of every property live on /auctions. Runs from
// jobs/marketSyncJob.js; the weekly full sync reports through here too.
//
// Only the status is read: one raw HTML scrape per property (the status sits
// in the page's JSON), nothing else on the property is changed.
//
// When the status changes — or a live property is already off the market and
// nobody was told yet — one Slack message goes out with the listing link and:
//   Hide from site   showOnAuctions off + market sync paused (approvers only)
//   Keep live        clears the alert; the property stays as it is
// Nothing is hidden automatically. After every daily check a summary goes to
// the same channel (status counts, live properties not for sale, failures).

const productModel = require("../../model/property/productModel");
const firecrawlService = require("../integrations/firecrawlService");
const { parseMarketDataPropertyJson } = require("./parsers/marketDataPropertyJsonParser");
const { auctionPageUrl } = require("../../config/siteUrls");
const guard = require("../adsLoop/guardrails");
const slack = require("../adsLoop/slackBot");

const { section, context, button, actions } = slack.blocks;

// Pause between properties so the source/Firecrawl aren't hit in a burst.
const DELAY_BETWEEN_PROPERTIES_MS = 5000;

const STATUS_LABEL = {
    FOR_SALE: "For sale",
    PENDING: "Pending (under contract)",
    RECENTLY_SOLD: "Sold",
    SOLD: "Sold",
    OFF_MARKET: "Off market",
    OTHER: "Off market / other",
    FOR_RENT: "For rent",
};
const label = (status) => STATUS_LABEL[status] || status || "unknown";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const slackChannel = () =>
    process.env.SLACK_MARKET_STATUS_CHANNEL_ID || process.env.SLACK_REPAIR_CHANNEL_ID || process.env.SLACK_ADS_WEEKLY_CHANNEL_ID || "";

/**
 * Store a freshly read status on product.marketSync (not saved here).
 * @returns {boolean} true when Slack should be told: the status changed, or
 *          the listing is off the market and that status was never reported.
 */
function recordMarketStatus(product, newStatus) {
    const sync = product.marketSync;
    if (!newStatus) return false;

    const previous = sync.marketStatus;
    const changed = Boolean(previous && newStatus !== previous);
    const notYetReported = newStatus !== "FOR_SALE" && newStatus !== sync.reportedStatus;
    sync.marketStatus = newStatus;
    if (!changed && !notYetReported) return false;

    sync.statusAlert = { from: previous || null, to: newStatus, detectedAt: new Date() };
    return true;
}

// ---------------------------------------------------------------------------
// Slack
// ---------------------------------------------------------------------------
function alertBlocks(product, outcome) {
    const sync = product.marketSync;
    const alert = sync.statusAlert || {};
    const name = product.productName || product.slug || String(product._id);
    const change = alert.from && alert.from !== alert.to
        ? `${label(alert.from)} → *${label(alert.to)}*`
        : `*${label(alert.to)}*`;
    const links = [`<${sync.url}|Open the listing>`];
    if (product.slug) links.push(`<${auctionPageUrl(product.slug)}|our page>`);

    const blocks = [
        section(`🏠 *Market status changed: ${name}*\n${change}`),
        context(links.join(" · ")),
    ];
    if (outcome) {
        blocks.push(context(outcome));
    } else {
        blocks.push(context("It is still live on the site. Check the listing, then choose:"));
        blocks.push(
            actions([
                button("Hide from site", "market_status_hide", product._id, "danger"),
                button("Keep live", "market_status_keep", product._id),
            ])
        );
    }
    return blocks;
}

const alertText = (product) =>
    `Market status changed: ${product.productName || product.slug} is now ${label(product.marketSync.statusAlert?.to)}`;

/** Post the alert for a property whose statusAlert was just set. Never throws. */
async function reportStatusChange(product) {
    const channel = slackChannel();
    if (!channel) {
        console.warn("[marketStatus] No Slack channel set (SLACK_MARKET_STATUS_CHANNEL_ID); alert not sent.");
        return false;
    }
    try {
        const { ts, channel: ch } = await slack.postMessage({ channel, text: alertText(product), blocks: alertBlocks(product) });
        await productModel.updateOne(
            { _id: product._id },
            {
                $set: {
                    "marketSync.reportedStatus": product.marketSync.statusAlert.to,
                    "marketSync.statusAlert.slackChannel": ch,
                    "marketSync.statusAlert.slackTs": ts,
                },
            }
        );
        return true;
    } catch (error) {
        // reportedStatus stays unset, so the next check tries again.
        console.error(`[marketStatus] Slack for ${product._id} failed:`, error.message);
        return false;
    }
}

/** Show the outcome on the original message and drop its buttons. */
async function closeAlertMessage(product, outcome) {
    const alert = product.marketSync.statusAlert;
    if (!alert?.slackChannel || !alert?.slackTs) return;
    await slack
        .updateMessage({ channel: alert.slackChannel, ts: alert.slackTs, text: alertText(product), blocks: alertBlocks(product, outcome) })
        .catch((e) => console.error("[marketStatus] Slack update failed:", e.message));
}

async function loadAlerted(productId) {
    const product = await productModel.findById(productId);
    if (!product) throw new guard.GuardrailError("This property no longer exists.");
    if (!product.marketSync?.statusAlert) throw new guard.GuardrailError("Someone already handled this alert.");
    return product;
}

async function handleHide({ productId, userId }) {
    guard.assertApprover(userId);
    const product = await loadAlerted(productId);
    product.showOnAuctions = false;
    product.marketSync.enabled = false;
    await closeAlertMessage(product, `🙈 Hidden from the site by <@${userId}>. Market sync for it is paused.`);
    product.marketSync.statusAlert = null;
    await product.save({ validateBeforeSave: false });
}

async function handleKeep({ productId, userId }) {
    guard.assertApprover(userId);
    const product = await loadAlerted(productId);
    await closeAlertMessage(product, `✅ Kept live by <@${userId}>.`);
    product.marketSync.statusAlert = null;
    await product.save({ validateBeforeSave: false });
}

// ---------------------------------------------------------------------------
// Daily check
// ---------------------------------------------------------------------------
/** Read one property's status and report a change. Throws on scrape failure. */
async function checkProduct(product) {
    const payload = await firecrawlService.scrapePropertyImages(product.marketSync.url);
    const newStatus = parseMarketDataPropertyJson(payload)?.homeStatus || null;
    if (!newStatus) throw new Error("No listing status found on the page");

    const report = recordMarketStatus(product, newStatus);
    // Only the status fields are written, so an admin edit made meanwhile is kept.
    await productModel.updateOne(
        { _id: product._id },
        { $set: { "marketSync.marketStatus": newStatus, ...(report ? { "marketSync.statusAlert": product.marketSync.statusAlert } : {}) } }
    );
    return report ? reportStatusChange(product) : false;
}

const propertyLink = (product) =>
    `<${product.marketSync.url}|${product.productName || product.slug || product._id}>`;

/** The daily summary: status counts, every property not for sale, failures. */
function reportBlocks(summary, rows) {
    const counts = {};
    rows.filter((r) => r.status).forEach((r) => { counts[label(r.status)] = (counts[label(r.status)] || 0) + 1; });
    const countLine = Object.entries(counts).map(([status, n]) => `${status}: ${n}`).join(" · ") || "none";

    const blocks = [
        section(`📋 *Daily property status check*\n${summary.checked} of ${summary.total} live properties checked · ${countLine}`),
    ];
    const notForSale = rows.filter((r) => r.status && r.status !== "FOR_SALE");
    blocks.push(
        section(
            notForSale.length
                ? `*Live on our site but not for sale on the listing*\n${notForSale
                    .map((r) => `• ${propertyLink(r.product)}: ${label(r.status)}${r.alerted ? " (new, see the alert above)" : r.open ? " (alert still open)" : " (kept live)"}`)
                    .join("\n")}`
                : "✅ Every live property is still for sale."
        )
    );
    const failed = rows.filter((r) => r.error);
    if (failed.length) {
        blocks.push(context(`⚠️ Could not check: ${failed.map((r) => `${propertyLink(r.product)} (${r.error})`).join(", ")}`));
    }
    return blocks;
}

async function postDailyReport(summary, rows) {
    const channel = slackChannel();
    if (!channel) return;
    const text = `Daily property status check: ${summary.checked}/${summary.total} checked, ${summary.alerts} new alert(s)`;
    await slack
        .postMessage({ channel, text, blocks: reportBlocks(summary, rows) })
        .catch((e) => console.error("[marketStatus] Daily report to Slack failed:", e.message));
}

/**
 * Check every property live on /auctions with a linked, not-paused listing,
 * then post the daily summary to Slack.
 * @returns {Promise<{ total:number, checked:number, failed:number, alerts:number, skipped?:string }>}
 */
async function checkAllStatuses() {
    const summary = { total: 0, checked: 0, failed: 0, alerts: 0 };
    if (!firecrawlService.isConfigured()) return { ...summary, skipped: "FIRECRAWL_API_KEY missing" };

    const products = await productModel
        .find({ showOnAuctions: true, "marketSync.url": { $nin: [null, ""] }, "marketSync.enabled": { $ne: false } })
        .select("productName slug showOnAuctions marketSync");
    summary.total = products.length;

    const rows = [];
    for (let i = 0; i < products.length; i++) {
        const product = products[i];
        try {
            const alerted = await checkProduct(product);
            if (alerted) summary.alerts += 1;
            summary.checked += 1;
            rows.push({ product, status: product.marketSync.marketStatus, alerted, open: Boolean(product.marketSync.statusAlert) });
        } catch (error) {
            summary.failed += 1;
            console.error(`[marketStatus] Property ${product._id} failed:`, error.message);
            rows.push({ product, status: product.marketSync.marketStatus, error: String(error.message || error).slice(0, 120) });
        }
        if (i < products.length - 1) await sleep(DELAY_BETWEEN_PROPERTIES_MS);
    }

    await postDailyReport(summary, rows);
    return summary;
}

module.exports = { checkAllStatuses, recordMarketStatus, reportStatusChange, handleHide, handleKeep };
