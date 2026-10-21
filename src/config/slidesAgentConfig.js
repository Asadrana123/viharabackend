// config/slidesAgentConfig.js
//
// Settings for the Slides agent. The slide types it can use live in
// services/slides/slideTypes.js and the design system in slideDesign.js.

module.exports = {
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
