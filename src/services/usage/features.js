// services/usage/features.js
/**
 * Every feature that spends AI credits, with the name the admin page shows and the group it sits in.
 * The key is what is stored on each spend record (AiSpend.feature). Backend keys are passed to
 * trackAnthropic / recordGemini at each call site; Creative OS keys arrive with its push.
 * A key not listed here still shows, under "Other", with the key as its name.
 */
const GROUPS = {
  video: "Videos",
  reports: "Daily & weekly reports",
  creative: "Creatives, hooks & images",
  linkedin: "LinkedIn",
  admin: "Admin tools",
  leads: "Leads, calls & texts",
  site: "Site, design & testing",
  other: "Other",
};

const FEATURES = {
  // ---- Creative OS (pushed from the server) ----
  video: { label: "Videos (Studio and Slack)", group: "video" },
  "hook-scout": { label: "Hook scout (daily, Slack)", group: "reports" },
  "marcom-fetch": { label: "Team channel fetch (#vihara-marcom)", group: "reports" },
  "weekly-learning": { label: "Weekly learning (Slack)", group: "reports" },
  "linkedin-week": { label: "LinkedIn weekly posts", group: "linkedin" },
  "linkedin-revision": { label: "LinkedIn post revisions", group: "linkedin" },
  "hook-revision": { label: "Hook revisions", group: "creative" },
  "creative-proposal": { label: "New creative proposals", group: "creative" },
  "creative-revision": { label: "Creative revisions", group: "creative" },
  "slate-designs": { label: "Slate designs (generated backgrounds)", group: "creative" },
  "image-request": { label: "/image requests", group: "creative" },
  inspire: { label: "/inspire", group: "creative" },
  "focused-creative": { label: "Focused creatives", group: "creative" },
  cast: { label: "Cast pictures", group: "creative" },
  "creative-os-other": { label: "Other Creative OS work", group: "other" },

  // ---- This backend ----
  "ga-report": { label: "Website analytics report (daily, Slack)", group: "reports" },
  "meta-ads-report": { label: "Meta ads report (Slack)", group: "reports" },
  "ads-loop": { label: "Ads loop", group: "creative" },
  "admin-ask": { label: "Ask AI (admin search)", group: "admin" },
  "ai-search": { label: "AI property search", group: "admin" },
  "slides-agent": { label: "Slides agent", group: "admin" },
  "editor-interview": { label: "Editor interviews (Studio)", group: "video" },
  "call-grading": { label: "Call grading", group: "leads" },
  "comment-replies": { label: "Social comment replies", group: "leads" },
  "vtext-replies": { label: "Vtext AI replies", group: "leads" },
  "vtext-knowledge": { label: "Vtext knowledge", group: "leads" },
  "copy-generation": { label: "Marketing engine copy", group: "creative" },
  "property-description": { label: "Property descriptions", group: "admin" },
  "design-studio": { label: "Design Studio", group: "site" },
  "landing-mockup": { label: "Landing page mockups", group: "site" },
  "conversion-agent": { label: "Conversion agent", group: "site" },
  "repair-agent": { label: "Repair agent", group: "site" },
  "qa-agent": { label: "QA agent", group: "site" },
};

function describe(key) {
  const f = FEATURES[key];
  const group = f?.group || "other";
  return { key, label: f?.label || key, group, groupLabel: GROUPS[group] };
}

module.exports = { FEATURES, GROUPS, describe };
