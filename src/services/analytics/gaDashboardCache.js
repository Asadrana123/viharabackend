// services/analytics/gaDashboardCache.js
//
// Small in-memory cache for the admin analytics endpoints. Keys carry the range's end date,
// so a new day (India time) starts with a clean slate. Each server instance has its own cache.
//
// - Entries last one hour, because GA4 can still adjust yesterday's numbers for a few hours.
// - Two requests for the same key at the same moment share one GA call.
// - A failed call is never kept.

const ONE_HOUR_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 100;

function createCache({ ttlMs = ONE_HOUR_MS, maxEntries = MAX_ENTRIES, now = Date.now } = {}) {
    const done = new Map(); // key -> { value, at }
    const running = new Map(); // key -> Promise

    /** @returns {Promise<{value: any, cached: boolean}>} */
    async function get(key, load) {
        const hit = done.get(key);
        if (hit && now() - hit.at < ttlMs) return { value: hit.value, cached: true };
        if (running.has(key)) return { value: await running.get(key), cached: false };

        const promise = (async () => load())();
        running.set(key, promise);
        try {
            const value = await promise;
            done.delete(key);
            done.set(key, { value, at: now() });
            // Maps keep insertion order, so the first key is the oldest.
            while (done.size > maxEntries) done.delete(done.keys().next().value);
            return { value, cached: false };
        } finally {
            running.delete(key);
        }
    }

    return { get, size: () => done.size };
}

module.exports = { createCache, shared: createCache() };
