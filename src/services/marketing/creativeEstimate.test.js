const test = require("node:test");
const assert = require("node:assert/strict");
const m = require("./creativeEstimateModel");
const svc = require("./creativeEstimateService");
const review = require("./creativeReviewService");

/** A Zernio ad (GET /v1/ads) with the fields the model reads. */
const zAd = ({ id, created, type = "image", goal = "LEAD_GENERATION", spend, impressions, clicks, leads, views = 0 }) => ({
    platformAdId: id,
    name: `ad ${id}`,
    campaignName: "camp",
    platformCreatedAt: created,
    creativeType: type,
    optimizationGoal: goal,
    creative: { thumbnailUrl: null },
    metrics: { spend, impressions, clicks: clicks * 3, actions: { link_click: clicks, lead: leads, video_view: views } },
});

const day = (i) => new Date(Date.UTC(2026, 3, 1 + i * 3)).toISOString();

test("an ad is read as format, lead place, spend, link clicks, Meta leads and 3-second views", () => {
    const r = m.adRow(zAd({ id: "1", created: day(0), type: "video", goal: "OFFSITE_CONVERSIONS", spend: 100, impressions: 2000, clicks: 40, leads: 3, views: 700 }), { buyerType: "fix_and_flip" });
    assert.equal(r.format, "video");
    assert.equal(r.leadPlace, "website");
    assert.equal(r.clicks, 40);
    assert.equal(r.leads, 3);
    assert.equal(r.views3s, 700);
    assert.equal(r.buyerType, "fix_and_flip");
    assert.equal(m.leadPlaceOf({ optimizationGoal: "LEAD_GENERATION" }), "meta_form");
    assert.equal(m.leadPlaceOf({ optimizationGoal: "QUALITY_LEAD" }), "meta_form");
    assert.equal(m.leadPlaceOf({}), null);
    assert.equal(m.formatOf({ creative: { objectType: "VIDEO" } }), "video");
    assert.equal(m.formatOf({ creativeType: "carousel" }), "carousel");
});

test("ads with too little data are left out", () => {
    assert.equal(m.usable(m.adRow(zAd({ id: "1", created: day(0), spend: 100, impressions: 400, clicks: 5, leads: 0 }))), false);
    assert.equal(m.usable(m.adRow(zAd({ id: "1", created: day(0), spend: 5, impressions: 4000, clicks: 5, leads: 0 }))), false);
    assert.equal(m.usable(m.adRow(zAd({ id: "1", created: day(0), spend: 50, impressions: 4000, clicks: 5, leads: 0 }))), true);
});

test("a close past ad weighs more than a different one", () => {
    const target = { format: "video", leadPlace: "meta_form", buyerType: "fix_and_flip" };
    const same = { format: "video", leadPlace: "meta_form", buyerType: "fix_and_flip", createdAt: null };
    const other = { format: "image", leadPlace: "website", buyerType: "homeowner", createdAt: null };
    assert.ok(m.similarity(same, target) > 10 * m.similarity(other, target));
    // Older ads count less.
    const now = Date.parse("2026-11-18T00:00:00Z");
    const fresh = { ...same, createdAt: "2026-11-01T00:00:00Z" };
    const old = { ...same, createdAt: "2026-05-01T00:00:00Z" };
    assert.ok(m.similarity(fresh, target, now) > m.similarity(old, target, now));
});

test("weighted percentile follows the weights", () => {
    const items = [
        { value: 1, weight: 1 },
        { value: 10, weight: 1 },
    ];
    assert.equal(m.weightedPercentile(items, 0.5), 5.5);
    assert.equal(m.weightedPercentile([{ value: 3, weight: 2 }], 0.9), 3);
    assert.equal(m.weightedPercentile([], 0.5), null);
    // A heavy item pulls the middle to itself.
    assert.equal(m.weightedPercentile([{ value: 1, weight: 9 }, { value: 10, weight: 1 }], 0.4), 1);
});

/** Videos buy fewer impressions per dollar and more clicks than images, in this made-up history. */
function history() {
    const rows = [];
    for (let i = 0; i < 40; i++) {
        const video = i % 2 === 0;
        rows.push(
            m.adRow(
                zAd({
                    id: String(i),
                    created: day(i),
                    type: video ? "video" : "image",
                    spend: 100,
                    impressions: video ? 1000 + (i % 5) * 50 : 3000 + (i % 5) * 100,
                    clicks: video ? 40 : 30,
                    leads: i % 3,
                    views: video ? 350 : 0,
                })
            )
        );
    }
    return rows;
}

test("the guess follows the close ads: a video gets video-like impressions per dollar", () => {
    const rows = history();
    const now = Date.parse(day(41));
    const video = m.estimateFrom(rows, { format: "video", leadPlace: "meta_form" }, { now });
    const image = m.estimateFrom(rows, { format: "image", leadPlace: "meta_form" }, { now });
    assert.ok(video.perDollar.impressions < image.perDollar.impressions);
    assert.ok(video.clickRate.expected > image.clickRate.expected);
    assert.ok(video.hookRate.expected > 0.3 && video.hookRate.expected < 0.4);
    assert.equal(image.hookRate, null);
    assert.equal(video.basis.closeAds, 20);
    for (const k of ["impressions", "clicks", "leads"]) {
        assert.ok(video.range[k].low <= video.perDollar[k] && video.perDollar[k] <= video.range[k].high, k);
    }
});

