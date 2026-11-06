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
// Exception: a CONFIRMED sold home is hidden automatically (showOnAuctions +
// isLandingPage off, sync paused): sold on two checks at least 20 hours apart,
// both of the page's status fields say sold, and nobody pressed "Keep live" on
// the first alert (see recordMarketStatus). Anything else (pending, off market)
// waits for the buttons. After the daily check a summary goes to the
// same channel (status counts, live properties not for sale, failures), but only
// when something changed, a check failed twice in a row, or on Mondays
// (statusReportRules.js). The alerts above are never held back.

const productModel = require("../../model/property/productModel");
const firecrawlService = require("../integrations/firecrawlService");
const { parseMarketDataPropertyJson } = require("./parsers/marketDataPropertyJsonParser");
const { auctionPageUrl } = require("../../config/siteUrls");
const guard = require("../adsLoop/guardrails");
const slack = require("../adsLoop/slackBot");
const ReportState = require("../../model/property/marketStatusReportStateModel");
const { decideDailyReport } = require("./statusReportRules");

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

const SOLD_STATUSES = new Set(["RECENTLY_SOLD", "SOLD"]);
// A sold reading must still hold on a later check at least this long after the first.
const SOLD_CONFIRM_AFTER_MS = 20 * 60 * 60 * 1000;
const AUTO_HIDDEN_NOTE = "🙈 Still sold on a second check (both of the listing's status fields say sold), so it was taken off the site automatically (auctions page + landing page off). Market sync for it is paused.";

/**
 * Store a freshly read status on product.marketSync (not saved here).
 *
 * A visible property is hidden automatically (showOnAuctions + isLandingPage off,
 * sync paused, product.$locals.autoHidden set) only when the sale is confirmed:
 *   - this read says sold in BOTH status fields (homeStatus SOLD / RECENTLY_SOLD
 *     and keystoneHomeStatus e.g. "RecentlySold"), and
 *   - an earlier read, at least SOLD_CONFIRM_AFTER_MS ago, already said sold and
 *     that alert is still open (nobody pressed "Keep live").
 * The first sold read only raises the normal Slack alert.
 *
 * @param {object} [evidence]
 * @param {string|null} [evidence.keystoneHomeStatus] - the page's second status field from this read
 * @returns {boolean} true when Slack should be told: the status changed, the
 *          listing is off the market and that status was never reported, or it
 *          was just hidden as sold.
 */
