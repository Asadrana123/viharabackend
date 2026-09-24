# Renovation Tool — Investigation & Changes Log

Scope note: this is CRA (`vihara-new-website`) + backend (`viharabackend`) work,
**separate from** the CRA→Next.js SEO migration tracked in
`/Users/adi/projects/work/vihara/plan.md`. That file is about porting pages to
`vihara-next`; this one is about the renovation-visualization feature itself,
which lives only in the CRA app and this backend — not part of the migration.

Everything below was tested against a **local** backend + local MongoDB only.
Nothing was ever run against production, and no code here has been committed
or pushed — see "Local test infra" below for exactly what's local-only.

---

## What the renovation tool does (background)

CRA property detail page → "Visualize Renovation" button (in the photo
gallery, `PropertyGallery.jsx`) → `RenovationModal` → pick an area (Kitchen/
Bathroom/Bedroom/Living Room/Exterior), style, color scheme, budget tier →
`POST /api/property-renovation/generate-renovation-images`.

Two independent things happen server-side per request:
1. **Cost estimate** — returned immediately, synchronously. Three-layer
   fallback: (a) a hand-verified hardcoded config per property, keyed by the
   property's real MongoDB `_id` (`src/config/renovationCosts/*.js`) → (b) a
   live Gemini (`gemini-2.5-flash`) cost lookup if no hardcoded config exists
   → (c) static national-average constants if Gemini also fails.
2. **Image generation** — kicked off async (`generateRenovationImagesAsync`),
   frontend polls `GET /renovation-request/:requestId`. Uses either Black
   Forest Labs FLUX.1 Kontext (`flux-kontext-pro`, currently configured via
   `RENOVATION_IMAGE_PROVIDER=bfl`) or Replicate, real API calls either way,
   no free path for image generation. The result is re-uploaded to
   Cloudinary (`renovations` folder) for permanent storage.

**Real-money / real-external-service notes:**
- Every image generation is a real, billed BFL (or Replicate) API call using
  the same credentials production uses — no way around this locally.
- Cost estimation is free *only* when the property's local `_id` matches a
  hardcoded entry (see below) — otherwise it's a real Gemini call.
- `getContractors` is fully local/free (reads a static config file; the
  Gemini-backed version is commented-out dead code).

---

## Local test infra (2026-09-23) — why local properties now have real prod `_id`s

Local scripts, all gitignored, all refuse to run unless `DB_URI` is
localhost, none ever write to production (only ever `GET` from
`api.vihara.ai`):
- `src/scripts/seedLocalProductsFromProd.js` — seeds 13 real properties.
- `src/scripts/resyncLocalProductIdsToProd.js` — **the important one for this
  feature**: swaps each local property's `_id` to match its real production
  `_id` (a Mongo `_id` can't be changed in place, so this deletes + re-inserts
  each doc, then rewrites every dependent reference across
  `auctionregistrations`, `manualbids`, `propertyrequestmodels`, and
  `realtormodels.assignedPropertyIds` so nothing is left dangling).

**Why this mattered for renovation testing specifically:** the hardcoded
cost registry (`src/config/renovationCosts/index.js`) is keyed by real
production `_id`s. Before this resync, every local property had a
locally-generated `_id`, so `hasHardcodedCosts()` always returned `false` and
every cost-estimate test silently fell through to a real, billed Gemini
call. After the resync:

| Property (local slug) | Hardcoded cost coverage |
|---|---|
| Kingwood, Ogdensburg (partial), Atwater, Sonora ×2, Oakdale, Turlock ×3, Twain Harte, Stevinson | ✅ free hardcoded path |
| Big Bear, Ogdensburg | ❌ still falls to Gemini — registry entries **exist** but have unfilled `'PENDING_REAL_ID_...'` placeholders. Pre-existing gap in the backend's own config, not caused by anything here. |
| San Francisco (241 10th St) | ❌ falls to Gemini — no hardcoded entry exists for it at all |

**Recommended test property: Kingwood** (`1703-brookside-pine-ln-kingwood`) —
free hardcoded cost path, plus already has a live test auction/bids/seller/
realtor assignment set up from earlier migration testing.

---

## Problem reports & fixes — `src/services/shared/bflPromptBuilder.js`

### Report 1 (2026-09-23): extra artifacts (duplicated door) + edits too subtle ("just looks cleaner")

**Root cause, confirmed against Black Forest Labs' own current prompting
docs** (github.com/black-forest-labs/skills, `flux-image-best-practices`
skill), not just general assumptions:
- Every generated prompt was running **~120-130 words**. BFL's own guidance:
  optimal range is **30-80 words**; excess length "risks confusion." Only
  ~24% of the prompt was the actual creative instruction — the rest was
  preservation/repair/render boilerplate.
