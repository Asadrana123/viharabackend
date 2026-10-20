// services/slides/deckPlanner.js
//
// Claude writes the deck: which layout each slide uses and the words on it,
// as JSON (structured outputs). The code then checks every slide against the
// layout's limits (config/slidesAgentConfig); if anything is off, Claude gets
// one chance to fix exactly those problems.
//
// Claude never chooses colours, fonts or positions. Those come from the template.
const Anthropic = require("@anthropic-ai/sdk");
const { LAYOUTS, LAYOUT_NAMES, MODEL, EFFORT, SPEAKER_NOTES_CHARS } = require("../../config/slidesAgentConfig");

// Created on first use so a missing key fails the deck, not server startup.
let client;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set, so the Slides agent is unavailable");
  client = client || new Anthropic({ timeout: 10 * 60 * 1000, maxRetries: 2 });
  return client;
}

// Every field on every slide; unused ones are "" or []. Lengths are checked in code.
const SLIDE_SCHEMA = {
  type: "object",
  properties: {
    layout: { type: "string", enum: LAYOUT_NAMES },
    title: { type: "string" },
    subtitle: { type: "string" },
    sectionNumber: { type: "string" },
    bullets: { type: "array", items: { type: "string" } },
    body: { type: "string" },
    callout: { type: "string" },
    stats: {
      type: "array",
      items: {
        type: "object",
        properties: { value: { type: "string" }, label: { type: "string" } },
        required: ["value", "label"],
        additionalProperties: false,
      },
    },
    speakerNotes: { type: "string" },
  },
  required: ["layout", "title", "subtitle", "sectionNumber", "bullets", "body", "callout", "stats", "speakerNotes"],
  additionalProperties: false,
};

const DECK_SCHEMA = {
  type: "object",
  properties: {
    deckTitle: { type: "string" },
    slides: { type: "array", items: SLIDE_SCHEMA },
  },
  required: ["deckTitle", "slides"],
  additionalProperties: false,
};

function layoutGuide() {
  return Object.entries(LAYOUTS)
    .map(([name, l]) => {
      const limits = Object.entries(l.fields).map(([f, n]) => `${f} ≤ ${n} chars`);
      if (l.bullets) limits.push(`bullets: ${l.bullets.min}-${l.bullets.max} items, each ≤ ${l.bullets.chars} chars`);
      if (l.stats) limits.push(`stats: exactly ${l.stats.count}, value ≤ ${l.stats.valueChars} chars, label ≤ ${l.stats.labelChars} chars`);
      return `- ${name}: ${l.use}\n  Fields: ${limits.join("; ")}. Leave every other field empty.`;
    })
    .join("\n");
}

