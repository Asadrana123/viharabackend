// scripts/sendNewDealsWelcomeTest.js
//
// Test-send the /new-deals welcome email (Brevo template 189) to YOUR inbox,
// per "New Deals page: welcome email (dev doc)" → Testing. Sends two emails:
//   1. "full"    — every buy-box line + a spotlight deal, contact by text
//   2. "minimal" — first name only, so you can check the lines hide
// Nothing is saved: no contact, no list, no database writes.
//
// Usage (from the backend folder):
//   node src/scripts/sendNewDealsWelcomeTest.js you@example.com

require("dotenv").config();
const { sendNewDealsWelcomeEmail } = require("../services/integrations/brevoService");

const to = process.argv[2];
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error("Usage: node src/scripts/sendNewDealsWelcomeTest.js you@example.com");
  process.exit(1);
}

(async () => {
  const full = await sendNewDealsWelcomeEmail({
    email: to,
    name: "Test Buyer",
    params: {
      FIRSTNAME: "Test",
      STRATEGY: "Fix & flip, Rental / hold",
      MARKETS: "Maryland, Louisiana, Baltimore",
      PRICE_RANGE: "$70K – $400K",
      CONDITION: "Light rehab",
      FINANCING: "Cash",
      CONTACT_PREF: "text",
      DEAL_MARKET: "Baltimore, MD",
      DEAL_PRICE: "$65,900",
    },
  });
  console.log("full    →", full.success ? `sent, messageId ${full.messageId}` : `FAILED: ${full.error}`);

  const minimal = await sendNewDealsWelcomeEmail({
    email: to,
    name: "Test",
    params: { FIRSTNAME: "Test" },
  });
  console.log("minimal →", minimal.success ? `sent, messageId ${minimal.messageId}` : `FAILED: ${minimal.error}`);
})();
