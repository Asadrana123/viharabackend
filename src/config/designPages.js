// config/designPages.js
//
// Settings for the pages admins can redesign. The website is the Next.js app
// (vihara-next); its pages are found automatically from the app/ folder's
// page.tsx files (services/design/pageDiscovery.js). This file only names them
// nicely, groups them, says which to skip, and where new pages go.

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

// Older requests were made from a fixed list (in the old CRA site); kept so
// they still open — now pointing at the same pages' folders in the Next.js app.
const LEGACY_PAGES = {
  home: { label: "Home page", path: "/", editable: ["components/home/"] },
  contactUs: { label: "Contact Us", path: "/contact-us", editable: ["components/contact-us/"] },
  aboutUs: { label: "About Us", path: "/about-us", editable: ["components/about/"] },
  careers: { label: "Careers", path: "/careers", editable: ["components/careers/"] },
  faqs: { label: "FAQs", path: "/faqs", editable: ["components/resources/"] },
  guide: { label: "Buyer's Guide", path: "/guide", editable: ["components/resources/"] },
  leadership: { label: "Leadership", path: "/leadership", editable: ["components/leadership/"] },
  sellProperties: { label: "Sell Your Property", path: "/sell_properties", editable: ["components/sell-properties/"] },
  newDeals: { label: "New Deals (landing page)", path: "/new-deals", editable: ["components/new-deals/NewDealsPage.tsx", "components/new-deals/NewDeals.css"] },
  buyerList: { label: "Buyer List (landing page)", path: "/buyer-list", editable: ["components/buyer-list/BuyerListPage.tsx"] },
  notFound: { label: "Page Not Found (404)", path: "/this-page-does-not-exist", editable: [] },
};

// A new page made in Design Studio: its component in components/designed/<slug>/
// and a route file (made automatically) under the marketing layout, so the site
// header and footer wrap it, at /p/<slug>.
const NEW_PAGE = {
  key: "new",
  label: "New page",
  folder: (slug) => `components/designed/${slug}/`,
  entry: (slug) => `components/designed/${slug}/index.tsx`,
  route: (slug) => `app/(marketing)/p/${slug}/page.tsx`,
  path: (slug) => `/p/${slug}`,
};

// Landing Pages tab: the designer uploads an HTML mockup for a landing page (or
// a new one). Landing pages are standalone (no site header/footer). New ones
// live in components/landing/pages/<slug>/ with a route file at app/lp/<slug>/.
// These folders hold the landing pages and their theme (their stylesheets).
const LANDING_DIRS = [
  "components/landing/",
  "components/new-deals/",
  "components/buyer-list/",
  "components/northern-california/",
  "components/partner/",
  "components/property-auction/",
];
const NEW_LANDING_PAGE = {
  key: "new-landing",
  label: "New landing page",
  folder: (slug) => `components/landing/pages/${slug}/`,
  entry: (slug) => `components/landing/pages/${slug}/index.tsx`,
  route: (slug) => `app/lp/${slug}/page.tsx`,
  path: (slug) => `/lp/${slug}`,
};
// A new landing page starts from the newest landing theme: the New Deals page.
const LANDING_REFERENCE = {
  page: "components/new-deals/NewDealsPage.tsx",
  styles: ["components/landing/shared/BuyerList.css", "components/northern-california/NorthernCalifornia.css", "components/new-deals/NewDeals.css"],
};
const isLandingFile = (file) => LANDING_DIRS.some((d) => String(file || "").startsWith(d));

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
  LANDING_DIRS,
  NEW_LANDING_PAGE,
  LANDING_REFERENCE,
  isLandingFile,
  toSlug,
};
