// services/usage/features.js
/**
 * Every feature that spends AI credits, with the name the admin page shows and the group it sits in.
 * The key is what is stored on each spend record (AiSpend.feature). Backend keys are passed to
 * trackAnthropic / recordGemini at each call site; Creative OS keys arrive with its push.
 * A key not listed here still shows, under "Other", with the key as its name.
 */
// Eight areas at most, one colour each on the page's chart; LinkedIn sits with the other content work.
const GROUPS = {
  video: "Videos",
  reports: "Daily & weekly reports",
  creative: "Creatives, hooks, images & LinkedIn",
  admin: "Admin tools",
  leads: "Leads, calls & texts",
  site: "Website fixes (sign-up doctor, repair)",
  design: "Design (Design Studio, landing pages)",
  testing: "Testing (QA agent)",
  other: "Other",
};

// label: the plain name a non-technical reader knows it by; about: one line on what it does.
const FEATURES = {
  video: { label: "Property videos", about: "Makes each property video: the AI writes the script, then makes the voice, the video clips and Maya", group: "video" },
  "hook-scout": { label: "Daily ad headline ideas", about: "Every day the AI suggests new ad headlines in Slack", group: "reports" },
  "marcom-fetch": { label: "Reading the team's ideas", about: "The AI reads #vihara-marcom and saves the team's ideas", group: "reports" },
  "weekly-learning": { label: "Weekly learning summary", about: "Once a week the AI sums up what the team approved and rejected", group: "reports" },
  "linkedin-week": { label: "LinkedIn posts for the week", about: "The AI writes the week's five LinkedIn posts", group: "creative" },
  "linkedin-revision": { label: "LinkedIn post changes", about: "The AI rewrites a LinkedIn post when someone asks for a change", group: "creative" },
  "hook-revision": { label: "Ad headline changes", about: "The AI rewrites an ad headline when someone asks", group: "creative" },
  "creative-proposal": { label: "New ad ideas", about: "The AI suggests an ad design when someone types \"new ...\" in Slack", group: "creative" },
  "creative-revision": { label: "Ad design changes", about: "The AI changes an ad design when someone replies in Slack", group: "creative" },
  "slate-designs": { label: "Ad background pictures", about: "The AI draws the background pictures for property ads", group: "creative" },
  "image-request": { label: "Pictures asked for with /image", about: "The AI draws a picture someone asked for in Slack", group: "creative" },
  inspire: { label: "Ads from an example (/inspire)", about: "The AI makes an ad from a link or picture someone shared", group: "creative" },
  "focused-creative": { label: "Focused ads", about: "The AI makes an ad on financing, brand or numbers when a founder asks", group: "creative" },
  cast: { label: "People for videos", about: "The AI draws the people who appear in videos", group: "creative" },
  "creative-os-other": { label: "Other Slack bot work", about: "Other jobs the Slack bot did", group: "other" },
  "ga-report": { label: "Daily website report", about: "Every afternoon the AI writes the website visitors report in Slack", group: "reports" },
  "meta-ads-report": { label: "Facebook and Instagram ads report", about: "The AI writes the ads performance report in Slack", group: "reports" },
  "ads-loop": { label: "Ads loop", about: "The AI writes new ad ideas from how the ads are doing", group: "creative" },
  "admin-ask": { label: "Ask AI (admin search box)", about: "Answers questions typed into the admin search box", group: "admin" },
  "ai-search": { label: "AI property search", about: "Understands what buyers type when they search for properties", group: "admin" },
  "slides-agent": { label: "Slides maker", about: "The AI makes Google Slides decks", group: "admin" },
  "editor-interview": { label: "Video editor interviews", about: "The AI asks follow-up questions while a video editor fills in their profile", group: "video" },
  "call-grading": { label: "Call scoring", about: "The AI reads each call Maya made and scores the lead", group: "leads" },
  "comment-replies": { label: "Replies to social comments", about: "The AI drafts replies to comments on our social posts", group: "leads" },
  "vtext-replies": { label: "Text message replies", about: "The AI drafts replies to people who text us", group: "leads" },
  "vtext-knowledge": { label: "Text message lookups", about: "The AI rewrites a texted question to find the right answer", group: "leads" },
  "vtext-home-search": { label: "Text message home search", about: "The AI reads a texted question for the homes they want (price, place, beds)", group: "leads" },
  "copy-generation": { label: "Ad text writer", about: "The AI writes ad text in the Marketing Engine", group: "creative" },
  "property-description": { label: "Property descriptions", about: "The AI writes the description of a new property", group: "admin" },
  "design-studio": { label: "Design Studio", about: "The AI designs website pages when an admin asks", group: "design" },
  "landing-mockup": { label: "Landing page previews", about: "The AI checks and previews landing page designs", group: "design" },
  "conversion-agent": { label: "Sign-up doctor", about: "Every morning the AI checked why ad pages got few sign-ups. Turned off on 9 Nov 2026", group: "site" },
  "repair-agent": { label: "Website fixer", about: "The AI fixes a website problem when someone clicks Fix in Slack", group: "site" },
  "qa-agent": { label: "Website tester", about: "The AI tests the website when an admin asks", group: "testing" },
};

function describe(key) {
  const f = FEATURES[key];
  const group = f?.group || "other";
  return { key, label: f?.label || key, about: f?.about || "", group, groupLabel: GROUPS[group] };
}

module.exports = { FEATURES, GROUPS, describe };
