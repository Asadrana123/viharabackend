// config/designPages.js
//
// The pages admins may ask the design agent to change, and the files the agent
// is allowed to edit for each. The agent can READ any file under src/ (to see
// shared components and the Brand Kit) but can only WRITE the files listed for
// the chosen page — everything else on the site stays untouched.
//
//   path     — where the page lives on the site (used for the preview link)
//   editable — files, or folders ending in "/", the agent may change
//
// "New page" is not listed here: new pages are created under
// src/components/Designed/<slug>/ and served at /p/<slug> (see NEW_PAGE).

const DESIGN_PAGES = {
  home: {
    label: "Home page",
    path: "/",
    editable: ["src/components/HomePage/"],
  },
  contactUs: {
    label: "Contact Us",
    path: "/contact-us",
    editable: ["src/components/ContactUs/"],
  },
  aboutUs: {
    label: "About Us",
    path: "/about-us",
    editable: ["src/components/Company/AboutUS/"],
  },
  careers: {
    label: "Careers",
    path: "/careers",
    editable: ["src/components/Careers/"],
  },
  faqs: {
    label: "FAQs",
    path: "/faqs",
    editable: ["src/components/Resources/Faqs/"],
  },
  guide: {
    label: "Buyer's Guide",
    path: "/guide",
    editable: ["src/components/Resources/Guide/"],
  },
  leadership: {
    label: "Leadership",
    path: "/leadership",
    editable: ["src/components/LeaderShip/"],
  },
  sellProperties: {
    label: "Sell Your Property",
    path: "/sell_properties",
    editable: ["src/components/SellProperties/"],
  },
  newDeals: {
    label: "New Deals (landing page)",
    path: "/new-deals",
    editable: ["src/components/Landing/NewDealsPage.jsx", "src/components/Landing/NewDeals.css"],
  },
  buyerList: {
    label: "Buyer List (landing page)",
    path: "/buyer-list",
    editable: ["src/components/Landing/BuyerListPage.jsx", "src/components/Landing/BuyerList.css"],
  },
  notFound: {
    label: "Page Not Found (404)",
    path: "/this-page-does-not-exist",
    editable: ["src/components/NotFound/"],
  },
};

const NEW_PAGE = {
  key: "new",
  label: "New page",
  folder: (slug) => `src/components/Designed/${slug}/`,
  path: (slug) => `/p/${slug}`,
};

// "Spring Auction Promo!" → "spring-auction-promo"
const toSlug = (name) =>
  String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

module.exports = { DESIGN_PAGES, NEW_PAGE, toSlug };