- Every area's per-tier instruction asked for **4-6 simultaneous, unrelated
  changes** in one clause (new vanity + retile + fixtures + mirror +
  lighting, all at once). BFL's guidance is explicit: *"For complex
  transformations... break edits into sequential steps rather than
  attempting simultaneous multiple changes. This iterative method reduces
  artifact generation and unwanted structural modifications."*
- The preservation clause was almost entirely negative commands ("Do not
  add...", "Do not move...", "Do not change..."). BFL's negative-prompt
  guidance: *"Negative prompts can actually make models focus MORE on
  unwanted elements."*

**Fix:** rewrote every area's work instruction down to its 2 highest-impact
changes per tier; rewrote the preservation clause as positive stated facts
("every window and door remain in their exact original positions" instead
of "do not add or remove any structure"); trimmed the repair/render
boilerplate. Result: **60-93 words** across all 20 area×tier combinations
(was ~120-130), same public interface (`buildPrompts()` still returns
`{ prompt }`), no controller changes needed.

### Report 2 (2026-09-23): bathtub disappeared from a generated Mid-Range bathroom image (worked correctly on hosted)

**Root cause:** the preservation clause (above) only protected **room
structure** (walls, ceiling, windows, doors) — nothing protected **fixtures
that aren't part of the requested edit**. The Mid-Range instruction says
"retile the walls and floor," which happens right where a tub sits, with no
anchor telling the model the tub should survive that. This is a named
failure mode in BFL's guidance: *"the most successful prompts explicitly say
what not to change"* — most effective when stated **right next to** the
specific risky instruction, not in a separate generic clause.

**Fix:** added an explicit fixture-preservation line to every bathroom
tier, placed next to the retiling/vanity instruction:
- Budget-Friendly / Mid-Range (never touch the tub): *"The existing tub,
  shower, and toilet stay exactly as they are."*
- Premium / Luxury (deliberately swap in a freestanding tub): reworded to
  make the swap explicit — *"replacing the existing tub with a freestanding
  tub in the same location. The toilet stays exactly as it is."* (toilet,
  never mentioned, still protected)

Checked every other area for the same class of gap:
- **Kitchen had the identical gap** — sink never mentioned in any tier,
  sitting right where every tier's countertop instruction applies. Fixed the
  same way: all 4 tiers now say "keeping the sink and appliances in their
  existing locations" (Luxury was also missing the pre-existing appliance
  anchor Mid-Range/Premium had — an inconsistency, not deliberate).
- Exterior's garage door is technically a "door," already covered by the
  existing structural clause — no change needed.
- Bedroom/Living Room have no single equivalent at-risk fixture the way
  Bathroom/Kitchen do — no change needed.

**Honest caveat, told to the user:** this is still a generative model, not a
deterministic renderer. Explicit preservation cuts the risk substantially
but can't guarantee 100% run-to-run consistency — occasional variance is
normal, not necessarily a sign the prompt is wrong.

**Verify (2026-09-23):** `renovationController.js` loads cleanly with the
rewritten builder; word counts checked programmatically across all 20 area×
tier combinations (66-93 words); user confirmed live test results
improved on both the artifact and subtlety fronts, and separately confirmed
the bathtub preservation fix.

### Report 3 (2026-09-24): toilet hallucinated/duplicated, then tub hallucinated too — same root cause, twice

**First symptom:** live testing found the toilet either appeared in the
generated image when none was visible in the source photo, or duplicated
alongside an ambiguous/partially-cropped one already there.

**Root cause:** the Report 2 fix (above) had every bathroom tier explicitly
name "the toilet" as something to preserve. Naming a specific object
asserts to the model that it exists — on a photo where the toilet is
absent, cropped, or ambiguous, that false assertion caused the model to
render a confident, complete instance of it rather than reading the actual
photo. Same "named-object attention" effect noted in Report 1, just
triggered by positive preservation language instead of a negative prompt.

**Fix:** removed "toilet" from the prompt text entirely (it now only
appears in code comments). Replaced with a generic, non-naming completeness
clause — "nothing else in the room changes" — that relies on Kontext's
default photo-conditioned behavior (it already sees the real image) instead
of asserting a specific object is there.

**Second symptom, same day:** user then found a tub appearing in a
generated image that had no tub in the original. Same exact mechanism —
every tier still named "tub" somewhere: Budget-Friendly/Mid-Range said "the
existing tub... stays exactly as it is" (asserts a tub exists), Premium/
Luxury said "replacing the **existing** tub" (also asserts one exists, to
justify the swap). Both false on a shower-only photo.

