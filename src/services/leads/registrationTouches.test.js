// Auction registrations keep UTM + Meta ad ids (Property Funnel, Prajwal 9 Nov 2026).
const test = require("node:test");
const assert = require("node:assert/strict");
const { touchesFrom, REGISTRATION_TOUCH_KEYS, TOUCH_KEYS } = require("./buyBox");

const NOW = new Date("2026-11-09T20:00:00Z");

test("registration touches keep the Meta ad ids; lead touches stay as they were", () => {
  const body = {
    first_touch: { utm_source: "facebook", utm_medium: "paid_social", ad_id: "120200001", adset_id: "120200002", campaign_id: "120200003", ts: "2026-11-01T10:00:00Z", junk: "x" },
    last_touch: { utm_source: "deal", utm_medium: "web", utm_content: "401-rensselaer-ave-ogdensburg", ad_id: "120200001" },
  };
  const reg = touchesFrom(body, NOW, REGISTRATION_TOUCH_KEYS);
  assert.equal(reg.firstTouch.ad_id, "120200001");
  assert.equal(reg.firstTouch.adset_id, "120200002");
  assert.equal(reg.firstTouch.campaign_id, "120200003");
  assert.equal(reg.firstTouch.ts.toISOString(), "2026-11-01T10:00:00.000Z");
  assert.equal(reg.lastTouch.utm_content, "401-rensselaer-ave-ogdensburg");
  assert.equal(reg.firstTouch.junk, undefined);
  const lead = touchesFrom(body, NOW);
  assert.equal(lead.firstTouch.ad_id, undefined);
  assert.deepEqual(Object.keys(lead.firstTouch).sort(), [...TOUCH_KEYS, "ts"].sort());
});

test("no touches sent (old app, blocked storage) → direct, as for leads", () => {
  const reg = touchesFrom({}, NOW, REGISTRATION_TOUCH_KEYS);
  assert.equal(reg.firstTouch.utm_source, "direct");
  assert.equal(reg.lastTouch.utm_source, "direct");
});