function recordMarketStatus(product, newStatus, { keystoneHomeStatus } = {}) {
    const sync = product.marketSync;
    if (!newStatus) return false;

    const previous = sync.marketStatus;
    const changed = Boolean(previous && newStatus !== previous);
    const notYetReported = newStatus !== "FOR_SALE" && newStatus !== sync.reportedStatus;
    sync.marketStatus = newStatus;

    const alert = sync.statusAlert;
    const soldEarlier = Boolean(
        alert && SOLD_STATUSES.has(alert.to) && alert.detectedAt &&
        Date.now() - new Date(alert.detectedAt).getTime() >= SOLD_CONFIRM_AFTER_MS
    );
    const confirmedSold = SOLD_STATUSES.has(newStatus) && /sold/i.test(keystoneHomeStatus || "") && soldEarlier;
    if (confirmedSold && (product.showOnAuctions || product.isLandingPage)) {
        product.showOnAuctions = false;
        product.isLandingPage = false;
        sync.enabled = false;
        product.$locals.autoHidden = true;
        return true; // keeps the open alert, so its Slack message can be closed
    }
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
        blocks.push(context(
            SOLD_STATUSES.has(alert.to)
                ? "It is still live on the site. If it still shows sold on the next check (about a day from now), it will be hidden automatically. Press Keep live to stop that."
                : "It is still live on the site. Check the listing, then choose:"
        ));
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
    const autoHidden = Boolean(product.$locals?.autoHidden);
    try {
        // Drop the buttons from the first "looks sold" message.
        if (autoHidden) await closeAlertMessage(product, AUTO_HIDDEN_NOTE);
        const blocks = alertBlocks(product, autoHidden ? AUTO_HIDDEN_NOTE : undefined);
        const { ts, channel: ch } = await slack.postMessage({ channel, text: alertText(product), blocks });
        await productModel.updateOne(
            { _id: product._id },
            {
                $set: autoHidden
                    // Nothing left to decide, so no open alert.
                    ? { "marketSync.reportedStatus": product.marketSync.statusAlert.to, "marketSync.statusAlert": null }
                    : {
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
    const parsed = parseMarketDataPropertyJson(payload);
    const newStatus = parsed?.homeStatus || null;
    if (!newStatus) throw new Error("No listing status found on the page");

    const report = recordMarketStatus(product, newStatus, { keystoneHomeStatus: parsed.keystoneHomeStatus });
    // Only the status fields (plus the hide switches for a sold home) are written,
    // so an admin edit made meanwhile is kept.
    const hidden = product.$locals.autoHidden
        ? { showOnAuctions: false, isLandingPage: false, "marketSync.enabled": false }
        : {};
    await productModel.updateOne(
        { _id: product._id },
        { $set: { "marketSync.marketStatus": newStatus, ...hidden, ...(report ? { "marketSync.statusAlert": product.marketSync.statusAlert } : {}) } }
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

/** Posts the summary. Returns true when it went through. */
async function postDailyReport(summary, rows) {
    const channel = slackChannel();
    if (!channel) return false;
    const text = `Daily property status check: ${summary.checked}/${summary.total} checked, ${summary.alerts} new alert(s)`;
    try {
        await slack.postMessage({ channel, text, blocks: reportBlocks(summary, rows) });
        return true;
    } catch (e) {
        console.error("[marketStatus] Daily report to Slack failed:", e.message);
        return false;
    }
}

/**
 * Posts the summary when statusReportRules says so, and saves what was seen. What was
 * posted is saved only when the post went through, so a failed post is tried again.
 */
async function reportIfChanged(summary, rows, { force = false } = {}) {
    const state = await ReportState.findOne({ key: "default" }).lean();
    const decision = decideDailyReport({ rows, state, force });
    // A property that is checked fine again drops out, so a later repeat failure is posted again.
    const stillFailing = (state?.postedFailedIds || []).filter((id) => decision.failed.includes(id));
    const update = { lastFailedIds: decision.failed, postedFailedIds: stillFailing, lastCheckAt: new Date() };
    if (decision.post && (await postDailyReport(summary, rows))) {
        Object.assign(update, { notForSaleKey: decision.key, postedFailedIds: decision.repeatedFailures, lastPostedAt: new Date() });
    }
    console.log(`[marketStatus] Daily summary ${decision.post ? "posted" : "not posted"} (${decision.reason}).`);
    await ReportState.updateOne({ key: "default" }, { $set: update }, { upsert: true });
}

/**
 * Check every property live on /auctions with a linked, not-paused listing,
 * then post the daily summary to Slack when something changed (see statusReportRules.js).
 * @param {object} [options]
 * @param {boolean} [options.force] - run by hand: always post the summary
 * @returns {Promise<{ total:number, checked:number, failed:number, alerts:number, skipped?:string }>}
 */
async function checkAllStatuses({ force = false } = {}) {
    const summary = { total: 0, checked: 0, failed: 0, alerts: 0 };
    if (!firecrawlService.isConfigured()) return { ...summary, skipped: "FIRECRAWL_API_KEY missing" };

    const products = await productModel
        .find({
            $or: [{ showOnAuctions: true }, { isLandingPage: true }],
            "marketSync.url": { $nin: [null, ""] },
            "marketSync.enabled": { $ne: false },
        })
        .select("productName slug showOnAuctions isLandingPage marketSync");
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

    await reportIfChanged(summary, rows, { force }).catch((e) => console.error("[marketStatus] Daily summary failed:", e.message));
    return summary;
}

module.exports = { checkAllStatuses, recordMarketStatus, reportStatusChange, handleHide, handleKeep };
