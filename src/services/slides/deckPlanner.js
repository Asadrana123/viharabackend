// services/slides/deckPlanner.js
//
// Claude plans the deck: the story, a visual slide type for each slide
// (slideTypes.js), the words, and the icons, as JSON (structured outputs).
// The code then checks every slide: the type's rules, that every text fits
// its box, and that the deck varies its slide types. If anything is off,
// Claude gets up to two chances to fix exactly those problems.
//
// Claude never chooses colours, fonts or positions. Those come from the design system.
const Anthropic = require("@anthropic-ai/sdk");
const { MODEL, EFFORT, SPEAKER_NOTES_CHARS, MIN_SLIDES, MAX_SLIDES } = require("../../config/slidesAgentConfig");
const { ICON_GROUPS } = require("../../config/slideIcons");
const { TYPES, TYPE_NAMES, slideProblems, describeLimits } = require("./slideTypes");

const FIX_ROUNDS = 2;

// Created on first use so a missing key fails the deck, not server startup.
let client;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set, so the Slides agent is unavailable");
  client = client || new Anthropic({ timeout: 10 * 60 * 1000, maxRetries: 2 });
  return client;
}

const str = { type: "string" };
const strList = { type: "array", items: str };
const obj = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });

// Every field of every type; unused ones are "" or []. The rest is checked in code.
const SLIDE_SCHEMA = obj({
  type: { type: "string", enum: TYPE_NAMES },
  title: str,
  subtitle: str,
  number: str,
  icon: str,
  statement: str,
  body: str,
  callout: str,
  text: str,
  unit: str,
  bullets: strList,
  items: { type: "array", items: obj({ icon: str, heading: str, text: str, value: str }) },
  left: obj({ label: str, points: strList }),
  right: obj({ label: str, points: strList }),
  speakerNotes: str,
});

const DECK_SCHEMA = obj({ deckTitle: str, slides: { type: "array", items: SLIDE_SCHEMA } });

function typeGuide() {
  return TYPE_NAMES.map((name) => {
    const t = TYPES[name];
    const parts = [];
    // Drawn text is limited by its box (Max characters below); template text by a fixed count.
    if (t.limits && !t.overlay) parts.push(Object.entries(t.limits).map(([f, n]) => `${f} ≤ ${n}`).join("; "));
    else if (t.limits) parts.push(Object.keys(t.limits).join(", "));
    if (t.bullets) parts.push(`bullets: ${t.bullets.min}-${t.bullets.max}, each ≤ ${t.bullets.chars}`);
    if (t.items) parts.push(`items: ${t.items.min}-${t.items.max}, each with ${t.items.fields.join(", ")}`);
    if (t.sides) parts.push(`left and right: label + ${t.sides.min}-${t.sides.max} points each`);
    if (t.needsIcon) parts.push("icon");
    if (t.fields) parts.push(t.fields.join(", "));
    if (!t.template) parts.push("title ≤ 42");
    const limits = describeLimits(name);
    return `- ${name}: ${t.use}\n  Fields: ${parts.join("; ")}.${limits ? `\n  Max characters: ${limits}.` : ""}`;
  }).join("\n");
}

const iconGuide = () =>
  Object.entries(ICON_GROUPS)
    .map(([group, names]) => `${group}: ${names.join(", ")}`)
    .join("\n");

function systemPrompt(kit) {
  const m = kit.messaging || {};
  return `You plan presentation decks for Vihara (${m.tagline || "AI-powered real estate auctions"}) that look designed, not typed: every slide shows its idea visually.

You choose the story, a slide type for each slide, the words and the icons. Colours, fonts, positions, logo and header are fixed by the Vihara design system.

Slide types:
${typeGuide()}

Choosing types:
- Match the shape of the content: steps → process; parallel ideas → icon_cards; a contrast → comparison; real numbers → stats or chart; dates → timeline; the one thing to remember → key_message.
- Vary the deck: never use the same type on two slides in a row, and use "bullets" at most once (only if nothing visual fits).
- First slide is cover, last is closing. Use section dividers only in decks of 8+ slides.

Icons: use only these names (exact spelling). Pick the icon that best shows each item's meaning; don't reuse one icon within a slide.
${iconGuide()}

Writing:
- Tone: ${m.tone || "Clear, confident, plain words."}
- Words to use where they fit: ${m.wordsToUse || "-"}
- Never use: ${m.wordsToAvoid || "-"}
- One message per slide. Titles state the point ("Buyers bid in real time"), not the topic ("Bidding"). No full stop at the end of a title.
- Short beats long: slide text is read in seconds. Stay inside the character limits; headings are a few words.
- Facts, numbers, names and claims come only from the admin's notes. Never invent a number, customer, quote or result. Without real numbers in the notes, don't use stats or chart.
- Bullets and points are plain text: no leading numbers, dashes or symbols.
- speakerNotes: what the presenter says on this slide, ≤ ${SPEAKER_NOTES_CHARS} chars.
- deckTitle: the file name for the deck, ≤ 80 chars.
- Leave fields a type doesn't use as "" or [].`;
}

function userPrompt({ topic, audience, notes, slideCount }) {
  return `Make a ${slideCount}-slide deck.

Topic: ${topic}
Audience: ${audience || "not given"}

Admin's notes (the only source for facts and numbers):
<notes>
${notes || "(none — keep the content general and make no specific claims)"}
</notes>`;
}

