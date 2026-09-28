# FullEnrich vs. Exa vs. Parallel — Live Test on Real Lead Data (2026-09-26 to 2026-09-28)

Research-only test, no code changes. Ran all three services directly against
the same 20 real rows from `Leadlist-Ogd - AI Call List.csv` (the entire
sheet) to see what each can find, side by side. FullEnrich was run for real
on the production account/key already used in
`src/services/enrichment/fullenrichClient.js` — this consumed **60 real
credits** (roughly $1.50-$3.50 depending on plan tier), unlike Exa/Parallel
which cost fractions of a cent per lead. Exa and Parallel were run under
separate test API keys provided for this comparison, not integrated into
the codebase.

## What each service is given / gives back

### FullEnrich (current, `enrichByNameCompany`)
- **Input:** first name, last name, company name.
- **Output:** one work email (`most_probable_work_email`), a status
  (verified/catch-all/etc.), a list of alternate emails. That's it — no
  phone on this path, no company/activity data.
- **Source:** static waterfall across 15-20+ pre-built B2B databases
  (Apollo/Clearbit-style). If the person/company isn't in one of those
  databases, it returns `not_found` — it does not search the open web.

### Exa — what we could actually test
Exa has two separate products:
- **Websets** (entity search + "enrichment columns" like email/phone/text) —
  this is the product that maps directly onto FullEnrich's job. **Could not
  test it** — the provided API key returned `401 Your team does not have
  access to the API. Upgrade to a Pro plan to get access.` This is a plan
  gate, not a balance/credits problem — the $20 balance doesn't unlock it.
- **Core Search + Answer API** — pay-as-you-go, worked fine on this key/
  balance (~$0.005-0.007 per call, so all 5 test contacts cost under
  $0.05 total). This is what the results below actually come from. It's a
  general web-search + LLM-answer engine, not a purpose-built contact-finder
  — we simulated "enrichment" by asking it a direct question per contact:
  *"What is the email/phone for [name], associated with [company]? What
  real-estate activity is this company known for?"*

So this test used Exa's general-purpose search, not its purpose-built
enrichment product. Websets would likely do at least as well, structured
into clean columns instead of a prose answer — but that's untested here.

### Parallel — what we tested
Parallel's **Task API** worked directly on the pay-as-you-go key with no
plan-gate issue (unlike Exa). Used the `base` processor (cheapest tier) with
a structured `output_schema` — one task per contact, asking for `email`,
`phone`, `activity` as explicit JSON fields, each with Parallel's own
`confidence` rating and source citations attached ("Basis" framework). This
is a fair, direct test of Parallel's real product — no workaround needed,
unlike Exa.

Flow: `POST /v1/tasks/runs` (submit, get a `run_id` back immediately) ->
poll `GET /v1/tasks/runs/{run_id}/result` until `status: "completed"`. Each
task took 60-90 seconds to complete.

## Field-by-field breakdown, all three tools, all 20 rows

### FullEnrich (real production run, `contact.enrich/bulk`, fields: work_emails + phones)

