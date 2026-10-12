// config/brandKitDefaults.js
//
// The starting Brand Kit: the colours, fonts and messaging every page should
// use. Admins can change these from the Brand Kit page (saved in MongoDB);
// these values are used until they do, and for any field never saved.
//
// Keep in sync with vihara-new-website/src/styles/brand.css, which holds the
// same values so pages look right before the saved kit has loaded.

// Fonts an admin may pick. The website uses Inter everywhere (loaded in
// public/index.html), so it is the only choice: one font keeps every page
// consistent. Add a font here only if the website starts loading it too.
const ALLOWED_FONTS = ["Inter"];

// key → plain-language label and where the colour is used, shown to the admin
// and given to the design agent. Order is the order shown on the page.
const COLOR_FIELDS = {
  primary: { label: "Main colour", usage: "Buttons, links, active tabs, highlights" },
  primaryHover: { label: "Main colour (hover)", usage: "Buttons and links when the mouse is over them" },
  primarySoft: { label: "Main colour (light)", usage: "Selected rows, soft highlights, badges" },
  ink: { label: "Deep navy", usage: "Dark sections, hero gradients, footer-style bands" },
  accent: { label: "Gold accent", usage: "Fine lines, small labels, ornaments — use sparingly" },
  ivory: { label: "Ivory", usage: "Warm light background for marketing pages" },
  heading: { label: "Headings", usage: "Page titles and section headings" },
  text: { label: "Body text", usage: "Normal paragraph and table text" },
  muted: { label: "Secondary text", usage: "Hints, labels, timestamps, placeholder text" },
  background: { label: "Page background", usage: "Behind cards and content" },
  surface: { label: "Cards", usage: "Cards, panels, modals, the header and sidebar" },
  border: { label: "Borders", usage: "Card edges, dividers, input outlines" },
  success: { label: "Success", usage: "Success messages, 'approved', 'won'" },
  warning: { label: "Warning", usage: "Warnings, 'pending', 'needs attention'" },
  danger: { label: "Error", usage: "Errors, 'rejected', delete buttons" },
};

const BRAND_KIT_DEFAULTS = {
  logo: {
    // The logo image is the only source of the logo — never recreated in text.
    src: "/vihara-new-logo.jpeg",
    rules:
      "Always use the logo image as-is. Never retype the logo as text, recolour it, stretch it or add effects. The red 'v' appears only in the logo, never as a page colour.",
  },
  colors: {
    primary: "#0c4bea",
    primaryHover: "#0a3cc0",
    primarySoft: "#e8eefd",
    ink: "#0b1b3f",
    accent: "#b08d57",
    ivory: "#faf8f3",
    heading: "#111827",
    text: "#374151",
    muted: "#6b7280",
    background: "#f7f8fa",
    surface: "#ffffff",
    border: "#e5e7eb",
    success: "#2e7d32",
    warning: "#b45309",
    danger: "#c62828",
  },
  fonts: {
    // Big page and section titles (same Inter as the rest of the site, set larger and bolder).
    display: "Inter",
    heading: "Inter",
    body: "Inter",
  },
  // Corner roundness in px for cards, buttons and inputs.
  radius: 8,
  messaging: {
    tagline: "AI-powered real estate auctions",
    tone:
      "Clear, confident and trustworthy. Short sentences, plain words. Speak to buyers and sellers like a knowledgeable advisor, not a salesperson.",
    wordsToUse: "transparent, streamlined, verified, smarter, simple",
    wordsToAvoid: "cheap, guaranteed, risk-free, best ever, act now",
  },
};

module.exports = { BRAND_KIT_DEFAULTS, ALLOWED_FONTS, COLOR_FIELDS };
