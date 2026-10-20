// config/slidesAgentConfig.js
//
// What the Slides agent may put on each layout of the Vihara template
// (GOOGLE_SLIDES_TEMPLATE_ID). Character limits are what fits each text box at
// the template's font sizes, so a deck never has text spilling out of a box.
// Colours, fonts, logo and header come from the template itself; tone and
// wording come from the Brand Kit (services/brand/brandKitService).

const LAYOUTS = {
  VIHARA_TITLE: {
    use: "Cover. Always the first slide, used once.",
    fields: { title: 36, subtitle: 120 },
  },
  VIHARA_SECTION: {
    use: "Divider that opens a new part of the deck. Only in decks of 8+ slides.",
    fields: { sectionNumber: 2, title: 50 },
  },
  VIHARA_CONTENT: {
    use: "A title and 2-5 short bullet points. The everyday slide.",
    fields: { title: 42 },
    bullets: { min: 2, max: 5, chars: 110 },
  },
  VIHARA_IMAGE_TEXT: {
    use: "One idea explained in a short paragraph, with a big key line (callout) in the panel on the right.",
    fields: { title: 30, body: 350, callout: 90 },
  },
  VIHARA_STATS: {
    use: "Exactly 4 numbers with labels. Only when the notes give 4 real numbers.",
    fields: { title: 42 },
    stats: { count: 4, valueChars: 4, labelChars: 30 },
  },
  VIHARA_CLOSING: {
    use: "Closing / thank-you / next step. Always the last slide, used once.",
    fields: { title: 50, subtitle: 100 },
  },
};

const LAYOUT_NAMES = Object.keys(LAYOUTS);

module.exports = {
  LAYOUTS,
  LAYOUT_NAMES,
  MIN_SLIDES: 3,
  MAX_SLIDES: 20,
  DEFAULT_SLIDES: 8,
  MAX_NOTES_CHARS: 30000,
  SPEAKER_NOTES_CHARS: 600,
  MODEL: process.env.SLIDES_AGENT_MODEL || "claude-opus-5-5",
  EFFORT: process.env.SLIDES_AGENT_EFFORT || "high",
  // A job still "working" after this long was cut off by a server restart.
  STALE_JOB_MS: 15 * 60 * 1000,
};
