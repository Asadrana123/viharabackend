const test = require("node:test");
const assert = require("node:assert/strict");
const { toStatus, stateCode, maskPhone, maskEmail, phoneKey, emailKey, pacificDate, pacificDayStart, toDate, slugFromUrl, channelFromLead, buyerType } = require("./pfCore");

test("listing status: archived → withdrawn, pending → upcoming (Prajwal), cancelled → ended", () => {
  assert.equal(toStatus("active", false), "live");
  assert.equal(toStatus("pending", false), "upcoming");
  assert.equal(toStatus("sold", false), "sold");
  assert.equal(toStatus("cancelled", false), "ended");
  assert.equal(toStatus("active", true), "withdrawn");
  assert.equal(toStatus("sold", true), "withdrawn");
});

test("state names become two-letter codes", () => {
  assert.equal(stateCode("Texas"), "TX");
  assert.equal(stateCode("ca"), "CA");
  assert.equal(stateCode("New York"), "NY");
});

test("phones and emails are masked, and matched in one cleaned-up form", () => {
  assert.equal(maskPhone("+1 (410) 555-2291"), "(410) •••-2291");
  assert.equal(maskEmail("Jane.Doe@Gmail.com"), "J•••@Gmail.com");
  assert.equal(phoneKey("+1 (410) 555-2291"), "4105552291");
  assert.equal(phoneKey("410.555.2291"), "4105552291");
  assert.equal(emailKey("  Jane.Doe@Gmail.COM "), "jane.doe@gmail.com");
  assert.equal(maskPhone(null), null);
  assert.equal(maskEmail("not-an-email"), null);
});

test("Pacific days, including the DST change", () => {
  assert.equal(pacificDate("2026-11-09T07:59:00Z"), "2026-11-08");
  assert.equal(pacificDate("2026-11-09T08:00:00Z"), "2026-11-09");
  assert.equal(pacificDayStart("2026-07-01").toISOString(), "2026-07-01T07:00:00.000Z"); // PDT
  assert.equal(pacificDayStart("2026-12-01").toISOString(), "2026-12-01T08:00:00.000Z"); // PST
});

test("sale dates stored as text or as dates both work", () => {
  assert.equal(toDate("2026-09-28T18:00:00.000Z").toISOString(), "2026-09-28T18:00:00.000Z");
  assert.equal(toDate(new Date("2026-11-07T19:00:00Z")).toISOString(), "2026-11-07T19:00:00.000Z");
  assert.equal(toDate(""), null);
  assert.equal(toDate("not a date"), null);
});

test("slugs, channels and buyer types", () => {
  assert.equal(slugFromUrl("https://www.vihara.ai/listing/401-rensselaer-ave-ogdensburg?register=1"), "401-rensselaer-ave-ogdensburg");
  assert.equal(slugFromUrl("/deal?property=1983-law-st-new-orleans"), "1983-law-st-new-orleans");
  assert.equal(slugFromUrl("/new-deals"), null);
  assert.equal(channelFromLead("", { utm_source: "facebook", utm_medium: "paid_social" }), "Meta ads");
  assert.equal(channelFromLead("", {}), "Direct");
  assert.equal(buyerType("Cash investor"), "Investor");
  assert.equal(buyerType("Owner-occupant"), "Owner-occupier");
  assert.equal(buyerType(""), null);
});
