// services/slides/deckJobService.js
//
// Makes one deck in the background on this server:
//   "working" → Claude plans the deck → Google Slides file is built → "ready" (with the link)
//   anything goes wrong → "failed" (with a plain-language reason)
// The admin panel polls the deck to show progress.
const SlideDeck = require("../../model/slides/slideDeckModel");
const { planDeck } = require("./deckPlanner");
const { buildDeck } = require("./slidesBuilder");
const { getCurrentBrandKit } = require("../brand/brandKitService");
const { STALE_JOB_MS } = require("../../config/slidesAgentConfig");

const log = (id) => (msg) => console.log(`[slides ${id}] ${msg}`);

async function runDeck(deckId) {
  const say = log(deckId);
  const deck = await SlideDeck.findById(deckId);
  if (!deck || deck.status !== "working") return;
  const setStep = (step) => SlideDeck.updateOne({ _id: deckId, status: "working" }, { $set: { step } }).exec();

  try {
    await setStep("Writing the slides");
    const kit = await getCurrentBrandKit();
    const { plan, usage } = await planDeck({
      topic: deck.topic,
      audience: deck.audience,
      notes: deck.notes,
      slideCount: deck.slideCount,
      kit,
    });
    await SlideDeck.updateOne({ _id: deckId }, { $set: { plan: plan.slides, title: plan.deckTitle, usage } });
    say(`planned ${plan.slides.length} slides (${usage.inputTokens} in / ${usage.outputTokens} out tokens)`);

    const { presentationId, url } = await buildDeck(plan, {
      shareWith: deck.requestedByEmail,
      primaryColor: kit.colors?.primary,
      onStep: (s) => setStep(s),
    });
    await SlideDeck.updateOne({ _id: deckId }, { $set: { status: "ready", step: "", presentationId, url } });
    say(`ready: ${url}`);
  } catch (e) {
    say(`failed: ${e.message}`);
    await SlideDeck.updateOne({ _id: deckId }, { $set: { status: "failed", step: "", error: e.message || "Something went wrong" } });
  }
}

function startDeck(deckId) {
  setImmediate(() => runDeck(deckId).catch((e) => console.error(`[slides ${deckId}] crashed:`, e)));
}

// A deck left "working" by a server restart will never finish; say so instead of spinning forever.
async function failStaleDecks() {
  await SlideDeck.updateMany(
    { status: "working", updatedAt: { $lt: new Date(Date.now() - STALE_JOB_MS) } },
    { $set: { status: "failed", step: "", error: "This deck was interrupted (the server restarted). Please try again." } }
  );
}

module.exports = { startDeck, failStaleDecks };
