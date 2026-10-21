// config/designPages.js
//
// Settings for the pages admins can redesign. The pages themselves are found
// automatically from the website's src/App.js (services/design/pageDiscovery.js);
// this file only names them nicely, groups them, and says which to skip.

// Friendlier names than the ones made from the address.
const PAGE_LABELS = {
  "/": "Home page",
  "/contact-us": "Contact Us",
  "/about-us": "About Us",
  "/faqs": "FAQs",
  "/guide": "Buyer's Guide",
  "/sell_properties": "Sell Your Property",
  "/buying_a_forclosure": "Buying a Foreclosure",
  "/buying_a_bank_owned": "Buying Bank-Owned Property",
  "/prepearing_online_auction": "Preparing for an Online Auction",
  "/event-calender": "Event Calendar",
  "/company/news": "News",
  "/Property-detail": "Property Detail",
  "/MBA": "MBA Landing Page",
  "/new-deals": "New Deals (landing page)",
  "/buyer-list": "Buyer List (landing page)",
  "/early-access": "Early Access (landing page)",
  "/auction/:slug": "Property Auction Page",
  "/auction/:slug/thank-you": "Property Auction › Thank You",
  "*": "Page Not Found (404)",
};

// Example addresses for pages whose address has a variable part (:slug, :id…),
// so the preview link opens something real.
const SAMPLE_PATHS = {
  "learn-more/:type": "/learn-more/buyers",
  "/learn-more/:type": "/learn-more/buyers",
  "/careers/:roleId": "/careers",
};

// Never offered: the admin panel itself, and the addresses new pages are served from.
const isExcludedPath = (p) => /(^|\/)admin(\/|$)/i.test(p) || p === "/p/:slug" || p === "/lp/:slug";

function groupFor(p) {
  if (p.startsWith("/p/")) return "Pages made in Design Studio";
  if (p.startsWith("/lp/")) return "Landing pages";
  if (/^\/realtor/i.test(p)) return "Realtor portal";
  if (/^\/seller/i.test(p)) return "Seller portal";
  if (/^\/(auth|login|signup|verify-otp|reset-password|set-new-password|request-send)/i.test(p)) return "Sign in & accounts";
  if (/^\/(auction\/|early-access|new-deals|buyer-list|partner|northern-california|MBA)/i.test(p)) return "Landing pages";
  if (/^\/(privacy|participation-terms|website-terms|accessibility|Disclosure)/i.test(p)) return "Legal";
  return "Website";
}

// Older requests were made from a fixed list; kept so they still work.
const LEGACY_PAGES = {
  home: { label: "Home page", path: "/", editable: ["src/components/HomePage/"] },
  contactUs: { label: "Contact Us", path: "/contact-us", editable: ["src/components/ContactUs/"] },
  aboutUs: { label: "About Us", path: "/about-us", editable: ["src/components/Company/AboutUS/"] },
  careers: { label: "Careers", path: "/careers", editable: ["src/components/Careers/"] },
  faqs: { label: "FAQs", path: "/faqs", editable: ["src/components/Resources/Faqs/"] },
  guide: { label: "Buyer's Guide", path: "/guide", editable: ["src/components/Resources/Guide/"] },
  leadership: { label: "Leadership", path: "/leadership", editable: ["src/components/LeaderShip/"] },
  sellProperties: { label: "Sell Your Property", path: "/sell_properties", editable: ["src/components/SellProperties/"] },
  newDeals: { label: "New Deals (landing page)", path: "/new-deals", editable: ["src/components/Landing/NewDealsPage.jsx", "src/components/Landing/NewDeals.css"] },
  buyerList: { label: "Buyer List (landing page)", path: "/buyer-list", editable: ["src/components/Landing/BuyerListPage.jsx", "src/components/Landing/BuyerList.css"] },
  notFound: { label: "Page Not Found (404)", path: "/this-page-does-not-exist", editable: ["src/components/NotFound/"] },
};

const NEW_PAGE = {
  key: "new",
  label: "New page",
  folder: (slug) => `src/components/Designed/${slug}/`,
  path: (slug) => `/p/${slug}`,
};

// Landing Pages tab: the designer uploads an HTML mockup for a page in the
// Landing folder (or a new one). New landing pages are standalone (no site
// header/footer) at /lp/<slug>, from src/components/Landing/pages/<slug>/.
const LANDING_ROOT = "src/components/Landing/";
const NEW_LANDING_PAGE = {
  key: "new-landing",
  label: "New landing page",
  folder: (slug) => `${LANDING_ROOT}pages/${slug}/`,
  path: (slug) => `/lp/${slug}`,
};
// A new landing page starts from the newest landing theme: the New Deals page.
const LANDING_REFERENCE = {
  page: `${LANDING_ROOT}NewDealsPage.jsx`,
  styles: [`${LANDING_ROOT}BuyerList.css`, `${LANDING_ROOT}NorthernCalifornia.css`, `${LANDING_ROOT}NewDeals.css`],
};
const isLandingFile = (file) => String(file || "").startsWith(LANDING_ROOT);

// "Spring Auction Promo!" → "spring-auction-promo"
const toSlug = (name) =>
  String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

module.exports = {
  PAGE_LABELS,
  SAMPLE_PATHS,
  isExcludedPath,
  groupFor,
  LEGACY_PAGES,
  NEW_PAGE,
  LANDING_ROOT,
  NEW_LANDING_PAGE,
  LANDING_REFERENCE,
  isLandingFile,
  toSlug,
};