**Fix:** Budget-Friendly/Mid-Range no longer name "tub" or "shower" at all
— rely entirely on a generic "every other fixture already in the photo
stays exactly as it is" clause, same treatment as toilet. Premium/Luxury
*do* deliberately intend to add a nicer tub as a real tier feature, so that
mention stays, but reworded from "replacing the **existing** tub" (asserts
prior existence) to "**add** a freestanding tub" (correct whether or not
the source photo has one, delivers the same upgrade either way). Also
swapped "replace the faucet, **fixtures**, and vanity mirror" →
"replace the faucet, **hardware**, and vanity mirror" in Budget-Friendly to
avoid the word "fixture" meaning two different things in the same prompt
(small hardware being swapped vs. big fixtures being preserved).

**Honest limitation, explained to the user:** this class of bug (naming an
object that may or may not be in the specific photo) can only be fully
solved by actually looking at the photo first — i.e. the vision-grounded
option (#3 below) — a text-only prompt can't distinguish "photo has a tub"
from "photo doesn't," so naming an object is always a bet. User explicitly
chose to stay prompt-only rather than add a vision-grounding API call.
This fix should reduce the problem significantly (no more false-existence
assertions anywhere in the bathroom prompt) but isn't a structural
guarantee the way vision-grounding would be.

**Verify (2026-09-24):** controller loads cleanly; word counts recomputed
across all 4 tiers (72-81 words, still in/near BFL's 30-80 range); "toilet"
and "tub" no longer appear as preservation-only assertions anywhere in the
generated prompt text (tub only appears in Premium/Luxury's deliberate,
now-existence-neutral upgrade instruction). Not yet live-tested by the user
as of this entry.

---

## Further improvement options discussed, not yet done

Ordered by effort/risk, for whenever this gets picked back up:

1. **`promptUpsampling: true`** (currently `false` in `BFL_CONFIG`,
   `src/config/renovationConstants.js`) — BFL runs the prompt through an LLM
   to expand/clarify it before generation. Was presumably left off
   originally because the old prompts were already too long; worth an A/B
   test now that prompts are short and explicit. One-line config flip, free
   to try, uncertain payoff.
2. **Switch FLUX.1 Kontext Pro → FLUX.2 Pro editing.** BFL's own current
   docs state: *"FLUX.2 models with reference images are recommended as an
   improvement over FLUX.1 Kontext for editing tasks."* Pricing checked:
   FLUX.2 Pro editing ≈ $0.045/megapixel vs. Kontext Pro's flat $0.04/image —
   roughly comparable, not a meaningful cost jump. Real migration though. not
   a drop-in — would need to verify FLUX.2's request/response shape against
   `bflService.js` before considering it production-ready.
3. **Vision-grounded prompts.** Before building the edit instruction, make
   one cheap call (e.g. Gemini, already wired in) to describe what's
   actually in the "before" photo, so the prompt can say "preserve the exact
   clawfoot tub visible in the photo" instead of a generic "the existing
   tub." Would help most on unusual/non-standard rooms. Costs one extra API
   call per generation.
4. **Sequential 2-step editing** (structure first, then finishes) — BFL's
   Kontext-specific guidance recommends "incremental refinement" over one
   big edit. Highest-known-effective lever if reliability is still an issue
   after everything above, but means **2-3x the real BFL cost and latency
   per renovation**. Not adopted; flagged only.
5. **A small fixed regression-test set** (a handful of property + renovation
   -option combos, re-run manually whenever the prompt changes again) so a
   regression like the tub bug gets caught systematically next time instead
   of by chance user report.

## 2026-09-23 — A/B test: `promptUpsampling`

Tested BFL's `prompt_upsampling` option (an LLM expands/clarifies the prompt
before generation) against the same test case used for the subtlety
complaint: Kingwood bathroom photo, Mid-Range tier, Modern style, same
property (`695236a4acad197a54f80e95`), same "before" photo, identical
renovation options for both arms.

**Change made:** `promptUpsampling` in `src/config/renovationConstants.js`
(`BFL_CONFIG`) is now env-driven —
`process.env.BFL_PROMPT_UPSAMPLING === 'true'` instead of a hardcoded
`false`. Defaults to `false` (today's known-working behavior) when the env
var is unset.

**Arm A — OFF (default):** room structure preserved perfectly, but the
result was nearly indistinguishable from the original — same cabinets, same
beige/tan granite countertop. Confirms the "just looks cleaner" complaint
persists even with the shortened, positively-phrased prompts from the
earlier fix.

**Arm B — ON (`BFL_PROMPT_UPSAMPLING=true`):** same structural fidelity as
Arm A (shower, toilet, mirror, sconces, doorway, layout all unchanged, no
new artifacts) — but the countertop was actually replaced with a visibly
different white/light quartz material instead of staying beige granite. A
real, clearly visible transformation this time, with no apparent cost to
structural accuracy in this test.

**Conclusion:** `promptUpsampling: true` looks like a genuine fix for the
subtlety issue and didn't reintroduce the artifact problem in this test.
One data point, not a full regression suite (see improvement option #5
above) — worth flipping on and watching real usage, but not proven across
every area/tier combination yet.

**Status at end of this session:** user tested it live and confirmed it
looks better than the previous (upsampling-off) behavior. Decision: **keep
it env-driven** (not hardcoded `true` in `renovationConstants.js`) — stays
as `process.env.BFL_PROMPT_UPSAMPLING === 'true'`, defaulting to `false`
when unset, with `BFL_PROMPT_UPSAMPLING=true` set in the local `.env` to
turn it on. No further code change needed for this task.

## 2026-09-23 — Removed the Estimated Renovation Cost block

Per request: removed the "Estimated Renovation Cost" section (range,
line-item breakdown, contingency, ROI estimate, disclaimer) from the
renovation-visualization flow, and stopped computing it server-side.
"Local Contractors" is untouched — it was always independent.

**Frontend (`vihara-new-website`):**
- Deleted `CostDisplay.jsx` + `CostDisplay.css` (the whole block lived in
  this one component).
- Removed both render sites: `RenovationResults.jsx` (results view, right
  above `ContractorList`) and `RenovationModal.jsx` (was also shown during
  the loading step).
- Cleaned up now-dead `costAnalysis` state/props threading through
  `RenovationModal.jsx`, `RenovationResults.jsx`, `RenovationForm.jsx`,
  `ExteriorForm.jsx` — `onSubmit`/`handleFormSubmit` now just pass
  `requestId`.
- Removed the small cost-range chip on the dashboard's "Saved Renovations"
  tab (`SavedRenovations.jsx`) — a second, separate consumer of the same
  data found during research, at the user's request.

**Backend (`viharabackend`):**
- `generateRenovationImages` (`renovationController.js`) no longer computes
  `costAnalysis` at all — removed the whole hardcoded-config /
  `RenovationCostService` / Gemini-fallback block, and its `scaleCostAnalysis`
  call. This also removes the real, billed Gemini API call that used to
  fire on every request for properties without a hardcoded cost config
  (San Francisco, and the two with unfilled `PENDING_REAL_ID_...`
  placeholders — see the coverage table above).
  `RenovationRequest` docs are created without a `costAnalysis` field now
  (the schema field itself is untouched, just unused going forward — old
  saved records keep their historical data).
- Removed `costAnalysis` from all three response payloads:
  `generateRenovationImages`, `getRenovationRequest`, `getSavedRenovations`.
- Left `RenovationCostService`, `GeminiRenovationService`,
  `renovationCosts/*`, `renovationPropertyCosts.js`, `scaleCostAnalysis.js`
  in place as unused/dead code — nothing calls them anymore, but they
  weren't deleted since removing them wasn't asked for and they're inert.

**Verified (2026-09-23):** controller loads cleanly; live-tested the full
flow locally (Kingwood, Bathroom, Mid-Range, Modern) — image generation and
Local Contractors both work exactly as before, no cost block anywhere in
the modal (results view or loading step), no console/network errors.

**2026-09-24 follow-up — deleted the dead files above.** User asked
whether the now-unused files from this removal had actually been cleaned
up; confirmed via grep that nothing live referenced any of them, then
deleted:
- `src/services/property/renovationCostService.js`
- `src/services/property/geminiRenovationService.js`
- `src/config/renovationPropertyCosts.js`
- `src/config/renovationCosts/` (whole directory — `index.js`,
  `scaleCostAnalysis.js`, `_shared.js`, and 20 per-property cost config
  files, ~500KB total)

Left alone, per explicit instruction: `src/services/shared/
geminiPromptBuilder.js` (a pre-existing orphaned file, unrelated to this
feature — nothing has ever required it, only a stale JSDoc comment
mentions `RenovationCostService`) and the unused `.renovation-results__
cost-summary` CSS in `RenovationResults.css` (also pre-existing, never
wired to any JSX even before this feature existed). Neither was touched by
the removal above, so neither was touched now either.

**Verified (2026-09-24):** `renovationController.js` still loads cleanly
after deletion; grepped the whole `src/` tree for any of the deleted
module names — zero remaining references except one already-commented-out
line in `renovationContractorService.js` (harmless, was already inert
before today).

## Fill in what has changed each time we come back to this

Whoever (human or Claude) picks this file back up: read the section above,
then append a new dated entry below this line with what changed since, same
pattern as the migration plan.md's own Sync Log.
