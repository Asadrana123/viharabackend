const test = require("node:test");
const assert = require("node:assert/strict");
const { keyNumbers, keyNumbersLine, buildShortMessage } = require("./metaAdsShortReport");
const { figuresNotInData } = require("../analytics/gaSummaryService");

const row = (date, spend, impressions, clicks, form, site) => ({
    date,
    spend,
    impressions,
    clicks,
    actions: { lead: form + site, "onsite_conversion.lead_grouped": form, "offsite_conversion.fb_pixel_lead": site },
});

const rows = [
    row("2026-11-01", 100, 2000, 100, 6, 4),
    row("2026-11-01", 100, 2000, 100, 0, 0),
    row("2026-10-31", 100, 1000, 50, 2, 0),
    row("2026-11-02", 150, 3000, 90, 3, 2),
];

test("keyNumbers: yesterday is the latest date, average is over all days, yesterday included", () => {
    const k = keyNumbers(rows);
    assert.equal(k.day, "2026-11-02");
    assert.equal(k.days, 3);
    assert.equal(k.today.spend, 150);
    assert.equal(k.today.formLeads, 3);
    assert.equal(k.today.siteLeads, 2);
    assert.equal(k.today.costPerLead, 30);
    assert.equal(k.today.ctr, 3);
    assert.equal(k.avg.spend, 150); // 450 / 3 days
    assert.equal(k.avg.formLeads, 11 / 3);
    assert.equal(k.avg.siteLeads, 2);
    assert.equal(k.avg.costPerLead, 450 / 17); // 7-day totals: 450 spend / 17 leads
    assert.equal(k.avg.ctr, 4.25); // 340 clicks / 8000 impressions
});

test("keyNumbersLine: form and website leads shown separately", () => {
    const line = keyNumbersLine(keyNumbers(rows));
    assert.match(line, /Spend \*\$150\.00\* \(avg \$150\.00\)/);
    assert.match(line, /form leads \*3\* \(avg 3\.7\)/);
    assert.match(line, /website leads \*2\* \(avg 2\.0\)/);
    assert.match(line, /cost per lead \*\$30\.00\* \(avg \$26\.47\)/);
    assert.match(line, /CTR \*3\.00%\* \(avg 4\.25%\)/);
    assert.match(line, /last 3 days, yesterday included/);
});

test("keyNumbersLine: a day with no leads and no history does not break", () => {
    const line = keyNumbersLine(keyNumbers([row("2026-11-02", 50, 0, 0, 0, 0)]));
    assert.match(line, /cost per lead \*no leads\*/);
    assert.match(line, /CTR \*n\/a\*/);
    assert.doesNotMatch(line, /avg/);
});

test("figure check: short text may only use figures from the analysis or the numbers line", () => {
    const source = "Ad A: CPL $12.40, 5 leads.\nSpend *$150.00*";
    assert.deepEqual(figuresNotInData("Ad A at $12.40 per lead, spend $150.00", source), []);
    assert.deepEqual(figuresNotInData("Scale Ad A by 20%", source), [20]);
});

test("buildShortMessage: header, numbers, text, and where the detail lives", () => {
    const msg = buildShortMessage("2026-11-02", "Spend *$1.00*", "*What worked*\n• x");
    assert.match(msg, /Meta Ads daily report, 2026-11-02/);
    assert.match(msg, /Meta Ads Manager/);
});