test("the backtest guesses each ad only from ads made before it", () => {
    const rows = history();
    const t = m.backtest(rows);
    // 40 ads, the first 15 are history only, then 20 more are needed to calibrate.
    assert.equal(t.summary.ads, 5);
    assert.ok(t.calibration);
    for (const k of ["impressions", "clicks", "leads"]) {
        assert.ok(t.calibration[k].low <= t.calibration[k].mid && t.calibration[k].mid <= t.calibration[k].high);
    }
    // A made-up future ad changes nothing about the earlier guesses.
    const more = m.backtest([...rows, m.adRow(zAd({ id: "x", created: day(60), spend: 100, impressions: 99999, clicks: 1, leads: 0 }))]);
    assert.deepEqual(more.ads.slice(0, 5).map((a) => a.impressions.predicted), t.ads.map((a) => a.impressions.predicted));
});

test("an estimate scales with the budget and says when it is thin or the budget is big", () => {
    const rows = history();
    const t = m.backtest(rows);
    const now = Date.parse(day(41));
    const small = m.buildEstimate(rows, { format: "video", leadPlace: "meta_form" }, { dailyBudget: 10, days: 5 }, t, { now });
    const double = m.buildEstimate(rows, { format: "video", leadPlace: "meta_form" }, { dailyBudget: 20, days: 5 }, t, { now });
    assert.equal(small.available, true);
    assert.equal(small.plan.spend, 50);
    assert.ok(Math.abs(double.numbers.impressions.expected - 2 * small.numbers.impressions.expected) <= 1);
    assert.equal(small.calibrated, true);
    assert.deepEqual(small.warnings, []);

    const carousel = m.buildEstimate(rows, { format: "carousel", leadPlace: "meta_form" }, { dailyBudget: 1000, days: 30 }, t, { now });
    assert.equal(carousel.warnings.length, 2);
    assert.match(carousel.warnings[0], /No past carousel ads/);
    assert.match(carousel.warnings[1], /more than any single past ad/);

    assert.equal(m.buildEstimate([], { format: "video", leadPlace: "website" }, { dailyBudget: 10, days: 1 }).available, false);
});

test("files make the format: one video, one image, or a carousel of images", () => {
    const f = (mimeType) => ({ mimeType });
    assert.equal(svc.formatOfFiles([f("video/mp4")]), "video");
    assert.equal(svc.formatOfFiles([f("image/png")]), "image");
    assert.equal(svc.formatOfFiles([f("image/png"), f("image/jpeg")]), "carousel");
    assert.throws(() => svc.formatOfFiles([]), /Add the video/);
    assert.throws(() => svc.formatOfFiles([f("video/mp4"), f("video/mp4")]), /one video at a time/);
    assert.throws(() => svc.formatOfFiles([f("video/mp4"), f("image/png")]), /not both/);
    assert.throws(() => svc.formatOfFiles([f("application/pdf")]), /Use .mp4/);
    assert.throws(() => svc.formatOfFiles(Array.from({ length: 11 }, () => f("image/png"))), /at most 10/);
});

test("the page's input is checked", () => {
    const ok = { leadPlace: "meta_form", buyerType: "fix_and_flip", dailyBudget: "50", days: "7", adText: " hi ", title: "LH960" };
    assert.deepEqual(svc.cleanInput(ok), { leadPlace: "meta_form", buyerType: "fix_and_flip", dailyBudget: 50, days: 7, adText: "hi", title: "LH960" });
    assert.equal(svc.cleanInput({ ...ok, buyerType: "" }).buyerType, null);
    assert.throws(() => svc.cleanInput({ ...ok, leadPlace: "x" }), /where people fill in the form/);
    assert.throws(() => svc.cleanInput({ ...ok, buyerType: "alien" }), /buyer types/);
    assert.throws(() => svc.cleanInput({ ...ok, dailyBudget: "0" }), /Daily budget/);
    assert.throws(() => svc.cleanInput({ ...ok, days: "2.5" }), /whole number/);
    assert.throws(() => svc.cleanInput({ ...ok, adText: "x".repeat(2001) }), /ad text/);
});

test("guess vs real compares at the ad's real spend", () => {
    const record = {
        estimate: {
            plan: { spend: 100 },
            numbers: { impressions: { expected: 1000, low: 600, high: 1500 }, clicks: { expected: 30, low: 20, high: 45 }, leads: { expected: 2, low: 0, high: 5 } },
        },
    };
    const r = svc.guessVsReal(record, { spend: 200, impressions: 2500, clicks: 100, leads: 3 });
    assert.deepEqual(r.impressions, { guess: 2000, low: 1200, high: 3000, real: 2500, inRange: true });
    assert.equal(r.clicks.inRange, false);
    assert.equal(r.leads.guess, 4);
    assert.equal(svc.guessVsReal(record, null), null);
});

test("the AI's tags and checks are kept to our lists", () => {
    assert.deepEqual(review.cleanTag({ adId: 5, buyerType: "fix_and_flip", state: "tx" }), { adId: "5", buyerType: "fix_and_flip", state: "TX" });
    assert.deepEqual(review.cleanTag({ adId: "5", buyerType: "aliens", state: "Texas" }), { adId: "5", buyerType: null, state: null });

    const r = review.cleanReview("video", { summary: "Good.", checks: [{ id: "hook_fast", status: "good", note: "Price at 1s." }, { id: "made_up", status: "good" }, { id: "sound_off", status: "maybe" }], hookSecond: "1.2", lengthSeconds: 28 });
    assert.deepEqual(r.checks.map((c) => c.id), review.CHECKS.video.map((c) => c.id));
    assert.equal(r.checks[0].status, "good");
    assert.equal(r.checks[1].status, "unsure");
    assert.equal(r.hookSecond, 1.2);
    assert.equal(review.cleanReview("image", { hookSecond: 3 }).hookSecond, null);
});
