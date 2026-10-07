// scripts/sendPropertyEmailTest.js
//
// Test-send the phase 1 property sequence emails (E1, R1, R2, PT1) to YOUR
// inbox with a real property's data, per the property email spec → "Testing
// before go-live". Also sends R1 a second time as a multi-day auction (the
// close moved a day later) so you can check MULTI_DAY / AUCTION_CLOSE_TEXT.
//
// Reads the property from the database; writes nothing. No send log, no lead
// record, no blocklist check, and it works even while the sequence is off.
//
// Usage (from the backend folder):
//   node src/scripts/sendPropertyEmailTest.js you@example.com 449-georgia-st-big-bear-lake

require("dotenv").config();
const mongoose = require("mongoose");
const productModel = require("../model/property/productModel");
const { PROPERTY_EMAIL_TEMPLATES } = require("../config/propertyEmailTemplates");
const { sendTransactionalEmail } = require("../services/integrations/brevoService");
const { buildPropertyEmailParams, propertyKeyOf } = require("../services/propertyEmail/propertyEmailParams");

const [to, slug] = process.argv.slice(2);
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !slug) {
  console.error("Usage: node src/scripts/sendPropertyEmailTest.js you@example.com <property-slug>");
  process.exit(1);
}

const DAY_MS = 24 * 60 * 60 * 1000;

(async () => {
  await mongoose.connect(process.env.DB_URI);
  const property = await productModel.findOne({ slug: slug.toLowerCase() }).lean();
  if (!property) {
    console.error(`No property with slug "${slug}"`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const multiDay = property.auctionEndDate
    ? { ...property, auctionEndDate: new Date(new Date(property.auctionEndDate).getTime() + DAY_MS) }
    : null;

  const sends = [
    ["E1", property, { FIRSTNAME: "Test", QUOTE_AMOUNT: property.startBid }],
    ["R1", property, { FIRSTNAME: "Test" }],
    ["R2", property, { FIRSTNAME: "Test" }],
    ["PT1", property, { FIRSTNAME: "Test" }],
    ...(multiDay ? [["R1", multiDay, { FIRSTNAME: "Test" }, "multi-day"]] : []),
  ];

  for (const [code, prop, extra, label] of sends) {
    const params = buildPropertyEmailParams(code, prop, extra);
    const result = await sendTransactionalEmail({
      templateId: PROPERTY_EMAIL_TEMPLATES[code],
      email: to,
      name: "Test Buyer",
      params,
      tags: [`property:${propertyKeyOf(prop)}`, code, "test"],
    });
    const name = label ? `${code} (${label})` : code;
    console.log(`${name.padEnd(14)} →`, result.success ? `sent, messageId ${result.messageId}` : `FAILED: ${result.error}`);
    console.log("   params:", JSON.stringify(params));
  }

  await mongoose.disconnect();
})().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
