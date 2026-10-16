// services/adsLoop/zernioClient.js
//
// Zernio is the single source for Meta numbers and the single path for
// writes (ads and organic posts). Base URL https://zernio.com/api, Bearer
// API key. Paths and fields are from Zernio's OpenAPI spec (v1.267).
//
// Every call is retried with backoff on rate limits, 5xx and network errors;
// after the third failed try the error is thrown with a readable message, and
// the caller posts it to the Slack thread and stops.

const axios = require("axios");
const crypto = require("crypto");
const { getAdsLoopConfig } = require("../../config/adsLoop/adsLoopConfig");

// 409 is not here: Zernio uses it for "account connection required".
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const BASE_DELAY_MS = 2000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class ZernioError extends Error {
    constructor(message, { status = null, data = null } = {}) {
        super(message);
        this.name = "ZernioError";
        this.status = status;
        this.data = data;
    }
}

function readableError(error) {
    const data = error?.response?.data;
    const detail = data?.error || data?.message || error?.message || "Zernio request failed";
    const code = data?.code ? ` (${data.code})` : "";
    return `${typeof detail === "string" ? detail : JSON.stringify(detail)}${code}`;
}

function retryDelay(error, attempt) {
    const retryAfter = Number(error?.response?.headers?.["retry-after"]);
    if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 60000);
    return BASE_DELAY_MS * 2 ** (attempt - 1);
}

/**
 * @param {string} method
 * @param {string} path         "/v1/ads"
 * @param {object} [options]
 * @param {object} [options.params]
 * @param {object} [options.data]
 * @param {string} [options.idempotencyKey]  makes create retries safe (same key, same body)
 * @param {boolean} [options.acceptPending]  treat 202 (backfill pending) as success
 */
async function request(method, path, { params, data, idempotencyKey, acceptPending = true } = {}) {
    const { apiKey, baseUrl, maxAttempts, timeoutMs } = getAdsLoopConfig().zernio;
    if (!apiKey) throw new ZernioError("ZERNIO_API_KEY is not set on the server");

    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

    for (let attempt = 1; ; attempt++) {
        try {
            const res = await axios({ method, url: `${baseUrl}${path}`, params, data, headers, timeout: timeoutMs });
            if (res.status === 202 && !acceptPending) throw Object.assign(new Error("Zernio data is still syncing"), { response: res });
            return res.data;
        } catch (error) {
            const status = error?.response?.status;
            const retryable = !status || RETRYABLE_STATUS.has(status) || (status === 202 && !acceptPending);
            if (!retryable || attempt >= maxAttempts) {
                throw new ZernioError(`Zernio ${method.toUpperCase()} ${path} failed after ${attempt} ${attempt === 1 ? "try" : "tries"}: ${readableError(error)}`, {
                    status,
                    data: error?.response?.data,
                });
            }
            await sleep(retryDelay(error, attempt));
        }
    }
}

const newIdempotencyKey = () => crypto.randomUUID();

// ---------------------------------------------------------------------------
// Ads
// ---------------------------------------------------------------------------
/** Every ad on the Meta ad account (Zernio-created and ones made in Ads Manager). */
async function listAds({ fromDate, toDate } = {}) {
    const { adAccountId } = getAdsLoopConfig().zernio;
    const ads = [];
    for (let page = 1; ; page++) {
        const data = await request("get", "/v1/ads", {
            params: { page, limit: 500, source: "all", adAccountId: adAccountId || undefined, fromDate, toDate },
        });
        ads.push(...(data.ads || []));
        const pages = data.pagination?.pages || 1;
        if (page >= pages || !(data.ads || []).length) break;
    }
    // Meta only (an ads account can also hold other platforms).
    return ads.filter((ad) => ["facebook", "instagram"].includes(ad.platform));
}

const getAd = (adId) => request("get", `/v1/ads/${encodeURIComponent(adId)}`);

/** Summary + daily timeline for one ad. */
const getAdAnalytics = (adId, { fromDate, toDate }) =>
    request("get", `/v1/ads/${encodeURIComponent(adId)}/analytics`, { params: { fromDate, toDate } });

/** Create campaign + ad set + ad in one call. The caller always sends status PAUSED. */
const createAd = (body, idempotencyKey) => request("post", "/v1/ads/create", { data: body, idempotencyKey });

const setAdStatus = (adId, status) =>
    request("put", `/v1/ads/${encodeURIComponent(adId)}/status`, { data: { status } });

/** Live Meta ad set (includes learning_stage_info and daily_budget). */
async function getAdSet(adSetId) {
    const { adsAccountId } = getAdsLoopConfig().zernio;
    const data = await request("get", `/v1/ads/ad-sets/${encodeURIComponent(adSetId)}`, {
        params: { accountId: adsAccountId, fields: "id,name,status,effective_status,daily_budget,lifetime_budget,learning_stage_info" },
    });
    return data.adSet || data;
}

/** Meta location ids for targeting ("Atlanta" -> city key). */
async function searchGeo(q, geoType) {
    const { adsAccountId } = getAdsLoopConfig().zernio;
    const data = await request("get", "/v1/ads/targeting/search", {
        params: { accountId: adsAccountId, q, dimension: "geo", geoType, countryCode: "US", limit: 10 },
    });
    return data.results || [];
}

const updateAdSet = (adSetId, body) =>
    request("put", `/v1/ads/ad-sets/${encodeURIComponent(adSetId)}`, { data: { platform: "facebook", ...body } });

// ---------------------------------------------------------------------------
// Organic posts
// ---------------------------------------------------------------------------
const createPost = (body, idempotencyKey) => request("post", "/v1/posts", { data: body, idempotencyKey });

/** Single-post analytics (per platform in platformAnalytics). */
const getPostAnalytics = (postId) => request("get", "/v1/analytics", { params: { postId } });

// ---------------------------------------------------------------------------
// Accounts (setup helper)
// ---------------------------------------------------------------------------
const listAccounts = (params = {}) => request("get", "/v1/accounts", { params });

module.exports = {
    ZernioError,
    request,
    newIdempotencyKey,
    listAds,
    getAd,
    getAdAnalytics,
    createAd,
    setAdStatus,
    getAdSet,
    searchGeo,
    updateAdSet,
    createPost,
    getPostAnalytics,
    listAccounts,
};
