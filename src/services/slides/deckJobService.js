// services/slides/deckJobService.js
//
// Makes and changes decks in the background on this server:
//   new deck: "working" → Claude plans the deck → Google Slides file is built → "ready" (with the link)
//   change:   "working" → Claude changes the plan → only the changed slides are rebuilt → "ready"
//   anything goes wrong → a new deck is "failed"; a change is marked failed and the deck stays "ready"
// The admin panel polls the deck to show progress.
const SlideDeck = require("../../model/slides/slideDeckModel");
const { planDeck, reviseDeck } = require("./deckPlanner");
const { buildVisualDeck, updateVisualDeck } = require("./deckRenderer");
const { getCurrentBrandKit } = require("../brand/brandKitService");
const { STALE_JOB_MS } = require("../../config/slidesAgentConfig");

const log = (id) => (msg) => console.log(`[slides ${id}] ${msg}`);
const setStep = (deckId) => (step) => SlideDeck.updateOne({ _id: deckId, status: "working" }, { $set: { step } }).exec();
const addUsage = (a, b) => ({ inputTokens: (a?.inputTokens || 0) + b.inputTokens, outputTokens: (a?.outputTokens || 0) + b.outputTokens });

async function runDeck(deckId) {
  const say = log(deckId);
  const step = setStep(deckId);
  const deck = await SlideDeck.findById(deckId);
  if (!deck || deck.status !== "working") return;

  try {
    await step("Writing the slides");
    const kit = await getCurrentBrandKit();
    const { plan, usage } = await planDeck({
      topic: deck.topic,
      audience: deck.audience,
      notes: deck.notes,
      slideCount: deck.slideCount,
      kit,
      onStep: step,
    });
    await SlideDeck.updateOne({ _id: deckId }, { $set: { plan: plan.slides, title: plan.deckTitle, usage } });
    say(`planned ${plan.slides.length} slides (${usage.inputTokens} in / ${usage.outputTokens} out tokens)`);

    const { presentationId, url, slideIds } = await buildVisualDeck(plan, {
      shareWith: deck.requestedByEmail,
      kitColors: kit.colors,
      onStep: step,
    });
    await SlideDeck.updateOne({ _id: deckId }, { $set: { status: "ready", step: "", presentationId, url, slideIds } });
    say(`ready: ${url}`);
  } catch (e) {
    say(`failed: ${e.message}`);
    await SlideDeck.updateOne({ _id: deckId }, { $set: { status: "failed", step: "", error: e.message || "Something went wrong" } });
  }
}

// The change the admin asked for most recently (the one being worked on).
async function runRevision(deckId) {
  const say = log(deckId);
  const step = setStep(deckId);
  const deck = await SlideDeck.findById(deckId);
  const index = (deck?.revisions?.length || 0) - 1;
  const revision = deck?.revisions?.[index];
  if (!deck || deck.status !== "working" || revision?.status !== "working") return;
  const at = (field) => `revisions.${index}.${field}`;

  try {
    await step("Reading your changes");
    const kit = await getCurrentBrandKit();
    const { plan, usage } = await reviseDeck({
      deckTitle: deck.title,
      slides: deck.plan,
      topic: deck.topic,
      audience: deck.audience,
      notes: deck.notes,
      instruction: revision.instruction,
      kit,
      onStep: step,
    });
    // Decks made before slide ids were stored used slide00, slide01…
    const oldSlideIds = deck.slideIds?.length ? deck.slideIds : deck.plan.map((_, i) => `slide${String(i).padStart(2, "0")}`);
    const { slideIds, changedSlides, removedCount } = await updateVisualDeck({
      presentationId: deck.presentationId,
      oldSlides: deck.plan,
      oldSlideIds,
      oldTitle: deck.title,
      plan,
      revision: index + 1,
      kitColors: kit.colors,
      onStep: step,
    });
    await SlideDeck.updateOne(
      { _id: deckId },
      {
        $set: {
          status: "ready",
          step: "",
          plan: plan.slides,
          title: plan.deckTitle,
          slideCount: plan.slides.length,
          slideIds,
          usage: addUsage(deck.usage, usage),
          [at("status")]: "done",
          [at("changedSlides")]: changedSlides,
          [at("removedCount")]: removedCount,
        },
      }
    );
    say(`change ${index + 1} done: rebuilt slides ${changedSlides.join(", ") || "none"}, removed ${removedCount}`);
  } catch (e) {
    say(`change ${index + 1} failed: ${e.message}`);
    // The deck itself is still fine; only this change didn't happen.
    await SlideDeck.updateOne({ _id: deckId }, { $set: { status: "ready", step: "", [at("status")]: "failed", [at("error")]: e.message || "Something went wrong" } });
  }
}

const inBackground = (fn, deckId) => setImmediate(() => fn(deckId).catch((e) => console.error(`[slides ${deckId}] crashed:`, e)));
const startDeck = (deckId) => inBackground(runDeck, deckId);
const startRevision = (deckId) => inBackground(runRevision, deckId);

// Work left "working" by a server restart will never finish; say so instead of spinning forever.
async function failStaleDecks() {
  const stale = { status: "working", updatedAt: { $lt: new Date(Date.now() - STALE_JOB_MS) } };
  const interrupted = "This was interrupted (the server restarted). Please try again.";
  // A change to a finished deck: the deck is still usable.
  await SlideDeck.updateMany(
    { ...stale, presentationId: { $ne: "" } },
    { $set: { status: "ready", step: "", "revisions.$[r].status": "failed", "revisions.$[r].error": interrupted } },
    { arrayFilters: [{ "r.status": "working" }] }
  );
  await SlideDeck.updateMany(stale, { $set: { status: "failed", step: "", error: interrupted } });
}

module.exports = { startDeck, startRevision, failStaleDecks };