// Everything wrong with a plan, in words Claude can act on. Empty = good.
// slideCount: the exact number asked for, or null when any length 3–20 is fine (a change).
function findProblems(plan, slideCount) {
  const problems = [];
  const slides = plan.slides || [];
  if (slideCount && slides.length !== slideCount) problems.push(`The deck must have exactly ${slideCount} slides; it has ${slides.length}.`);
  if (!slideCount && (slides.length < MIN_SLIDES || slides.length > MAX_SLIDES)) problems.push(`The deck must have ${MIN_SLIDES}-${MAX_SLIDES} slides; it has ${slides.length}.`);
  if (slides[0]?.type !== "cover") problems.push("Slide 1 must be type cover.");
  if (slides[slides.length - 1]?.type !== "closing") problems.push("The last slide must be type closing.");
  if (slides.filter((s) => s.type === "bullets").length > 1) problems.push("Use bullets at most once; turn the others into a visual type.");

  slides.forEach((s, i) => {
    const at = `Slide ${i + 1} (${s.type})`;
    if (s.type === "cover" && i !== 0) problems.push(`${at}: cover is only for slide 1.`);
    if (s.type === "closing" && i !== slides.length - 1) problems.push(`${at}: closing is only for the last slide.`);
    if (i > 0 && s.type === slides[i - 1].type) problems.push(`${at}: same type as the slide before; pick a different type for one of them.`);
    if (s.type === "section" && !/^\d{2}$/.test((s.number || "").trim())) problems.push(`${at}: number must be two digits like "01".`);
    if ((s.speakerNotes || "").length > SPEAKER_NOTES_CHARS) problems.push(`${at}: speakerNotes is over ${SPEAKER_NOTES_CHARS} chars.`);
    problems.push(...slideProblems(s, at));
  });
  return problems;
}

async function ask(system, messages, usage) {
  const response = await getClient()
    .beta.messages.stream({
      model: MODEL,
      max_tokens: 48000,
      betas: ["server-side-fallback-2026-07-01"],
      // If this model declines a request, the API retries it on a fallback model.
      fallbacks: "default",
      output_config: { effort: EFFORT, format: { type: "json_schema", schema: DECK_SCHEMA } },
      cache_control: { type: "ephemeral" },
      system,
      messages,
    })
    .finalMessage();
  // Cached prompt tokens are reported separately from input_tokens.
  const u = response.usage || {};
  usage.inputTokens += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  usage.outputTokens += u.output_tokens || 0;

  if (response.stop_reason === "refusal") throw new Error("The AI declined to write this deck. Try rewording the topic or notes.");
  if (response.stop_reason === "max_tokens") throw new Error("The AI's answer was cut off. Try fewer slides or shorter notes.");
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    return { plan: JSON.parse(text), content: response.content };
  } catch {
    throw new Error("The AI did not return a valid deck plan. Please try again.");
  }
}

// Asks, checks, and gives Claude up to FIX_ROUNDS chances to fix what's wrong.
async function askUntilValid({ kit, firstMessage, slideCount, onStep = () => {} }) {
  const usage = { inputTokens: 0, outputTokens: 0 };
  const system = systemPrompt(kit);
  const messages = [{ role: "user", content: firstMessage }];

  let { plan, content } = await ask(system, messages, usage);
  let problems = findProblems(plan, slideCount);
  for (let round = 1; problems.length && round <= FIX_ROUNDS; round++) {
    onStep(`Tidying up ${problems.length} detail${problems.length === 1 ? "" : "s"}`);
    messages.push({ role: "assistant", content });
    messages.push({ role: "user", content: `Fix these problems and return the whole deck again:\n${problems.map((p) => `- ${p}`).join("\n")}` });
    ({ plan, content } = await ask(system, messages, usage));
    problems = findProblems(plan, slideCount);
  }
  if (problems.length) throw new Error(`The AI's deck still had problems after ${FIX_ROUNDS} fixes: ${problems.slice(0, 3).join(" ")}`);
  return { plan, usage };
}

/**
 * A new deck.
 * @param {{ topic: string, audience?: string, notes?: string, slideCount: number, kit: object, onStep?: (s: string) => void }} input
 * @returns {Promise<{ plan: { deckTitle: string, slides: object[] }, usage: { inputTokens: number, outputTokens: number } }>}
 */
function planDeck(input) {
  return askUntilValid({ kit: input.kit, firstMessage: userPrompt(input), slideCount: input.slideCount, onStep: input.onStep });
}

/**
 * A change to an existing deck: the admin's instruction applied to the current plan.
 * Slides the instruction doesn't touch should come back word for word, so they aren't rebuilt.
 * @param {{ deckTitle: string, slides: object[], topic: string, audience?: string, notes?: string, instruction: string, kit: object, onStep?: (s: string) => void }} input
 */
function reviseDeck(input) {
  const current = { deckTitle: input.deckTitle, slides: input.slides };
  const firstMessage = `Here is a ${input.slides.length}-slide deck you made earlier, as JSON.

Topic: ${input.topic}
Audience: ${input.audience || "not given"}

Admin's original notes (a source for facts and numbers):
<notes>
${input.notes || "(none)"}
</notes>

Current deck:
<deck>
${JSON.stringify(current)}
</deck>

The admin wants this change (facts and numbers in it may also be used):
<change>
${input.instruction}
</change>

Make that change and return the whole deck. Keep every slide the change doesn't need to touch exactly as it is, field for field and word for word (including speakerNotes), so it isn't rebuilt. The deck can get longer or shorter if the change asks for it. Keep deckTitle unless the change is about the title.`;
  return askUntilValid({ kit: input.kit, firstMessage, slideCount: null, onStep: input.onStep });
}

module.exports = { planDeck, reviseDeck, findProblems };