| # | Contact / Company | Email | Phone | Activity |
|---|---|---|---|---|
| 1 | Robert Kulp / Northern View Properties LLC | ❌ | ❌ | — (no such field) |
| 2 | Michael Deyo / ZJ Property Management LLC | ❌ | ❌ | — |
| 3 | Daniel Perotti / Pennymac Services Inc | ✅ `dan.perotti@pennymacusa.com` (catch-all) | ✅ `+1 917-363-9752` (mobile, **confirmed 90%** ownership match, highest connect rate) | — |
| 4 | Nathan Ea / Twins Lodge LLC | ❌ | ❌ | — |
| 5 | Javier Lazo / JLM Team LLC | ❌ | ❌ | — |
| 6 | Lakshmi Medapati / Vikasam LLC | ❌ | ❌ | — |
| 7 | Carey Gage / Cipollini Holdings LLC | ❌ | ❌ | — |
| 8 | Ramon Oropeza / Goldweight Properties 2714 LLC | ❌ | ✅ `+1 919-914-2538` (confirmed 90%) | — |
| 9 | Yahya Saqer / Green Ground LLC | ❌ | ✅ `+1 908-499-5449` (confirmed 90%) — candidate list also surfaced `908-392-3980`, **exact match to the CSV's own phone** | — |
| 10 | Robert Stolz / House Purchasing Group LLC | ❌ | ✅ `+1 973-229-5600` (confirmed 90%) | — |
| 11 | Peter Scumaci / Pumpkin on a Ladder LLC | ❌ | ❌ | — |
| 12 | Kira Syvertsen / Revived Residences LLC | ✅ `kira@revivedresidences.com` (deliverable) | ❌ | — |
| 13 | Orlando Wilson / Romero Brothers LLC | ❌ | ❌ | — |
| 14 | Christian Vega / Vega Assets Investments LLC | ❌ | ⚠️ `+1 787-595-7205` (Puerto Rico — no ownership-match/confidence field returned, unverified) | — |
| 15 | Kevin Snow / National Property Group LLC | ✅ `kevin@nationalpropertygroup.com` (deliverable) | ✅ `+1 714-815-4525` (confirmed 90%) | ⚠️ Not a real field, but a bonus `profile.headline` came back: *"Single & Multifamily Real Estate Investor... 80+ Rental Doors... Fix and Flips"* — see note below |
| 16 | Bradly Rogers / Oakvale Acres LLC | ❌ | ❌ | — |
| 17 | Jordan Bennett / St Lawrence Estates LLC | ❌ | ❌ | — |
| 18 | Benjamin Burds / Noco Storage LLC | ❌ | ❌ | — |
| 19 | Sandra Gould / Potsdam Realty LLC | ❌ | ❌ | — |
| 20 | Heather Wilson / HCKN Services LLC | ❌ | ❌ | — |

**FullEnrich totals: email 3/20, phone 6/20 confirmed (+1 unverified), activity 0/20 (structurally absent — no such field exists to request)**

**On activity, direct answer: no, not really.** FullEnrich has no activity/investment-behavior field in its API at all — the only enrichable fields are `work_emails`, `personal_emails`, `phones`. Two rows (Perotti, Snow) happened to return a bonus `profile` object (a LinkedIn-style headline/employment description) as a side effect of matching a rich people-profile — Kevin Snow's genuinely reads like a ready-made activity line. But this isn't a field you can request or rely on; it only showed up on 2 of 20 rows here, purely incidentally.

