// config/slideIcons.js
//
// The icons the Slides agent may put on slides: Phosphor icons (the same set
// the website uses), in one weight (ICON_WEIGHT, "fill" by default). Claude picks names from this list only,
// so every deck has the same icon style.
//
// The SVGs live on Cloudinary under ICON_FOLDER, uploaded once by
// scripts/slides/uploadSlideIcons.js. Colour is applied in the URL, so icons
// follow the Brand Kit colours without re-uploading.
// To add an icon: add its Phosphor name (phosphoricons.com) here and re-run the script.
const cloudinary = require("cloudinary").v2;

// Solid "fill" icons read better on slides; "bold" (outline) is the other weight uploaded.
const ICON_WEIGHT = process.env.SLIDES_ICON_WEIGHT || "fill";
const folderFor = (weight) => (weight === "bold" ? "vihara-slides/icons" : `vihara-slides/icons-${weight}`);
const ICON_FOLDER = folderFor(ICON_WEIGHT);
const PHOSPHOR_VERSION = "2.1.1";

const ICON_GROUPS = {
  "Property & auctions": [
    "house", "house-line", "buildings", "building-office", "warehouse", "storefront", "key", "door-open",
    "gavel", "map-pin", "map-trifold", "globe-hemisphere-west", "tag", "sign-in", "blueprint", "hammer", "wrench", "paint-roller",
  ],
  "Money & deals": [
    "currency-dollar", "money", "wallet", "bank", "coins", "piggy-bank", "receipt", "invoice", "credit-card",
    "handshake", "hand-coins", "percent", "calculator", "scales", "trend-up", "trend-down",
  ],
  "People": [
    "user", "users", "users-three", "user-circle", "user-check", "user-plus", "identification-card",
    "address-book", "student", "briefcase", "crown", "heart", "smiley", "hand-waving",
  ],
  "AI & technology": [
    "robot", "brain", "sparkle", "magic-wand", "lightning", "cpu", "cloud", "code", "database", "plugs-connected",
    "device-mobile", "desktop", "app-window", "gear", "sliders", "cursor-click", "fingerprint", "qr-code",
  ],
  "Data & growth": [
    "chart-bar", "chart-line-up", "chart-pie-slice", "presentation-chart", "target", "rocket-launch", "trophy",
    "medal", "flag", "funnel", "gauge", "strategy", "puzzle-piece", "lightbulb", "magnifying-glass", "binoculars",
  ],
  "Communication": [
    "chat-circle", "chats", "chat-text", "envelope", "envelope-open", "phone", "phone-call", "megaphone", "bell",
    "paper-plane-tilt", "share-network", "broadcast", "video-camera", "translate",
  ],
  "Process & time": [
    "list-checks", "check-circle", "check-square", "clipboard-text", "calendar", "calendar-check", "clock",
    "timer", "hourglass", "arrows-clockwise", "path", "steps", "arrow-right", "flow-arrow", "stack", "kanban",
    "note-pencil", "file-text", "files", "folder-open", "signature", "pen-nib",
  ],
  "Trust & safety": [
    "shield-check", "lock-key", "seal-check", "certificate", "eye", "eye-slash", "warning", "warning-circle",
    "x-circle", "x", "check", "minus", "info", "question", "prohibit", "thumbs-up", "thumbs-down", "star",
  ],
  "Places & movement": ["airplane", "car", "truck", "train", "compass", "navigation-arrow", "tree", "sun", "leaf", "globe"],
};

const ICON_NAMES = Object.values(ICON_GROUPS).flat();
const ICON_SET = new Set(ICON_NAMES);

// Public PNG of an icon in one colour, for Google Slides to fetch.
function iconUrl(name, hexColor, sizePx = 256) {
  return cloudinary.url(`${ICON_FOLDER}/${name}`, {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    secure: true,
    format: "png",
    transformation: [{ width: sizePx, height: sizePx, crop: "fit" }, { effect: "colorize:100", color: hexColor.startsWith("#") ? hexColor : `#${hexColor}` }],
  });
}

module.exports = { ICON_GROUPS, ICON_NAMES, ICON_SET, ICON_FOLDER, ICON_WEIGHT, PHOSPHOR_VERSION, folderFor, iconUrl };
