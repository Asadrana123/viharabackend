const test = require("node:test");
const assert = require("node:assert/strict");
const { createCache } = require("./gaDashboardCache");

test("second call within the hour is a hit, after the hour it loads again", async () => {
    let t = 0;
    let loads = 0;
    const cache = createCache({ ttlMs: 1000, now: () => t });
    const load = async () => ++loads;
    assert.deepEqual(await cache.get("a", load), { value: 1, cached: false });
    t = 999;
    assert.deepEqual(await cache.get("a", load), { value: 1, cached: true });
    t = 1000;
    assert.deepEqual(await cache.get("a", load), { value: 2, cached: false });
});

test("a different key (new end date) is a miss", async () => {
    let loads = 0;
    const cache = createCache();
    await cache.get("site:7d:2026-10-20", async () => ++loads);
    await cache.get("site:7d:2026-10-21", async () => ++loads);
    assert.equal(loads, 2);
});

test("two calls at the same moment share one load", async () => {
    let loads = 0;
    const cache = createCache();
    const slow = async () => {
        loads += 1;
        await new Promise((r) => setTimeout(r, 20));
        return "x";
    };
    const [a, b] = await Promise.all([cache.get("k", slow), cache.get("k", slow)]);
    assert.equal(loads, 1);
    assert.equal(a.value, "x");
    assert.equal(b.value, "x");
});

test("a failed load is not kept", async () => {
    const cache = createCache();
    await assert.rejects(cache.get("k", async () => { throw new Error("quota"); }), /quota/);
    assert.deepEqual(await cache.get("k", async () => "ok"), { value: "ok", cached: false });
});

test("keeps at most maxEntries, dropping the oldest", async () => {
    const cache = createCache({ maxEntries: 2 });
    for (const k of ["a", "b", "c"]) await cache.get(k, async () => k);
    assert.equal(cache.size(), 2);
    assert.equal((await cache.get("a", async () => "again")).cached, false);
});