function systemPrompt(kit) {
  const m = kit.messaging || {};
  return `You write presentation decks for Vihara (${m.tagline || "AI-powered real estate auctions"}).

You decide the story and the words. The deck's design (colours, fonts, logo, header, page numbers) is fixed by the Vihara template, so you only pick a layout per slide and fill its fields.

Layouts:
${layoutGuide()}

Writing:
- Tone: ${m.tone || "Clear, confident, plain words."}
- Words to use where they fit: ${m.wordsToUse || "-"}
- Never use: ${m.wordsToAvoid || "-"}
- One message per slide. Titles say the point ("Buyers wait 6 weeks for a bid"), not the topic ("Timeline"). No full stop at the end of a title.
- Facts, numbers, names and claims come only from the admin's notes. Never make up a number, customer, quote or result. If the notes don't have 4 real numbers, don't use VIHARA_STATS.
- Bullets are plain text: no leading numbers, dashes or symbols (the slide adds bullet marks).
- sectionNumber is two digits ("01", "02") and counts the sections in order.
- speakerNotes: what the presenter says on this slide, ≤ ${SPEAKER_NOTES_CHARS} chars.
- deckTitle: the file name for the deck, ≤ 80 chars.`;
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
function findProblems(plan, slideCount) {
  const problems = [];
  const slides = plan.slides || [];
  if (slides.length !== slideCount) problems.push(`The deck must have exactly ${slideCount} slides; it has ${slides.length}.`);
  if (slides[0]?.layout !== "VIHARA_TITLE") problems.push("Slide 1 must use VIHARA_TITLE.");
  if (slides[slides.length - 1]?.layout !== "VIHARA_CLOSING") problems.push("The last slide must use VIHARA_CLOSING.");

  slides.forEach((s, i) => {
    const at = `Slide ${i + 1} (${s.layout})`;
    const l = LAYOUTS[s.layout];
    if (!l) return problems.push(`${at}: unknown layout.`);
    if (s.layout === "VIHARA_TITLE" && i !== 0) problems.push(`${at}: VIHARA_TITLE is only for slide 1.`);
    if (s.layout === "VIHARA_CLOSING" && i !== slides.length - 1) problems.push(`${at}: VIHARA_CLOSING is only for the last slide.`);

    for (const [field, max] of Object.entries(l.fields)) {
      const v = (s[field] || "").trim();
      if (!v) problems.push(`${at}: ${field} is empty.`);
      else if (v.length > max) problems.push(`${at}: ${field} is ${v.length} chars, max ${max}: "${v}"`);
    }
    if (l.bullets) {
      const b = s.bullets || [];
      if (b.length < l.bullets.min || b.length > l.bullets.max) problems.push(`${at}: needs ${l.bullets.min}-${l.bullets.max} bullets, has ${b.length}.`);
      b.forEach((t, j) => {
        if (!t.trim()) problems.push(`${at}: bullet ${j + 1} is empty.`);
        else if (/^\s*(\d+[.)]|[-•*–])\s/.test(t)) problems.push(`${at}: bullet ${j + 1} starts with a number or symbol; the slide adds bullet marks itself: "${t}"`);
        else if (t.length > l.bullets.chars) problems.push(`${at}: bullet ${j + 1} is ${t.length} chars, max ${l.bullets.chars}: "${t}"`);
      });
    }
    if (l.stats) {
      const st = s.stats || [];
      if (st.length !== l.stats.count) problems.push(`${at}: needs exactly ${l.stats.count} stats, has ${st.length}. If the notes don't have that many real numbers, use another layout.`);
      st.forEach((x, j) => {
        if (!x.value.trim() || x.value.length > l.stats.valueChars) problems.push(`${at}: stat ${j + 1} value must be 1-${l.stats.valueChars} chars: "${x.value}"`);
        if (!x.label.trim() || x.label.length > l.stats.labelChars) problems.push(`${at}: stat ${j + 1} label must be 1-${l.stats.labelChars} chars: "${x.label}"`);
      });
    }
    if (s.layout === "VIHARA_SECTION" && !/^\d{2}$/.test((s.sectionNumber || "").trim())) problems.push(`${at}: sectionNumber must be two digits like "01".`);
    if ((s.speakerNotes || "").length > SPEAKER_NOTES_CHARS) problems.push(`${at}: speakerNotes is over ${SPEAKER_NOTES_CHARS} chars.`);
  });
  return problems;
}

async function ask(system, messages, usage) {
  const response = await getClient()
    .beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      // If this model declines a request, the API retries it on a fallback model.
      fallbacks: "default",
      output_config: { effort: EFFORT, format: { type: "json_schema", schema: DECK_SCHEMA } },
      system,
      messages,
    })
    .finalMessage();
  usage.inputTokens += response.usage?.input_tokens || 0;
  usage.outputTokens += response.usage?.output_tokens || 0;

  if (response.stop_reason === "refusal") throw new Error("The AI declined to write this deck. Try rewording the topic or notes.");
  if (response.stop_reason === "max_tokens") throw new Error("The AI's answer was cut off. Try fewer slides or shorter notes.");
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    return { plan: JSON.parse(text), content: response.content };
  } catch {
    throw new Error("The AI did not return a valid deck plan. Please try again.");
  }
}

/**
 * @param {{ topic: string, audience?: string, notes?: string, slideCount: number, kit: object }} input
 * @returns {Promise<{ plan: { deckTitle: string, slides: object[] }, usage: { inputTokens: number, outputTokens: number } }>}
 */
async function planDeck(input) {
  const usage = { inputTokens: 0, outputTokens: 0 };
  const system = systemPrompt(input.kit);
  const messages = [{ role: "user", content: userPrompt(input) }];

  let { plan, content } = await ask(system, messages, usage);
  let problems = findProblems(plan, input.slideCount);
  if (problems.length) {
    messages.push({ role: "assistant", content });
    messages.push({ role: "user", content: `Fix these problems and return the whole deck again:\n${problems.map((p) => `- ${p}`).join("\n")}` });
    ({ plan } = await ask(system, messages, usage));
    problems = findProblems(plan, input.slideCount);
    if (problems.length) throw new Error(`The AI's deck still had problems after one fix: ${problems.slice(0, 3).join(" ")}`);
  }
  return { plan, usage };
}

module.exports = { planDeck, findProblems };