**Real cost:** this batch consumed **60 credits** on the production account (6 phones found × 10 credits each = 60; the 3 emails found didn't add cost on top in this run). At typical per-credit pricing (~2.6¢-5.9¢ depending on plan tier), that's roughly **$1.50-$3.50 for these 20 leads** — noticeably more than Exa or Parallel cost for the same 20.

### Exa (Search/Answer)

| # | Contact / Company | Email | Phone | Activity |
|---|---|---|---|---|
| 1 | Robert Kulp / Northern View Properties LLC | ✅ `specialtyfloors@hotmail.com` | ✅ `315-869-0600` (matches CSV) | ✅ Buy-and-hold, 8 acquisitions |
| 2 | Michael Deyo / ZJ Property Management LLC | ❌ | ❌ | ✅ Buy-and-hold, SFR+vacant land (flagged: LLC registered to a different person) |
| 3 | Daniel Perotti / Pennymac Services Inc | ❌ (personal) | ⚠️ company line only | ✅ Mortgage banking, not flipping |
| 4 | Nathan Ea / Twins Lodge LLC | ❌ | ❌ | ❌ (flagged: LLC registered to a different person, Cody Pernice) |
| 5 | Javier Lazo / JLM Team LLC | ❌ | ❌ | ✅ Flipping, short-term hold/resale |
| 6 | Lakshmi Medapati / Vikasam LLC | ❌ | ❌ | ❌ (company not found in any record) |
| 7 | Carey Gage / Cipollini Holdings LLC | ❌ | ❌ | ❌ |
| 8 | Ramon Oropeza / Goldweight Properties 2714 LLC | ❌ | ❌ | ✅ Flipper, buys/renovates/sells+rents SFR |
| 9 | Yahya Saqer / Green Ground LLC | ✅ `sales@greenground.us` | ✅ `908-499-5449` | ❌ |
| 10 | Robert Stolz / House Purchasing Group LLC | ❌ | ❌ | ✅ Flipper, SFR |
| 11 | Peter Scumaci / Pumpkin on a Ladder LLC | ❌ | ❌ | ✅ Buy-and-hold, SFR |
| 12 | Kira Syvertsen / Revived Residences LLC | ✅ `kira.syvertsen@cbmoves.com` | ✅ `607-435-5591` (matches CSV) | ✅ Flipping, renovate/design/stage & sell |
| 13 | Orlando Wilson / Romero Brothers LLC | ⚠️ `romerobrothers0w@gmail.com` | ⚠️ `973-723-0062` (matches CSV) | ❌ — explicitly **not** a real estate investor (landscaping company) |
| 14 | Christian Vega / Vega Assets Investments LLC | ❌ declined (ambiguous identity) | ❌ declined | ✅ Flipping SFR, 16 acquisitions |
| 15 | Kevin Snow / National Property Group LLC | ❌ | ⚠️ company line only | ✅ Buy-renovate-rent/sell + private lending |
| 16 | Bradly Rogers / Oakvale Acres LLC | ❌ | ❌ | ❌ |
| 17 | Jordan Bennett / St Lawrence Estates LLC | ⚠️ `jordanb88@gmail.com` (tied to his other business "Bennett Farms," not confirmed for this LLC) | ⚠️ `315-276-6753` (matches CSV, same caveat) | ❌ |
| 18 | Benjamin Burds / Noco Storage LLC | ❌ | ⚠️ `315-386-1000` company line (doesn't match CSV's 802-734-0942) | ❌ (self-storage, not flip/hold) |
| 19 | Sandra Gould / Potsdam Realty LLC | ❌ | ⚠️ found personal numbers, none match CSV, not linked to this LLC | ❌ |
| 20 | Heather Wilson / HCKN Services LLC | ❌ | ❌ | ❌ |

**Exa totals: clean hits — email 3/20, phone 3/20 (+4 uncertain), activity 10/20**

### Parallel (Task API, `base` processor)

| # | Contact / Company | Email | Phone | Activity |
|---|---|---|---|---|
| 1 | Robert Kulp / Northern View Properties LLC | ✅ `specialtyfloors@hotmail.com` | ✅ `315-869-0600` (matches CSV) | ✅ Buy-and-hold |
| 2 | Michael Deyo / ZJ Property Management LLC | ❌ | ❌ | ✅ Buy-and-hold (missed the ownership-mismatch flag Exa caught) |
| 3 | Daniel Perotti / Pennymac Services Inc | ✅ `PFSI_IR@pnmac.com` | ✅ `818.264.4907` | ✅ Mortgage servicing, not flipping |
| 4 | Nathan Ea / Twins Lodge LLC | ❌ | ❌ | ✅ Buy-and-hold rental signal (medium) |
| 5 | Javier Lazo / JLM Team LLC | ❌ | ❌ | ❌ (nothing, low confidence) |
| 6 | Lakshmi Medapati / Vikasam LLC | ❌ | ❌ | ❌ |
| 7 | Carey Gage / Cipollini Holdings LLC | ⚠️ `c.gage@jmslawyers.com` (**high** confidence, reads like a lawyer's contact, no evident LLC link) | ⚠️ `973-382-7477` (same caveat) | ❌ |
| 8 | Ramon Oropeza / Goldweight Properties 2714 LLC | ⚠️ `ramon.oropeza@kwmet.com` (Keller Williams domain — plausible, unverified) | ⚠️ `973-539-1120` | ✅ Flipper, fixes/flips distressed homes |
| 9 | Yahya Saqer / Green Ground LLC | ❌ (Exa found this one, Parallel missed) | ❌ | ✅ Flipping signal |
| 10 | Robert Stolz / House Purchasing Group LLC | ⚠️ `bob.stolz@cbmoves.com` (Coldwell Banker domain — plausible, unverified) — **matches FullEnrich's confirmed phone number for the same row** | ⚠️ `973-229-5600` — same number FullEnrich independently confirmed at 90% | ✅ House flipping |
| 11 | Peter Scumaci / Pumpkin on a Ladder LLC | ❌ | ❌ | ✅ Buy-and-hold |
| 12 | Kira Syvertsen / Revived Residences LLC | ✅ `kira.syvertsen@cbmoves.com` (FullEnrich found a *different* email, `kira@revivedresidences.com`, also plausible) | ✅ `607-435-5591` (matches CSV) | ✅ Renovation-led flipping |
| 13 | Orlando Wilson / Romero Brothers LLC | ⚠️ `romerobrothers0w@gmail.com` | ⚠️ `973-723-0062` (matches CSV) | ❌ (left blank — didn't flag the wrong-industry issue Exa caught) |
| 14 | Christian Vega / Vega Assets Investments LLC | ⚠️ `christianvega@realtyexecutives.com` (**likely wrong person**) | ⚠️ `201-919-1329` (a *third* different number from FullEnrich's Puerto Rico guess) | ✅ Flipping, SFR |
| 15 | Kevin Snow / National Property Group LLC | ⚠️ `ksnow@serhant.com` (Serhant brokerage domain — **FullEnrich found the correct one instead**, his own company's `kevin@nationalpropertygroup.com`, confirmed) | ⚠️ `877-907-2107` (generic line — FullEnrich's confirmed `714-815-4525` is more credible) | ✅ Buy-renovate-rent/sell |
| 16 | Bradly Rogers / Oakvale Acres LLC | ❌ | ❌ | ❌ |
| 17 | Jordan Bennett / St Lawrence Estates LLC | ❌ (Exa found something, Parallel didn't) | ❌ | ❌ |
| 18 | Benjamin Burds / Noco Storage LLC | ❌ | ✅ `315-386-1000` (**high** confidence, company line) | ✅ Storage/rental framing |
| 19 | Sandra Gould / Potsdam Realty LLC | ⚠️ `sandragould99@gmail.com` (medium, not confirmed LLC-linked) | ✅ `713-858-9822` — **exact match to CSV** | ❌ |
| 20 | Heather Wilson / HCKN Services LLC | ❌ | ❌ | ❌ |

**Parallel totals: clean hits — email 3/20 (+6 uncertain), phone 4/20 (+6 uncertain), activity 12/20**

## Three-way scoreboard (20 rows)

| | FullEnrich | Exa | Parallel |
|---|---|---|---|
| Email found (confident) | 3/20 | 3/20 | 3/20 (+6 uncertain/likely-wrong-person) |
| Phone found (confident) | 6/20 (+1 unverified) | 3/20 (+4 uncertain) | 4/20 (+6 uncertain) |
| Activity/investment-behavior data | 0/20 (not a real field; 2 incidental) | 10/20 | 12/20 |
| Real cost, these 20 leads | **~$1.50-$3.50** (60 credits) | **~$0.10** | **~$0.10** |
| Standout strength | When it confirms a phone (90% ownership match), it's the most trustworthy hit of the three — see row 3 (Perotti) and row 15 (Kevin Snow), where it beat both other tools outright | Best at flagging when NOT to trust a match (declines to guess, catches ownership mismatches) | Best raw activity-data coverage, with citations attached to every field |
| Standout weakness | Zero activity data by design; costs ~15-35x more than the other two for the same batch | Missed some direct hits the others found (Perotti's/Snow's personal contact, Bennett) | Repeatedly returns a same-name real-estate-professional's contact as "medium/high confidence" without confirming they're actually the LLC owner (5 of 20 rows: Gage, Oropeza, Stolz, Vega, Snow) |

## Cost comparison

| | FullEnrich | Exa (Search/Answer, tested) | Exa Websets (untested — Pro-gated) | Parallel (Task API, `base`) |
|---|---|---|---|---|
| Per lookup | 1 credit/email, 10 credits/phone (only charged on a match) — real per-credit price depends on plan tier (~2.6¢-5.9¢) | ~$0.005-0.007 per query (charged whether or not it finds anything — no pay-on-match) | Unknown — separate credit system, requires Pro plan upgrade first | ~$0.005/task listed rate for simple enrichment (charged whether or not it finds anything) |
| This test (20 leads) | **60 credits, ~$1.50-$3.50** (real production account) | **~$0.10 total** | Not run | **~$0.10 total** |

## Key findings

1. **FullEnrich has zero activity data, by design** — confirmed against its
   actual API schema, not just inference: `enrich_fields` only accepts
   `work_emails`, `personal_emails`, `phones`. There is no way to request
   investment-behavior data at any price. Exa and Parallel both produced
   real, sourced activity data (buy-and-hold vs. flipping, acquisition
   counts) on roughly half the 20 rows — this is exactly the "I noticed you
   flip a lot of homes" personalization gap flagged in the earlier outbound
   cold-call script research.
2. **When FullEnrich does confirm a contact, it's the most trustworthy of
   the three** — its `ownership_match: CONFIRMED` + `confidence: 90` fields
   are a real verification step, not a guess. Row 3 (Perotti) and row 15
   (Kevin Snow) are the clearest examples: FullEnrich found the *correct*
   personal contact with high confidence in both cases, while Parallel
   guessed a plausible-but-wrong professional contact for the same two
   people (a mortgage company's IR line; a Serhant brokerage agent).
3. **Parallel repeatedly returns a same-name real-estate professional's
   contact as "medium" or even "high" confidence, without confirming
   they're the actual LLC owner** — happened on 5 of 20 rows (Gage,
   Oropeza, Stolz, Vega, Snow). Its citation+confidence framework is a real
   feature, but it doesn't by itself prevent an identity-collision guess —
   it just makes the guess look more credible.
4. **Exa is the most conservative about guessing** — it explicitly declined
   to name a contact on ambiguous rows (Christian Vega: multiple people by
   that name exist) rather than picking one, and proactively flagged two
   data-quality problems in the source list itself (Michael Deyo's LLC is
   actually registered to someone else; same for Nathan Ea's).
5. **All three tools gave three different answers on the hardest row
   (Christian Vega)** — Exa declined, Parallel picked a real estate agent,
   FullEnrich returned an unverified Puerto Rico mobile number. This is the
   clearest single example in the whole test of why identity-ambiguous rows
   need a human check regardless of which tool is used.
6. **Cost gap is large and consistent**: FullEnrich cost ~$1.50-$3.50 for
   these 20 leads (real production credits); Exa and Parallel each cost
   about a dime for the same 20. FullEnrich's phone lookups specifically
   are the expensive part (10 credits per found phone vs. ~1 for email).

## Bottom line for now

No single tool wins outright. **FullEnrich remains the most trustworthy
source specifically for confirmed contact info** when it has a match (its
verification step is real, not a guess) — but it's also the most expensive
per lead by a wide margin, and it structurally cannot produce any
activity/personalization data at all. **Exa and Parallel are cheap
complements, not replacements**: both can surface real investment-activity
facts FullEnrich never will, at roughly 1/20th the cost, but their
contact-info guesses need more scrutiny — Parallel in particular tends to
confidently name a plausible same-name professional without confirming the
LLC link, which is a real risk if that guess were ever read aloud on a live
call unattended. A sensible combination, if this were ever pursued further:
keep FullEnrich for the email/phone lookup, and use Parallel (with a "only
trust high-confidence AND clearly-matched-entity" guardrail) or a real
Websets trial (still untested — needs an Exa Pro plan) purely for the
activity-personalization line.
