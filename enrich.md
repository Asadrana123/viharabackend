# Contact Enrichment Lists: Implementation Plan

Companion to `outboundplan.md` and `outbound.md` in this repo. Those two stay
the source of truth for the Outbound SMS + Email feature and its decisions.
This file plans a **new, separate** feature that sits next to it.

Repos: backend `viharabackend` and frontend `vihara-new-website`. At the time
of writing the backend is on `ogdensburg-outbound` (the Outbound feature's
branch, PR #3 still open) and the frontend is on `ogdensburg-slider-fix`
(Outbound's frontend PR #8 is already merged to `main`). Which branch this
work starts from is open question #1.

**Status (2026-09-26): plan written, nothing built. Every design decision
that isn't already fixed by the requesting user is listed in §12 as a
question.** Where this plan recommends something, it says so and says why,
but the recommendation isn't a decision until it's answered.

---

## 1. Summary

A new admin feature for turning a raw contact CSV into a reviewed, enriched
contact list that can then be sent to the existing channels.

1. **Upload once.** The admin uploads a CSV of buyers, sellers and LLC owners
   (usually an "SFR" export, which is shaped like the PropStream export the
   calling code already reads: Full Name, Address, City, State, Zip, Phones,
   Emails). Header matching is flexible, the same way `parseContactsCsv` and
   `outboundContactsService` already are.
2. **Enrich in the background.** The backend runs FullEnrich for every
   contact in the list as a background job. The upload request returns right
   away with a list id, and the UI polls for progress.
3. **Persist the results.** Every enrichment result is saved in Mongo, keyed
   so the same person isn't looked up (and billed) again the next time they
   show up in a CSV. This is a deliberate change from the calling flow, which
   throws its enrichment away after one call.
4. **Review and edit.** When enrichment finishes, the admin gets a table of
   the contacts with what FullEnrich returned, and can correct fields by hand.
5. **Send to any mix of channels.** From the reviewed list, the admin can
   start a call campaign, an SMS campaign and/or an email campaign, in any
   combination. Each channel is handed off to its **existing** send path:
   `dispatchCall` for calls, and `outboundCampaignService` (which drives
   `outboundSmsService` / `outboundEmailService`) for SMS and email. No new
   send logic.

### What this feature is not

These are hard constraints, from the requesting user and carried over from
the Outbound project:

- **The calling agent's code stays untouched.** No edits to anything under
  `src/services/calling/`, `src/controller/calling/`, `src/routes/calling/`,
  `src/model/calling/`, or frontend `src/components/AdminPanel/Calls/`. That
  includes `vapiCampaignService.js`, `vapiController.js`, `vapiRoutes.js`,
  `vapiService.js`, `CallLauncher.jsx` and `VoiceAgentDashboard.jsx`.
  Checked 2026-09-26: the Outbound build kept to this (`outboundContactsService.js`
  lines 7–11 and `ContactTargeting.jsx` lines 6–7 say so in comments, and
  nothing under `src/services/outbound/` requires a calling file). Whether
  *importing* (not editing) calling functions is allowed is a real question
  for this feature, because it has to start calls. See §7.2 and open
  question #2.
- **The existing Outbound SMS/Email contact targeting stays untouched.**
  `ContactTargeting.jsx`, `SmsLauncher.jsx`, `EmailLauncher.jsx`,
  `outboundContactsService.js` and the `/api/v1/outbound/*` endpoints keep
  working exactly as today. The requesting user: "leave it untouched for now.
  let it sit alongside."
- **The existing calling CSV upload stays untouched.** `CallLauncher`'s CSV
  campaign mode keeps enriching on the fly (when its checkbox is ticked) and
  keeps throwing the result away. This feature doesn't change that or
  replace it.
- **No code integration with SFR.** SFR is only where the CSV comes from. The
  admin exports it by hand and uploads it. Nothing to build for the source.
- **Additive only.** New files, new collections, new routes, one new sidebar
  entry. The few spots where a small additive change to an existing file
  would help are called out one by one and each is an open question.

---

## 2. What the research found (facts the plan depends on)

These come from reading the code, not guessing. Line numbers are as of
2026-09-26.

### 2.1 The FullEnrich client (`src/services/shared/fullenrichService.js`)

- **Lookup is by email only.** `enrichPerson(person)` (lines 62–72) returns
  `null` straight away if `person.email` is missing (line 63). Several lead
  controllers pass a `phone` too (`norCalLeadController.js` lines 159–163,
  `propertyLeadController.js` lines 167–171), and three lead models describe
  the field as a "reverse-email/phone profile", but the phone is never sent.
  **So a contact with no email can't be enriched at all.** That matters for
  SFR rows, which often have phones but no email.
- **Two-step API.** `submitEnrichment` (lines 9–29) does
  `POST /contact/reverse/email/bulk` with a `data` array holding **one**
  email, and `custom.user_id` set to the person's full name (line 15). Then
  `getEnrichmentResult` (lines 32–59) polls
  `GET /contact/reverse/email/bulk/{id}` up to 10 times, 6s apart (the log
  line at 51 says "waiting 3s" but the delay at 52 is 6000ms). Worst case
  per contact is about 60s.
- **Every kind of failure comes back as the same `null`.** No email, submit
  failed, the job came back `FAILED`, a poll errored, 10 polls ran out, or
  FullEnrich finished and found nobody (`data[0].profile` missing): all
  return `null`. **A caller can't tell "not found" from "broken".** For a
  persisted, per-contact status that the admin can act on, the new feature
  needs to tell these apart (§5.3).
- **The endpoint is a bulk endpoint, but we use it one email at a time.** The
  request body already takes a `data` array. Sending a batch per request
  would make a several-hundred-row list much faster than hundreds of
  sequential 6–60s lookups. What the batch limit is, whether results come
  back in order or matched by `custom`, and how billing works are not in
  our code and need checking against FullEnrich's docs (Phase 0).
- **What the profile looks like.** Our code only ever reads four paths from
  the profile (`buildResearchSummary`, lines 79–86):
  `employment.current.title`, `employment.current.company.name`,
  `employment.current.company.industry.main_industry`, and `skills[]`.
  Everything else in the profile is unknown to the codebase. The lead models
  store the whole thing as `enrichment: { type: Mixed }`.
- **`buildResearchSummary` is hardcoded to Oakland.** Line 89 appends "…connects
  their profile to the **Oakland** investment property opportunity" to every
  summary, and line 76 says "They own property at ${address}" for everyone.
  Any calls this feature starts can't reuse this function as-is without
  pitching every contact on Oakland. Noted as a known issue, not fixed here
  (existing code, and the standing rule is not to fix known bugs in passing).
- `enrichPerson` and `buildResearchSummary` are the only exports (line 94).

### 2.2 Where FullEnrich is called today

| Caller | What it does with the result |
|---|---|
| `controller/calling/leadCallController.js` line 49 | Saves it onto a new `PersonaLead` as `enrichment`. |
| `controller/leads/earlyAccessLeadController.js` line 129 | `$set: { enrichment }` on the lead, after responding. |
| `controller/leads/georgiaStLeadController.js` line 107 | Same pattern. |
| `controller/leads/rensselaerAveLeadController.js` line 107 | Same pattern. |
| `controller/leads/norCalLeadController.js` line 159 | Same pattern. |
| `controller/leads/partnerLeadController.js` line 132 | Same pattern. |
| `controller/leads/propertyLeadController.js` line 167 | Same pattern. |
| `services/calling/vapiCampaignService.js` line 105 | Builds a one-off research summary string for the call, then throws the profile away. |

The lead-form callers all persist the raw blob onto their own lead
document (`enrichment: Mixed` in `personaLeadModel`, `earlyAccessLeadModel`,
`georgiaStLeadModel`, `rensselaerAveLeadModel`, `norCalLeadModel`,
`partnerLeadModel`, `propertyLeadModel`). There is no shared enrichment
store, and nothing checks whether a person was already enriched before
calling FullEnrich again. Seeding the new store from those existing blobs is
open question #9.

### 2.3 The calling side (`src/services/calling/vapiCampaignService.js`), read only

- **Contact shape.** `buildContact(raw)` (lines 25–33) returns
  `{ fullName, address, city, state, zip, email | null, phones: [] }`.
  `phones` goes through `vapiService.parsePhones` (`vapiService.js` lines
  229–243), which splits on `|`, and accepts 10-digit, 11-digit-with-1, and
  12-digit-with-91 numbers (so Indian numbers pass).
- **CSV parsing.** `parseContactsCsv` (lines 45–95) matches headers case- and
  space-insensitively and reads: name from `full name` only, phones from
  `phones` / `phone number`, email from `emails` / `email` (first value
  before a `|`), and `address`, `city`, `state`, `zip code`. Rows with no
  `Full Name` are dropped silently (line 82). More than 500 rows throws
  (lines 88–92, `MAX_CONTACTS_PER_CAMPAIGN`).
- **Enrichment is best-effort and throwaway.** `safeResearchSummary` (lines
  102–111) calls `enrichPerson` then `buildResearchSummary` and returns `""`
  on any error. The string becomes the `prospect_research` prompt variable
  (`vapiPromptService.js` `buildVariableValues`, line 154). The profile
  itself is never stored. `vapiCallsService.mapCallLog` even hardcodes
  `enriched: false` (line 151) because nothing about enrichment survives into
  `CallLog`.
- **The admin UI defaults enrichment off.** `CallLauncher.jsx` line 86:
  `useState(false)` for `enrich`.
- **Job pattern.** `createCampaign` (lines 161–188) puts a job in the
  in-memory `CAMPAIGN_JOBS` map (line 14) with `status` (`queued | running |
  completed | failed`), `total / processed / dispatched / skipped / failed`,
  `currentContact`, and `results[]`. `runCampaign` (lines 193–256) is
  started by the controller without awaiting it (`vapiController.js` lines
  113–115, after the `202`). `getCampaign` (lines 261–270) strips the
  private fields and adds `progress`. Finished jobs are pruned after
  `JOB_TTL_MS` = 24h (line 7, pruned lazily in `pruneExpiredJobs`, lines
  150–155). The file's own comment (lines 12–13): "Lost on process restart…
  Move to Mongo if the API ever runs on more than one instance."
- **Every phone gets dialed.** `runCampaign` loops over *all* of a contact's
  phones (lines 218–227), 2s apart, then waits 6s before the next contact
  (lines 8–9). An SFR row with three phones means three calls.
- **What `runCampaign` needs from its caller.** `createCampaign(contacts,
  { enrich, property, promptConfig })`. `property` comes from
  `vapiPropertyService.resolveProperty(propertyId)` and `promptConfig` from
  `vapiPromptService.resolvePromptConfig(propertyId)`, which **throws 422 if
  the property has no voice prompt written** (lines 200–208). The controller
  does both in `resolvePitch` (`vapiController.js` lines 22–26).
- **There's no way to pass a ready-made research summary in.** `runCampaign`
  always calls `safeResearchSummary(contact, job.enrich)`. With
  `enrich: false` the summary is `""`. With `enrich: true` it calls
  FullEnrich again. There's no third option without editing the file. This
  is the main friction for the call hand-off (§7.2).

### 2.4 `dispatchCall` (`src/services/calling/vapiService.js`), read only

- Signature (lines 349–353): `dispatchCall(phoneNumber, person,
  { researchSummary, property, promptConfig, source })`. It takes a plain
  phone string and a plain contact object, not a lead document, so any
  caller can use it.
- It picks a caller number from the pool (`pickCallerNumberId`) and returns
  `{ success: false, error: "daily call cap reached on all caller numbers" }`
  when every number is at its daily cap. A long list can hit this.
- It pulls prior-call memory for the number (`buildPriorContext`), so calls
  to people we've called before carry context automatically.
- `metadata.source` defaults to `"vihara-voice"` (line 360), the same tag the
  admin CallLauncher paths use. The VAPI webhook copies it onto a
  `CallbackRequest` when the agent books a callback
  (`voiceCallbackController.js` line 125). Using the default keeps callback
  behavior identical to today's admin campaigns; a new tag would need
  checking against the callback scheduler first.
- Exported: `parsePhones`, `dispatchCall`, `PROPERTY`, `getCall` (line 427).

### 2.5 The Outbound SMS + Email side (read only, reused through its services)

- **No enrichment at all.** `outboundContactsService.js` only parses and
  validates.
- **Contact shape is `{ name, phone, email }`** (line 175): one phone
  (normalized `+1XXXXXXXXXX` by `utils/usPhone.toUsSmsNumber`, which
  **rejects non-US numbers**), one lowercased email. Header aliases (lines
  25–27): name from `full name` / `name` / `first name`; phone from `phone`
  / `phones` / `phone number`; email from `email` / `emails`. Multi-value
  cells split on `|`, first *valid* one wins (lines 35–43). No address,
  city, state or zip.
- **Validation is per channel** (`normalizeRow`, lines 93–117, **not
  exported**): SMS needs a valid US phone **and** an email (decision #5 in
  `outboundplan.md`); Email needs a valid email. Duplicates within a batch
  are dropped (by phone for SMS, email for Email).
- `parseContacts({ channel, csvData | contact, maxContacts })` (lines
  133–182) **is** exported. It takes raw CSV text or one contact object, not
  an array of already-parsed contacts.
- **The guards live in the controller, not the service.**
  `launchSmsCampaign` (`outboundController.js` lines 69–126) checks the
  property exists, `validateMaxContacts`, `consentAttested === true`, and
  `resolveOutboundSmsListId(property) !== null`, then parses, then checks
  `overLimit` and `total > 0`, then `createCampaign` + `startCampaign`.
  `launchEmailCampaign` (lines 176–219) does the same minus consent/list,
  plus subject/body required. Controllers are HTTP handlers, so another
  feature can't call them as functions.
- **The services are callable directly.** `outboundCampaignService`
  exports `createCampaign({ channel, source, csvFileName, maxContacts,
  property, createdBy, contacts, parseSkipped, sms, email })` (lines 49–99)
  and `startCampaign(id)` (lines 102–121), which runs the right channel
  runner and marks the campaign failed if it throws. `contacts` is an array
  of `{ name, phone, email }`.
- **The campaign record has no field for "where this came from" beyond
  `source: "single" | "csv"`** (`outboundCampaignModel.js` line 49). A
  campaign started from an enrichment list would have to be recorded as
  `"csv"` unless the enum and a back-reference are added (open question #16).
- **Campaign tracking is in Mongo, not in memory**, with lazy stale
  detection: a `running` campaign whose `updatedAt` is over 10 minutes old
  flips to `interrupted` on read (`outboundCampaignService.js` lines 19–42).
  This is the better model to copy for the enrichment job (§5.4).
- **Email variables are fixed.** `EMAIL_VARIABLES` (`outboundEmailService.js`
  lines 16–28) are contact name plus property fields. There's nothing for
  company, job title, industry and so on, and `buildRecipientVars` (lines
  45–57) only reads `contact.name`. Enriched fields can't reach an email
  without changing that file (open question #18).
- Hard ceiling of 500 per campaign for both SMS and email
  (`MAX_CONTACTS_CEILING`, line 21), with an admin-set `maxContacts` under
  it.

### 2.6 Frontend patterns to mirror

- `Core/adminPanel.jsx`: `VALID_TABS` (lines 28–34) plus a
  `{mainContent === 'x' && <X />}` line (lines 91–109). Navigation calls
  `setSearchParams({ tab })`, which wipes other params.
- `Core/adminPanelSidebar.jsx`: flat `<li>` items using `navTo('x')` and
  Phosphor icons. "Outbound" sits right after the Voice Agent / Scheduled
  Callbacks group (lines 122–127).
- `Outbound/OutboundHub.jsx`: one sidebar entry with inner tabs in the URL
  (`&channel=`), updated with the functional `setSearchParams` form so `tab`
  survives (lines 42–49). CSS uses an `obx-` prefix. `OutboundHub.css` lines
  1–11 restate the design system: Inter, text `#697a8d`, accent `#696cff`,
  background `#f5f5f9`, white cards with a `1px solid #e9ecef` border,
  headings `#32383e`, muted `#a8b1bb`. Same tokens as
  `VoiceAgentDashboard.css` lines 1–8 and `CallLauncher.css` lines 1–4.
- `Outbound/useCampaignPolling.js`: polls every 3s (line 5), stops on
  `completed | failed | interrupted` (line 4), cleans up on unmount.
- `Outbound/CampaignProgress.jsx` takes a `campaignId` and shows any
  outbound campaign's progress. `Outbound/EmailComposer.jsx` takes
  `property, subject, body, bodyFormat, on*Change, emailVariables,
  previewContact` as props. `Outbound/OutboundPropertyPicker.jsx` takes
  `channel, value, onChange`. All three can be imported as-is (not edited)
  by the new screen.
- The API layer is one file per domain: `src/api/outbound.api.js` wrapped by
  `src/services/outbound.service.js`.

---

## 3. Layout

**Recommendation: a new top-level sidebar entry, `?tab=enrichment`, not a
fourth tab inside Outbound.** The name is open question #20; "Enrichment" is
used as a placeholder throughout.

Why its own section:
- It isn't an SMS or email thing. It feeds calls too, and Calls aren't part
  of the Outbound hub (by decision in `outbound.md`).
- Its main object is a *list* that lives for a while and gets reviewed,
  edited and sent more than once. Outbound's main object is a one-shot
  campaign.
- Keeping it out of `OutboundHub.jsx` means that file stays untouched, which
  matches "let it sit alongside".

Inside it, follow the Outbound hub's pattern: one page, inner views in the
URL.

- `?tab=enrichment&view=upload` — upload a CSV, preview, start enrichment.
- `?tab=enrichment&view=lists` (default) — all uploaded lists, newest first,
  with status and counts.
- `?tab=enrichment&view=list&listId=<id>` — one list: enrichment progress
  while it runs, then the review/edit table, then the send panel.

Sidebar placement: right after "Outbound", with a Phosphor icon such as
`AddressBookIcon` or `MagnifyingGlassPlusIcon`. The existing items aren't
changed.

---

## 4. Data model

Three new collections, plus a fourth only if calls go through our own runner
(§7.2, option C). All under `src/model/enrichment/`, all `timestamps: true`.

### Why three collections and not one

- **Enrichment results are shared across lists; list rows aren't.** The same
  person can appear in five uploads. Their FullEnrich profile should be
  stored and paid for once. Their row in each upload (which list, which row
  number, what the admin edited for this list) is per upload.
- **Profile size.** We don't know how big a FullEnrich profile is (the code
  stores it as `Mixed`), but profiles with job history and skills can easily
  be several KB each. Embedding 500 of them in one list document gets close
  to Mongo's 16MB limit for no reason. Keeping profiles in their own
  collection avoids that.
- **The review table pages, filters and edits single rows.** One document per
  row makes that simple (`find({ listId }).skip().limit()`, `updateOne` by
  `_id`). Outbound embeds recipients because nobody edits them; here they're
  the thing being edited.

The alternative, embedding rows (without profiles) in the list document the
way `outboundCampaignModel` embeds recipients, would work at 500 rows too.
It's noted, not recommended.

### 4.1 `enrichedPersonModel` — the shared enrichment store (the dedupe key)

`src/model/enrichment/enrichedPersonModel.js`. One document per normalized
email. This is what stops a second upload from paying FullEnrich again.

| Field | Type | Notes |
|---|---|---|
| `email` | String, required, **unique**, lowercased, trimmed | The dedupe key (see below). |
| `provider` | String, default `"fullenrich"` | Room for another provider later. |
| `status` | String, enum `pending`, `found`, `not_found`, `failed` | `pending` doubles as an in-flight lock (§5.4). `failed` means we don't know (API error or poll timeout), so it's retryable; `not_found` means FullEnrich finished and had no profile. |
| `profile` | Mixed, default `null` | The raw FullEnrich `profile`, stored exactly as returned, the same as the lead models do. |
| `summary` | Object | A small, flattened copy of the fields the UI and hand-off use, pulled out of `profile` when it's saved so nothing has to dig into `Mixed` later: `jobTitle`, `companyName`, `industry`, `skills: [String]`, plus whatever else the final field list (open question #12) adds, e.g. `linkedinUrl`, `location`. The four paths we know today are the ones in §2.1. |
| `error` | String, default `""` | Last error for `failed`. |
| `attempts` | Number, default 0 | How many times we've called FullEnrich for this email. |
| `providerRequestId` | String | FullEnrich's `enrichment_id`, for support/debugging. |
| `enrichedAt` | Date | When the current `status`/`profile` were set. Used if re-enrichment ever depends on age (open question #7). |
| `firstSeenListId` | ObjectId, ref `enrichmentListModel` | Which upload first caused the lookup. Audit only. |

Indexes: `{ email: 1 }` unique; `{ status: 1, updatedAt: -1 }`.

**Dedupe key: normalized email (recommended).** Lowercased and trimmed,
first *valid* address when a cell has several (`a@x.com|b@y.com`), using the
same rule as `outboundContactsService.isValidEmail`. Why email and not
something else:
- FullEnrich's lookup *is* by email (§2.1). Two rows with the same email get
  the same answer, so the email is exactly "what we paid for".
- Name + address is too fuzzy (SFR exports spell things differently), and
  phone isn't what's looked up.
- A per-upload key (list id + row) wouldn't dedupe across uploads at all,
  which is the point.

Consequences to be aware of:
- **Rows with no valid email can't be enriched**, so they never get an
  `enrichedPerson` doc. They still go into the list (they may still be
  callable) with enrichment status `no_email`.
- **Which email when a row has several?** Recommended: the first valid one,
  matching both existing parsers. Trying each email until one hits would
  find more people but can multiply FullEnrich cost per row. Open question
  #6.

### 4.2 `enrichmentListModel` — one per upload

`src/model/enrichment/enrichmentListModel.js`.

| Field | Type | Notes |
|---|---|---|
| `name` | String | Admin-given label, defaulting to the file name plus date. |
| `csvFileName` | String, default `""` | |
| `source` | String, enum `csv`, default `csv` | Room for "single contact" or other sources later. |
| `contactType` | String, enum TBD, optional | Only if the admin tags the whole upload as buyers / sellers / LLC owners. Whether this is per list, per row from a CSV column, or not at all is open question #11. |
| `status` | String, enum `queued`, `enriching`, `ready`, `failed`, `interrupted` | `ready` means enrichment is done and the list can be reviewed and sent. `interrupted` is set lazily, as in Outbound (§5.4). |
| `enrichRequested` | Boolean, default `true` | Lets an admin upload without enriching, if that's ever wanted (not planned for v1 UI). |
| `counts.total` | Number | Rows accepted into the list. |
| `counts.processed` | Number | Rows whose enrichment step is finished, whatever the outcome. |
| `counts.enriched` | Number | FullEnrich found a profile on this run. |
| `counts.reused` | Number | Already in `enrichedPerson` from an earlier upload; nothing was billed. |
| `counts.notFound` | Number | FullEnrich finished and found nobody. |
| `counts.noEmail` | Number | Row has no valid email, so enrichment wasn't attempted. |
| `counts.failed` | Number | API error or poll timeout. Retryable. |
| `parseSkipped` | `[{ row, name, reason }]` | Rows dropped at upload (empty rows, no name and no contact info, in-file duplicates). Same idea as Outbound's `parseSkipped`. |
| `createdBy.id` / `.email` / `.name` | ObjectId ref `userModel`, String, String | From `req.user`. |
| `enrichStartedAt`, `enrichFinishedAt` | Date | |
| `error` | String | If the whole job aborted. |
| `dispatches` | Array of subdocs | One entry per send from this list (§7.5): `{ channel: "call" \| "sms" \| "email", refId: ObjectId, propertyId, propertyName, rowCount, createdBy, createdAt }`. `refId` points at the `outboundCampaign` (SMS/email) or the call run (§4.4). This is the list's own "what did we send and when" log. |

Indexes: `{ createdAt: -1 }`, `{ status: 1, updatedAt: -1 }`.

### 4.3 `enrichmentListRowModel` — one per contact in an upload

`src/model/enrichment/enrichmentListRowModel.js`.

| Field | Type | Notes |
|---|---|---|
| `listId` | ObjectId, ref `enrichmentListModel`, required | |
| `rowNumber` | Number | 1-based data row from the CSV, for the admin to find it in their file. |
| `raw` | Mixed | The original CSV row, all columns, exactly as uploaded. Nothing from the source is lost even if we don't map a column. |
| `csv` | Object | What the parser pulled out of `raw`: `fullName`, `firstName`, `lastName`, `address`, `city`, `state`, `zip`, `phones: [String]` (all of them, in file order, as written), `emails: [String]` (all of them, lowercased). |
| `email` | String, lowercased | The normalized email used as the dedupe key (§4.1), or `""`. |
| `enrichment.status` | String, enum `pending`, `enriched`, `reused`, `not_found`, `no_email`, `failed` | Per-row outcome of this list's job. `reused` = found in the shared store, not billed again. |
| `enrichment.personId` | ObjectId, ref `enrichedPersonModel` | Null for `no_email`. |
| `enrichment.error` | String | For `failed`: "FullEnrich timed out after 60s", "submit failed: 401", etc. Shown in the table. |
| `enrichment.processedAt` | Date | |
| `overrides` | Object | **The admin's edits**, stored separately from both the CSV values and the FullEnrich values, so nothing is overwritten and it's always clear what was changed by hand. Same keys as the editable field list (open question #12). A key that's absent means "not edited". |
| `editedBy` / `editedAt` | `{ id, email }`, Date | Last edit. |
| `approved` | Boolean, default `false` | Only if an explicit approve step is wanted (open question #14). |
| `excluded` | Boolean, default `false` | Lets the admin drop a row from future sends without deleting it. |
| `lastSent.call` / `.sms` / `.email` | `{ at: Date, refId: ObjectId, status: String }` | The most recent send per channel, so the table can show "texted 2 days ago" and the send panel can warn about re-sends. |

Indexes: `{ listId: 1, rowNumber: 1 }` unique; `{ listId: 1, "enrichment.status": 1 }`; `{ email: 1 }`.

**What the table and the hand-off read (the "effective" value):** for each
field, `overrides[field]` if set, otherwise the FullEnrich value (from
`enrichedPerson.summary`) where one exists for that field, otherwise the CSV
value. One function, `effectiveContact(row, person)` in
`enrichmentContactsService.js`, computes it, and everything downstream (the
table, the three adapters) uses that one function. Whether FullEnrich should
ever win over the CSV for a field both have (for example a name) is part of
open question #12.

**Where edits live: on the row, not on the shared store (recommended).**
An edit fixes this contact *for this list*. It doesn't change what FullEnrich
said, and it doesn't reach into other lists the person appears in. The
alternative, writing edits back into `enrichedPerson` so every future list
sees them, is open question #13.

### 4.4 `enrichmentCallRunModel` — only if calls use our own runner

`src/model/enrichment/enrichmentCallRunModel.js`. Needed only if open
question #3 picks option C in §7.2. It mirrors the shape of
`outboundCampaignModel` so the progress UI can treat it the same way.

| Field | Type | Notes |
|---|---|---|
| `listId` | ObjectId, ref `enrichmentListModel` | |
| `status` | enum `queued`, `running`, `completed`, `failed`, `interrupted` | |
| `property` | `{ id, name, slug, address }` | Snapshot, like Outbound. |
| `phoneMode` | String, enum `all`, `first` | Open question #17. |
| `createdBy` | `{ id, email, name }` | |
| `counts` | `{ total, processed, dispatched, skipped, failed }` | Same counters `vapiCampaignService` jobs use. |
| `recipients[]` | `{ rowId, name, phones: [String], status: pending \| dispatched \| skipped \| failed, reason, researchSummaryUsed: Boolean, calls: [{ phone, success, callId, error }], processedAt }`, `_id: false` | |
| `startedAt`, `finishedAt`, `error` | | |

Indexes: `{ listId: 1, createdAt: -1 }`, `{ createdAt: -1 }`.

---

## 5. Backend plan (`viharabackend`)

### 5.1 New files

| Path | What it does |
|---|---|
| `src/model/enrichment/enrichedPersonModel.js` | §4.1. |
| `src/model/enrichment/enrichmentListModel.js` | §4.2. |
| `src/model/enrichment/enrichmentListRowModel.js` | §4.3. |
| `src/model/enrichment/enrichmentCallRunModel.js` | §4.4. Only with option C. |
| `src/services/enrichment/enrichmentContactsService.js` | CSV parsing and normalizing for this feature (§5.2), `MAX_ROWS_CEILING` (open question #10), `effectiveContact(row, person)` (§4.3), and the editable-field whitelist with per-field validation. Written fresh with `papaparse`, **not** importing `parseContactsCsv` from the calling file or the non-exported `normalizeRow` from Outbound. |
| `src/services/enrichment/fullenrichClient.js` | A new FullEnrich client for this feature (§5.3). Returns a clear outcome per email instead of `null` for everything. `shared/fullenrichService.js` is left byte-for-byte as is. Whether to add a new export there instead is open question #5. |
| `src/services/enrichment/enrichmentJobService.js` | The background job (§5.4): `startEnrichment(listId)`, the runner, per-row marking with `$inc` counters, stale detection, `resumeEnrichment(listId)`. |
| `src/services/enrichment/enrichmentListService.js` | `createList(...)`, `getList(id)` (lightweight, for polling), `listLists(page, limit)`, `getRows(listId, { page, limit, status, search })`, `updateRow(listId, rowId, patch, user)`, `setExcluded(...)`, `setApproved(...)`. |
| `src/services/enrichment/enrichmentDispatchService.js` | The hand-off to the three existing channels (§7): `selectRows(listId, rowSelection)`, `toOutboundContacts(rows, channel)`, `toCallContacts(rows)`, `dispatchSms(...)`, `dispatchEmail(...)`, `dispatchCalls(...)`, and the pre-flight check that validates every selected channel before starting any of them. |
| `src/services/enrichment/enrichmentCallRunner.js` | Only with option C (§7.2). The call loop, calling `vapiService.dispatchCall` for each phone. |
| `src/services/enrichment/researchSummary.js` | Only with option C. Builds the `prospect_research` string from the effective (edited) contact and the selected property, without the Oakland text in `shared/fullenrichService.js` line 89. The wording is open question #4. |
| `src/controller/enrichment/enrichmentController.js` | Thin handlers wrapped in `catchAsyncError`, throwing `Errorhandler` (§6). |
| `src/routes/enrichment/enrichmentRoutes.js` | `router.use(isAuthenticated, authorizeRoles("admin"))`, then §6's routes. |

### 5.2 Changes to existing backend files

| File | Change |
|---|---|
| `src/app.js` | `const enrichmentRoutes = require("./routes/enrichment/enrichmentRoutes");` and `app.use("/api/v1/enrichment", enrichmentRoutes);` next to the Outbound mount (line 126). |

That is the only required edit to an existing file. Two more are optional
and each is an open question:
- `src/model/outbound/outboundCampaignModel.js`: add `"enrichment"` to the
  `source` enum and an optional `enrichmentListId` field (open question
  #16).
- `src/services/outbound/outboundEmailService.js`: add enriched-field email
  variables (open question #18).

### 5.3 CSV parsing (`enrichmentContactsService.js`)

Same approach as the two parsers that already exist, written fresh:

- `Papa.parse(csvData, { header: true, skipEmptyLines: true })`.
- Header keys normalized once per row: trim, lowercase, collapse spaces (as
  `outboundContactsService.normalizeHeaderKey`, line 29–30).
- Aliases (a superset of both existing parsers):
  - name: `full name`, `name`, `owner name`, `owner 1 full name`; or
    `first name` + `last name` joined when there's no full-name column.
  - phones: `phones`, `phone`, `phone number`, `phone 1` … `phone N`,
    `mobile`, `cell`, `landline`.
  - emails: `emails`, `email`, `email 1` … `email N`.
  - address: `address`, `property address`, `mailing address`, `street`.
  - city, state: `city`, `property city`, `mailing city`; `state`, etc.
  - zip: `zip`, `zip code`, `zipcode`, `postal code`.

  The SFR-specific names above (`owner 1 full name`, `mailing …`, numbered
  phone columns) are guesses about what an SFR export looks like. **We need
  a real SFR sample file before this list is final** (open question #8). The
  parser should be driven by one alias table so adding a column name is a
  one-line change.
- Multi-value cells split on `|` (and `,` / `;` if the SFR sample shows
  that). All values kept in `csv.phones` / `csv.emails`; validation happens
  later, per channel, at hand-off time, because the three channels have
  different rules (§7.1).
- Every original column is kept in `raw`, so nothing SFR sends us is lost.
- A row is accepted if it has a name **or** at least one phone or email.
  Rows with none of those go to `parseSkipped` with a reason. (The calling
  parser drops rows without a Full Name; the Outbound parser doesn't
  require a name. This one follows Outbound.)
- In-file duplicates by normalized email are dropped into `parseSkipped` as
  "duplicate within this file" (rows without an email aren't deduped here).
- Over the row ceiling: the upload is rejected with a clear 400, never
  truncated, the same rule Outbound uses.

### 5.4 FullEnrich client (`fullenrichClient.js`)

Same two API calls as `shared/fullenrichService.js`, same env var
(`FULLENRICH_API_KEY`), but it returns an outcome instead of `null`:

```
lookupEmails([{ email, customId }]) →
  [{ email, customId, outcome: "found" | "not_found" | "failed",
     profile, error, providerRequestId }]
```

- `found`: status `FINISHED` and a profile.
- `not_found`: status `FINISHED` and no profile.
- `failed`: submit error, poll error, status `FAILED`, or polling ran out
  (with the reason in `error`, e.g. "timed out after 60s").
- It never throws. The job decides what to do with each outcome.
- `customId` is our row id or `enrichedPerson._id`, not the person's name
  (the current client sends `fullName` as `user_id`, line 15, which isn't
  unique).
- **Batch size is a setting.** Start at 1 (exactly what the current client
  does, known to work). If Phase 0 confirms FullEnrich accepts and returns
  batches reliably (results matched back by `custom`), raise it. Batching
  is the main lever on how long a big list takes (§5.5).
- Poll timing: 6s interval like today. The attempt limit scales with batch
  size (one 60s window is fine for one email; a batch of 50 may need
  longer). Exact numbers after Phase 0.

### 5.5 The background enrichment job (`enrichmentJobService.js`)

**State lives in Mongo, following `outboundCampaignService`, not in an
in-memory `Map` like `CAMPAIGN_JOBS`.** The requesting user explicitly wants
the results kept and visible later, and a job that can take a long time
(below) must survive a Render redeploy well enough to be resumed. The
`CAMPAIGN_JOBS` / `JOB_TTL_MS` idea still applies in two places: the job is
started after the HTTP response and polled, and old state is cleaned up
lazily on read (here, flipping stale `enriching` lists to `interrupted`,
instead of deleting finished jobs after 24h).

**Flow:**

1. `POST /lists` parses the CSV, inserts the list (`status: queued`) and all
   its rows (`enrichment.status: pending`, or `no_email` straight away),
   responds `202 { listId, total, noEmail, skipped }`, then calls
   `startEnrichment(listId)` without awaiting it (same shape as
   `vapiController.js` lines 113–117 and `outboundController.js` lines
   119–125).
2. `startEnrichment` sets `status: enriching`, `enrichStartedAt`, and walks
   the `pending` rows in `rowNumber` order.
3. For each row (or batch of rows):
   - **Check the shared store first.** `enrichedPerson.findOne({ email })`.
     - `found` or `not_found` there already: link the row, mark it
       `reused` (or `not_found`), `$inc counts.reused` (or `notFound`). No
       FullEnrich call. (Whether a stored `not_found` or an old result
       should ever be looked up again is open question #7.)
     - `pending` there (another list is looking it up right now): skip the
       row for now and come back to it at the end of the pass.
     - `failed` there, or no doc: go on to look it up.
   - **Claim it.** Upsert `enrichedPerson` for that email with
     `status: pending` using `findOneAndUpdate` on
     `{ email, status: { $ne: "pending" } }` (the unique index on `email`
     makes this safe). If the claim fails, another job has it; treat as
     above. This stops two uploads that run at the same time from paying
     for the same person twice.
   - **Look it up** with `fullenrichClient.lookupEmails`.
   - **Save the outcome** on `enrichedPerson` (`status`, `profile`,
     `summary`, `error`, `attempts +1`, `enrichedAt`), then mark the row
     (`enrichment.status`, `personId`, `error`, `processedAt`) and
     `$inc` the matching list counter plus `counts.processed`, in one
     `updateOne` each, like `outboundCampaignService.markRecipient`.
4. When no `pending` rows are left: `status: ready`, `enrichFinishedAt`.
   A thrown error that escapes the loop: `status: failed`, `error` set.

**Per-contact failures never stop the job.** A `failed` row is recorded with
its reason and the job moves on, like the calling flow's "best effort"
rule. The failed rows show in the table with the reason, and a "Retry
failed" action re-runs just those (§6).

**How long it takes.** At batch size 1, each contact is one submit plus at
least one 6s poll, so roughly 6–60s per contact. 500 contacts is somewhere
between about 50 minutes and 8 hours. That's too long for a job that dies on
every redeploy with no way back. Hence:
- **Stale detection.** A list in `enriching` whose `updatedAt` hasn't moved
  in 10 minutes becomes `interrupted` on the next read (the same
  `STALE_MS` rule as Outbound). `updatedAt` moves after every row, and one
  row takes at most about a minute, so a slow but healthy job isn't
  flagged.
- **Resume.** `POST /lists/:id/resume` restarts the runner on an
  `interrupted` list. Because every row's status is stored, it just carries
  on with the `pending` rows. Rows that were mid-lookup when the process
  died are left as `pending` on the row and `pending` on `enrichedPerson`;
  resume treats an `enrichedPerson` that's been `pending` for over 10
  minutes as abandoned and reclaims it. Outbound doesn't have resume
  because its runs are a few minutes; this one needs it.
- **Batching** (§5.4) is what would bring the time down properly. Small
  in-process concurrency (for example 3–5 lookups at once) is the fallback
  if FullEnrich doesn't batch well. Which one, and how far, depends on
  Phase 0 and is open question #10's companion (the row ceiling and the
  run time are linked).
- Auto-resume on server start is **not** planned; the codebase has no
  startup-hook pattern for this (Outbound chose not to either). An admin
  clicks Resume.

**Counts the UI shows while it runs:** `processed / total`, and the
breakdown `enriched`, `reused (no charge)`, `not found`, `no email`,
`failed`. The "reused" number is worth showing on its own because it's the
visible proof that dedupe saved money.

---

## 6. API endpoints

All under `/api/v1/enrichment`, all admin only (`isAuthenticated` +
`authorizeRoles("admin")`). JSON bodies. CSV is sent as raw text in
`csvData`, like calls and Outbound. At 500 rows that's about 100KB, well
under the 5mb body limit in `app.js` line 62; a much higher ceiling (open
question #10) would need that checked again.

| Method | Path | Purpose |
|---|---|---|
| GET | `/config` | `{ maxRowsCeiling, fullenrichConfigured: Boolean(FULLENRICH_API_KEY), editableFields: [{ key, label, type }] }`. |
| POST | `/lists/parse` | Body `{ csvData }`. **Parses only. Doesn't save, doesn't call FullEnrich.** Returns `{ total, skipped, noEmail, alreadyEnriched, toLookUp, sample: first 20 rows, headersSeen, headersUnmapped }`. `alreadyEnriched` is a count from `enrichedPerson`, so the admin sees "412 rows: 120 already enriched (no charge), 250 to look up, 42 without an email" before starting. `headersUnmapped` shows which SFR columns we didn't recognize. |
| POST | `/lists` | Body `{ csvData, csvFileName?, name?, contactType? }`. Rejects over the ceiling (400) or with no usable rows (400). Creates the list and rows, returns `202 { listId, total, noEmail, skipped }`, starts the job. |
| GET | `/lists` | Query `page=1, limit=20`. Newest first, without rows. Stale check applied. |
| GET | `/lists/:id` | The list document with counts and `dispatches`. No rows. **This is what the progress view polls** every 3s, so it stays small. Stale check applied. |
| GET | `/lists/:id/rows` | Query `page, limit (default 50, max 200), status?, search?, excluded?`. Each row comes back with its effective values, its CSV values, its FullEnrich summary, its `overrides`, and `lastSent`, so the table can show what was edited and where each value came from. |
| PATCH | `/lists/:id/rows/:rowId` | Body `{ overrides?, excluded?, approved? }`. Only whitelisted keys; each validated (email format, phone parse). Sending `null` for a key clears that override. Records `editedBy` / `editedAt`. **Doesn't start any enrichment or send** (see §7.4 for the one case to decide: an edited email). |
| POST | `/lists/:id/resume` | Restarts an `interrupted` list's job. 409 if it's already `enriching`. |
| POST | `/lists/:id/retry-failed` | Sets the list's `failed` rows back to `pending` and restarts the job. Costs FullEnrich credits again for those rows; the UI says so. |
| POST | `/lists/:id/rows/:rowId/re-enrich` | **Only if open question #7 says forced re-enrichment is allowed.** Looks the row's email up again even if it's in the store. |
| POST | `/lists/:id/dispatch/preview` | Body `{ channels: ["call","sms","email"], rowSelection, propertyId, phoneMode? }`. **Sends nothing.** For each channel, returns how many selected rows qualify and why the rest don't (§7.1), plus the setup checks (SMS list set? voice prompt written? email configured?). This is what the send panel's "Check" button calls. |
| POST | `/lists/:id/dispatch` | Body `{ channels, rowSelection, propertyId, maxContacts, sms?: { consentAttested }, email?: { subject, body, bodyFormat }, call?: { phoneMode } }`. **Validates every requested channel first. If any one fails, nothing is started** and a 400 lists every problem. Otherwise starts each channel through its existing path (§7) and returns `202 { sms?: { campaignId }, email?: { campaignId }, call?: { jobId or callRunId } }`. |
| GET | `/call-runs/:id` | Only with option C. Same lightweight/`?all=true` split as Outbound's `GET /campaigns/:id`. |

SMS and email progress after a dispatch is polled on the **existing**
`GET /api/v1/outbound/campaigns/:id`, since those are ordinary Outbound
campaigns. Call progress is polled on `GET /api/vapi/campaign/:jobId` (option
A/B) or `/call-runs/:id` (option C).

`rowSelection` is either `{ all: true, filter: { status?, excluded: false } }`
or `{ rowIds: [...] }`. Whether sending picks all rows or lets the admin tick
rows is open question #15.

Route order: `/lists/parse` is declared before `/lists/:id` so `parse` isn't
read as an id.

---

## 7. Handing off to the existing channels

This is the part that needs the most care. The three existing send paths
each expect a different contact shape and have different rules, and the
calling path has no way to accept a ready-made enrichment without an edit.

### 7.1 The shapes don't match

| | Calling (`buildContact`) | Outbound SMS | Outbound Email | Enrichment row (effective) |
|---|---|---|---|---|
| Name | `fullName` (required by its CSV parser) | `name` | `name` | `fullName` (+ first/last) |
| Phones | `phones: []`, all of them, `+1…` or `+91…` (`parsePhones`) | `phone`, **one**, US only (`toUsSmsNumber`), **required** | `phone` optional, unused | `phones: []`, as written |
| Email | `email` or `null`, optional | `email`, **required** (decision #5) | `email`, **required** | `emails: []` + primary `email` |
| Address / city / state / zip | Used (prompt variables `prospect_address`, `prospect_city`, `prospect_state`) | Not accepted | Not accepted | Kept |
| Enrichment | Only via its own `enrich: true` re-lookup, as a `researchSummary` string | No field for it | No field for it (`EMAIL_VARIABLES` is name + property only) | Stored profile + summary + edits |
| Cap | 500 hard (`MAX_CONTACTS_PER_CAMPAIGN`) | admin `maxContacts` ≤ 500 | admin `maxContacts` ≤ 500 | list ceiling (open question #10) |
| Must be set up first | Property voice prompt (422 without) | Property `brevoOutboundSmsListId`; consent checkbox | `EMAIL_USERNAME`/`EMAIL_PASSWORD` | |

What this means:
- **Not every row can go to every channel.** A row with only a UK phone can't
  be texted; a row with no email can't be texted or emailed; a row with no
  phone can't be called. The adapters handle this per channel and report the
  skipped rows with reasons, the same way Outbound's parser does.
- **Phones differ in count.** Calling dials every phone (§2.3); SMS takes one.
  How many to call is open question #17.
- **Enriched data only reaches calls**, and only through `prospect_research`.
  SMS text lives in Brevo automations (decision #11) and can't use it; email
  can't use it without changing `outboundEmailService.js` (open question
  #18). So for SMS and email, enrichment helps the admin *review and clean*
  the list, not personalize the message. That's worth being upfront about
  with the requesting user.

### 7.2 Calls: three options, none of them free

**Option A: import `createCampaign` / `runCampaign` from
`vapiCampaignService.js`, with `enrich: false`.**
- Map rows through `vapiCampaignService.buildContact` (exported) and call
  `createCampaign(contacts, { enrich: false, property, promptConfig })` then
  `runCampaign(job.id)`, with `property` / `promptConfig` from
  `resolveProperty` / `resolvePromptConfig`.
- Good: reuses the whole calling loop, pacing and job tracking exactly;
  progress polls on the existing `GET /api/vapi/campaign/:jobId`.
- Bad: **the agent gets no enrichment at all** (`prospect_research` is
  empty), which throws away the reason this feature exists for calls.
  Tracking is in memory: lost on restart, gone after 24h. Imports from
  `vapiCampaignService.js`, which `outboundplan.md` §1 treated as off-limits
  for that feature.

**Option B: the same, with `enrich: true`.**
- The agent does get a summary, but only because `runCampaign` calls
  FullEnrich **again** for every contact: double billing, and the admin's
  edits are ignored because it looks the email up fresh. The summary also
  carries the Oakland text (§2.1). **Not recommended.**

**Option C (recommended): our own small runner that calls `dispatchCall`
directly.** (`enrichmentCallRunner.js`)
- For each selected row: build the contact in exactly `buildContact`'s
  shape (`fullName, address, city, state, zip, email, phones`) from the
  effective values, build a `researchSummary` from the stored (and edited)
  enrichment and the chosen property (`researchSummary.js`), then call
  `dispatchCall(phone, contact, { researchSummary, property, promptConfig })`
  for each phone, with the same 2s / 6s gaps as `runCampaign`. `property`
  and `promptConfig` come from `resolveProperty` and `resolvePromptConfig`,
  checked in the dispatch pre-flight so a missing voice prompt fails before
  anything starts.
- No `source` passed, so `metadata.source` stays `"vihara-voice"`, the same
  as admin campaigns today (§2.4). Callbacks, caller-number rotation, the
  daily cap, prior-call memory and `CallLog` all work unchanged because
  they're inside `dispatchCall` or downstream of VAPI.
- Results persisted in `enrichmentCallRunModel` (§4.4), and on each row's
  `lastSent.call`.
- Good: the agent gets the enrichment, including the admin's corrections;
  no second FullEnrich bill; no edits to calling code; tracking survives a
  restart.
- Bad: it copies about 40 lines of loop logic from `runCampaign` (the phone
  loop and delays), so if someone later changes the pacing in
  `vapiCampaignService.js`, this copy won't follow. It also imports from
  `vapiService.js`, `vapiPropertyService.js` and `vapiPromptService.js`
  (import only, no edits).

**Option D: add a small option to `vapiCampaignService.js`** (for example
letting each contact carry its own `researchSummary`, used instead of
`safeResearchSummary`). The cleanest code, but it edits calling code, which
the requesting user has ruled out. Listed only so it's clear it was
considered.

Which option, and whether importing (not editing) calling modules is
acceptable, are open questions #2 and #3. The research summary wording for
option C (and whether it should mention the property, the contact's own
property from the CSV, their role as buyer/seller/LLC owner) is #4.

Also worth knowing whichever option is picked:
- The admin calling campaign has no consent gate today (SMS has the
  attestation checkbox; calls don't). This feature doesn't add one unless
  asked (open question #19).
- `pickCallerNumberId` returns a failure once every caller number hits its
  daily cap, so big lists may partly fail on one day. Those rows are
  recorded as `failed` with that reason; nothing retries them automatically.

### 7.3 SMS and Email: call the Outbound services directly

**Recommended: build the same `{ name, phone, email }` contacts Outbound
builds, by running the selected rows through Outbound's own exported parser,
then call `createCampaign` + `startCampaign`.**

1. Map each selected row's effective values to a plain object with the
   column names Outbound understands: `{ "full name": fullName, phones:
   phones.join("|"), emails: emails.join("|") }` (primary email first).
2. Turn the array into CSV text with `Papa.unparse` and call
   `outboundContactsService.parseContacts({ channel, csvData, maxContacts })`.
   **This runs Outbound's real validation and dedupe, unchanged:** SMS gets
   the first valid US phone and requires an email; email requires a valid
   email; in-batch duplicates are dropped. The skipped rows come back with
   Outbound's own reasons, mapped to our row ids by position.
3. Repeat the guards `outboundController.js` does, since the controller
   can't be called as a function: property exists, `validateMaxContacts`,
   `overLimit`, `total > 0`; for SMS `consentAttested === true` and
   `resolveOutboundSmsListId(property) !== null`; for email subject and body
   present. All of these use exported functions, so the rules are the same
   ones, not copies. (The one thing that is a copy is the *order* of the
   checks and their messages; about 20 lines.)
4. `outboundCampaignService.createCampaign({ channel, source: "csv",
   csvFileName: <list name>, maxContacts, property, createdBy: req.user,
   contacts, parseSkipped, sms | email })`, then `startCampaign(id)`
   without awaiting.
5. Push a `dispatches` entry on the list and set `lastSent.sms` /
   `lastSent.email` on the rows.

Why this way:
- **Nothing in Outbound changes.** No edits to `outboundContactsService.js`,
  `outboundCampaignService.js` or the controller. The SMS and email runners,
  the Brevo remove-then-add, `sendEmailAsync`, stale detection: all exactly
  as they are.
- **The campaign shows up in Outbound → History** like any other, and
  progress can use the existing `CampaignProgress` component and
  `GET /api/v1/outbound/campaigns/:id`.

The friction:
- **The campaign doesn't know it came from an enrichment list.** It's
  recorded with `source: "csv"` and `csvFileName` set to the list's name.
  The link back exists only on our side (`dispatches[].refId`). Adding an
  `"enrichment"` source value and an `enrichmentListId` field to
  `outboundCampaignModel.js` would fix that, but it's an edit to an
  Outbound file (open question #16).
- **Round-tripping through CSV text is a bit indirect.** The alternative is
  exporting `normalizeRow` from `outboundContactsService.js`, which is also
  an edit. The CSV round trip keeps Outbound untouched and the data is
  small, so it's the recommendation.
- **SMS consent is still the admin's statement.** The send panel shows the
  same required checkbox as `SmsLauncher.jsx`, and the same TCPA caveat
  from `outboundplan.md` §4 applies. Enrichment doesn't change consent.

### 7.4 What editing does and doesn't do

- Editing a field saves it to `overrides` on that row. Nothing else happens:
  no enrichment, no send, no change to other lists or to `enrichedPerson`.
- Sends read the effective values at the moment the admin clicks Send.
  Edits after that don't change a campaign already started (Outbound
  snapshots recipients into the campaign document; option C's call run
  does the same).
- **The one case to decide: the admin changes a row's email.** The stored
  enrichment belongs to the *old* email. Options: keep showing the old
  enrichment with a "may be stale" marker; clear it and show "not enriched";
  or offer a "look up new email" button (costs a credit). Part of open
  question #7.

### 7.5 Several channels at once

- The admin ticks any of Call / SMS / Email, picks one property, and fills in
  what each ticked channel needs (SMS consent; email subject/body with the
  existing `EmailComposer`; call phone mode).
- **All ticked channels are validated before any starts** (§6
  `/dispatch`). A half-sent list (texts gone out, emails refused because of
  a missing subject) is worse than a clear error.
- Once started, each channel runs on its own runner at its own pace:
  emails in seconds, SMS in a few minutes, calls over hours at 6s+ per
  contact. So in practice someone may get the text and email long before
  the call. Whether that's fine, or channels should be staggered or run one
  after another, is open question #19.
- Whether one property per dispatch is right (vs. a list being tied to one
  property at upload) is open question #11.

---

## 8. Frontend plan (`vihara-new-website`)

### 8.1 New files

| Path | What it does |
|---|---|
| `src/api/enrichment.api.js` | Thin `apiClient` calls for §6. Separate file, like `outbound.api.js`. |
| `src/services/enrichment.service.js` | Wraps the API, unwraps `data`, light client-side guards. |
| `src/components/AdminPanel/Enrichment/EnrichmentHub.jsx` + `EnrichmentHub.css` | The page for `?tab=enrichment`, with the `view` / `listId` params from §3, updated with the functional `setSearchParams` form (as `OutboundHub.jsx` lines 42–49). Loads `/config` once. CSS prefix `enx-`, same design tokens as `OutboundHub.css` lines 1–11. |
| `src/components/AdminPanel/Enrichment/ListUpload.jsx` | "Choose .csv" (FileReader) or paste, an optional list name, then "Check file" → `/lists/parse`, showing: rows found, already enriched (no charge), to look up, no email, skipped (collapsible table), columns we didn't recognize, and the first 20 rows. Then "Start enrichment" with a confirm showing the lookup count ("Look up 250 contacts on FullEnrich? 120 more are already enriched and won't be charged."). Written fresh; doesn't reuse `ContactTargeting.jsx`, which is tied to SMS/email channel rules. |
| `src/components/AdminPanel/Enrichment/EnrichmentProgress.jsx` | Status pill, progress bar, `processed / total`, and the five counts from §5.5. "Resume" when `interrupted`. "Retry failed" when done with failures. |
| `src/components/AdminPanel/Enrichment/useEnrichmentPolling.js` | Same shape as `Outbound/useCampaignPolling.js` (3s, cleanup on unmount), polling `GET /lists/:id`, stopping on `ready | failed | interrupted`. Written as a copy rather than a generalization, so the Outbound hook stays untouched. |
| `src/components/AdminPanel/Enrichment/ListsTable.jsx` | Paginated table of lists: date, name, created by, status, total, enriched, reused, failed, sends so far. Click opens the list. |
| `src/components/AdminPanel/Enrichment/ListDetail.jsx` | Shows `EnrichmentProgress` while enriching; once `ready`, the review table and the send panel. Also shows the list's `dispatches` log with links to each campaign's progress. |
| `src/components/AdminPanel/Enrichment/ReviewTable.jsx` | The review/edit table (§8.3). |
| `src/components/AdminPanel/Enrichment/RowEditor.jsx` | Side panel or modal for editing one row: each editable field showing its CSV value, its FullEnrich value, and the current effective value, with a "reset to original" per field. Saves with `PATCH`. |
| `src/components/AdminPanel/Enrichment/SendPanel.jsx` | Channel checkboxes, a property picker (imports `Outbound/OutboundPropertyPicker.jsx` as-is), max contacts, per-channel inputs: SMS consent checkbox and list status; `Outbound/EmailComposer.jsx` imported as-is for email; phone mode for calls. "Check" calls `/dispatch/preview` and shows per-channel ready/skipped counts and setup problems. "Send" shows one confirm listing everything that will happen, then calls `/dispatch`. |
| `src/components/AdminPanel/Enrichment/DispatchProgress.jsx` | After a send: for SMS and email, renders `Outbound/CampaignProgress.jsx` (imported as-is) per campaign id; for calls, a small progress view on `/call-runs/:id` (option C) or on `GET /api/vapi/campaign/:jobId` (option A). |

### 8.2 Changes to existing frontend files (additive)

| File | Change |
|---|---|
| `src/components/AdminPanel/Core/adminPanel.jsx` | Import `EnrichmentHub`, add `'enrichment'` to `VALID_TABS`, add `{mainContent === 'enrichment' && <EnrichmentHub />}`. |
| `src/components/AdminPanel/Core/adminPanelSidebar.jsx` | One new `<li>` after "Outbound" calling `navTo('enrichment')`, with a Phosphor icon. |

Nothing under `AdminPanel/Calls/` or `AdminPanel/Outbound/` is edited.
`OutboundPropertyPicker`, `EmailComposer` and `CampaignProgress` are
imported, not changed. Whether importing Outbound components is fine (vs.
copying them) is part of open question #2.

### 8.3 The review/edit screen

- **Columns (proposed, final list is open question #12):** row #, name,
  primary email, phones, city/state, contact type, job title, company,
  industry, enrichment status (enriched / reused / not found / no email /
  failed + reason), edited marker, last sent per channel.
- **Filters:** enrichment status, edited / not edited, excluded, "can be
  texted" / "can be emailed" / "can be called" (from the same rules the
  adapters use). A search box on name/email.
- **Paging:** server-side, 50 rows a page.
- **Editing:** click a row to open `RowEditor`. Inline editing in the table
  is possible later but a panel is simpler to build and to show "CSV said
  X, FullEnrich said Y, you set Z".
- **Saving:** one `PATCH` per row on Save. No autosave, no bulk edit in v1.
- **Exclude:** a per-row toggle so the admin can drop bad rows from sends
  without deleting them.
- **Approve:** only if open question #14 says an explicit approve step is
  wanted. If so, a per-row checkbox plus "approve all on this page", and
  sends only take approved rows.
- **Editing doesn't re-trigger anything** (§7.4).

---

## 9. Phased build order

Each phase ends with something that works and has been checked. Standing
rules apply: **no real FullEnrich lookup, SMS, email or call to anyone other
than the requesting user's own contacts without asking first** (FullEnrich
lookups cost credits too), and **nothing is pushed without an explicit
go-ahead**.

Why this order: the data model and parser come first because every later
piece reads them. The enrichment job comes before any UI so the UI is built
against real stored results, not mocks. Review/edit comes before sending
because sending reads the edited values. Within sending, email and SMS go
first because they reuse Outbound's services with no open questions about
calling code; calls go last because they depend on the most open questions
(#2, #3, #4, #17).

### Phase 0: Checks and inputs (no code)

- Get a real SFR export (a few rows, anonymized if needed) to settle the
  header aliases (open question #8).
- Check against FullEnrich's docs or support, with the requesting user's
  permission for any live test: the maximum batch size of the reverse-email
  bulk endpoint; whether results are matched back by `custom`; how long a
  batch usually takes; rate limits; and **how billing works** (is a
  not-found lookup charged? is a repeat lookup of the same email charged?).
  The answers set the batch size, the run time and the value of dedupe.
- Get answers to the open questions in §12, at least #1–#4, #6, #7, #10,
  #12 and #14, before Phase 1.

### Phase 1: Backend foundations (no FullEnrich, no sends)

- The three models (not the call-run model yet), `enrichmentContactsService`
  (parser, aliases, ceiling, `effectiveContact`, editable-field whitelist),
  `enrichmentListService`, the controller with `getConfig`, `parseList`,
  `createList` (with enrichment switched off, rows stay `pending`),
  `listLists`, `getList`, `getRows`, `updateRow`, the routes and the
  `app.js` mount.
- Check with curl and an admin cookie: the SFR sample, a PropStream-shaped
  file, a lead-list-shaped file, a file with junk and duplicate rows, a file
  over the ceiling (400). Editing, clearing an override, excluding. A
  non-admin gets 403.

### Phase 2: Enrichment job

- `fullenrichClient`, `enrichmentJobService` (claim/lock, store-first
  lookup, per-row marking, stale detection, resume, retry-failed).
- Check (with permission, on the requesting user's own email and one or two
  known-good test emails): found, not found, no email, a forced failure (bad
  API key in local env only) shows every row `failed` with the reason, then
  retry-failed with the right key fixes them. Upload the same file again:
  every row is `reused` and **no FullEnrich call is made** (check the
  logs). Two lists with the same email started together only look it up
  once. Kill the server mid-run: the list shows `interrupted`, Resume
  finishes it.

### Phase 3: Frontend upload, progress, lists, review/edit

- `enrichment.api.js`, `enrichment.service.js`, `EnrichmentHub`,
  `ListUpload`, `EnrichmentProgress`, `useEnrichmentPolling`, `ListsTable`,
  `ListDetail`, `ReviewTable`, `RowEditor`, sidebar and `adminPanel.jsx`
  wiring.
- Check: the parse preview numbers match the backend; progress updates
  every 3s and stops at `ready`; the table pages and filters; edits save and
  show as edited; reset clears them; a deep link to one list works.

### Phase 4: Send to Email and SMS

- `enrichmentDispatchService` (row selection, the Outbound adapter,
  pre-flight, `dispatches` log, `lastSent`), `/dispatch/preview`,
  `/dispatch` for `sms` and `email`. `SendPanel` and `DispatchProgress`
  (Outbound components imported as-is).
- Check: preview counts match what Outbound's parser would say for the same
  rows; one email to the requesting user's own inbox using an edited name;
  one SMS to their own phone on a property with an outbound list; both
  campaigns appear in Outbound → History; SMS without consent and SMS on a
  property without a list are refused by UI and API; ticking both SMS and
  email with a missing subject starts **neither**.

### Phase 5: Send to Calls

- Whichever option §7.2 ends up with. For option C:
  `enrichmentCallRunModel`, `enrichmentCallRunner`, `researchSummary`,
  `/call-runs/:id`, the call part of `SendPanel` and `DispatchProgress`.
- Check (the requesting user's own phone only, with permission): the call
  goes out with the right property and prompt; the VAPI call shows
  `prospect_research` built from the stored and edited enrichment, with no
  Oakland text; **no FullEnrich call is made at dispatch time**; a property
  with no voice prompt is refused before anything starts; phone mode
  behaves as decided; the call shows up in the Voice Agent dashboard as
  normal (it reads `CallLog`, which the webhook fills).
- Re-check nothing under `src/services/calling/` or
  `src/components/AdminPanel/Calls/` changed (`git diff --stat` on those
  paths is empty).

### Phase 6: Polish

- Empty, loading and error states; the list's dispatch log with links;
  "last sent" warnings in the send panel ("37 of these were texted in the
  last 7 days"); CSS tidy.

### Phase 7: Future (not now)

- Using the shared enrichment store from the lead-form controllers too, so
  a lead who registers after being in an uploaded list isn't looked up
  again.
- Enriched fields as email variables and Brevo attributes.
- A real job queue if runs get long or the API runs on more than one
  instance.
- Folding the calling CSV upload onto enrichment lists (only if the calling
  code is ever opened up again).

---

## 10. Env vars

**No new env vars.** `FULLENRICH_API_KEY` is reused. The row ceiling, batch
size, poll interval and stale timeout are code constants, like
`MAX_CONTACTS_CEILING` in Outbound, so changing them is a deliberate code
change.

---

## 11. Risks and known gaps (noted, not designed for now)

- **Cost.** A 500-row list can be up to 500 FullEnrich lookups. Dedupe
  helps on repeat uploads, not the first. The parse preview's "to look up"
  count is the admin's only warning. Whether there should be a hard cap on
  lookups per list or per day is part of open question #10.
- **Long runs in the web process.** Even with resume, a multi-hour job on a
  single Render instance is fragile. Batching is the fix if FullEnrich
  supports it; a job queue is the long-term fix.
- **Personal data.** This stores enriched profiles of people who never
  signed up with us, indefinitely. There's no delete or retention rule in
  this plan yet (open question #21).
- **Consent.** Same TCPA and CAN-SPAM gaps as Outbound (`outboundplan.md`
  §10): SMS relies on the admin's attestation, SMS opt-out is per Brevo
  list, email has no unsubscribe check or link. Calls from admin campaigns
  have no consent gate today. This feature makes it easier to send to large
  cold lists on all three channels at once, which makes those gaps matter
  more.
- **Known issue left alone:** `buildResearchSummary` in
  `shared/fullenrichService.js` hardcodes "Oakland" (line 89), so today's
  calling CSV campaigns with enrichment on pitch Oakland in the research
  line whatever property is picked. Not fixed here (existing code); option
  C avoids it for this feature's calls.
- **Known issue left alone:** the lead-form controllers pass `phone` to
  `enrichPerson`, which ignores it, and three lead models describe their
  `enrichment` field as a "reverse-email/phone profile". Only email is ever
  looked up.

---

## 12. Open questions for the requesting user

None of these are decided. Where the plan recommends something, it's marked
"Recommended"; it's still a question until answered.

1. **Branch.** Start from backend `ogdensburg-outbound` (Outbound PR #3 still
   open) or from `main` after that PR merges? And a new branch name for both
   repos (for example `contact-enrichment`)?
2. **"Untouched" and imports.** Is it OK for the new feature to *import*
   (never edit) calling modules (`vapiService.dispatchCall`,
   `vapiPropertyService.resolveProperty`, `vapiPromptService.resolvePromptConfig`,
   and for option A `vapiCampaignService`)? Outbound treated
   `vapiCampaignService.js` as off-limits even for imports. There's no way
   to start calls without importing something from the calling side. Same
   question for importing (not editing) Outbound's `OutboundPropertyPicker`,
   `EmailComposer`, `CampaignProgress` and its services.
3. **How calls are started (§7.2).** A: reuse the calling campaign with
   enrichment off (agent gets no enrichment). B: reuse it with enrichment on
   (pays FullEnrich twice, ignores edits). C: our own small runner around
   `dispatchCall` using the stored, edited enrichment. **Recommended: C.**
4. **Research summary for calls.** If C: what should the `prospect_research`
   text say? Which fields (title, company, industry, skills, their role as
   buyer/seller/LLC owner, their own property address from the CSV), and
   what closing instruction, now that it must not mention Oakland?
5. **FullEnrich client.** A new client file for this feature (recommended,
   leaves `shared/fullenrichService.js` completely untouched), or a new
   additive export in `shared/fullenrichService.js` that returns
   found / not found / failed?
6. **Which email is the key, and how many to try.** When a row has several
   emails, look up only the first valid one (recommended, one credit per
   row), or try each until one hits (more matches, more cost)?
7. **Re-enrichment rules.** When a contact is already in the store:
   always reuse it (recommended default), or look it up again if the result
   is older than some age? Should a stored "not found" ever be retried? Should
   the admin be able to force a fresh lookup on a row? And when the admin
   edits a row's email, what happens to the old enrichment (keep with a
   "may be stale" note, clear it, or offer a paid re-lookup)?
8. **SFR file format.** Can you share a sample SFR export (a few rows,
   anonymized is fine)? The header aliases in §5.3 are guesses until then.
   Specifically: how are owner names, multiple phones, multiple emails, and
   buyer/seller/LLC columns laid out?
9. **Existing enrichment data.** Should the new store be seeded from the
   `enrichment` blobs already saved on the lead models (PersonaLead,
   NorCal, Partner, Property leads, etc.) so those people aren't paid for
   again? Or start empty?
10. **Size cap.** Is there a maximum rows per list, like the 500 for calling
    and Outbound? Should it be the same 500 so a whole list fits in one
    campaign on any channel, or higher (you said CSVs can be several
    hundred rows)? And should there be a cap on FullEnrich lookups per list
    or per day, as a cost guard?
11. **Contact type and property.** Should each contact be tagged as buyer /
    seller / LLC owner? If so, does that come from a CSV column, or does the
    admin pick one type for the whole upload? And is a list tied to one
    property when it's uploaded, or is the property only picked at send time
    (recommended, so one list can be used for several properties)?
12. **Review/edit fields.** Which fields go in the table and which are
    editable? Proposed: name, primary email, phones, address/city/state/zip,
    contact type, job title, company, industry, notes. Anything to add
    (LinkedIn URL, skills, location) or drop? When CSV and FullEnrich both
    have a value (for example name), which should show by default?
13. **Where edits live.** Only on this list's row (recommended), or also
    written back to the shared enrichment store so every future list shows
    the corrected values?
14. **Approval step.** Does a row need an explicit "approved" state before it
    can be sent, or is "not excluded" enough (the admin reviews, excludes
    bad rows, and sends the rest)?
15. **What gets sent.** When sending, does it go to all non-excluded rows
    that qualify for the channel, or does the admin tick specific rows (or
    filter, e.g. "only enriched")?
16. **Outbound campaign link-back.** SMS/email campaigns started from a list
    will be recorded in Outbound as `source: "csv"`. Is that fine, or should
    we make a small additive change to `outboundCampaignModel.js` (a new
    `"enrichment"` source value and an `enrichmentListId` field) so Outbound
    History shows where they came from? That's an edit to an Outbound file.
17. **Phones for calls.** When a row has several phones: call all of them
    one after another (what the calling campaign does today), only the
    first valid one, or let the admin pick per row?
18. **Enriched data in emails.** Should enriched fields (company, job title,
    etc.) be usable as `{{variables}}` in emails? That needs an additive
    change to `outboundEmailService.js` (Outbound code). Not in v1 unless
    you say so. (SMS text lives in Brevo automations, so it can't use them
    either way.)
19. **Sending to several channels at once.** When Call + SMS + Email are all
    ticked, start them all at the same moment (people may get the text and
    email hours before the call), or stagger them / run one after another?
    And should calls from this feature require a consent checkbox like SMS
    does (the calling campaign has none today)?
20. **Naming.** What should the sidebar entry be called ("Enrichment",
    "Contact Lists", "Prospect Lists", something else), and where in the
    sidebar (proposed: right after Outbound)?
21. **Retention and deletion.** Can an admin delete a list? Should deleting
    a list also delete stored enrichment for people who aren't in any other
    list? Is there a retention period for enriched profiles of people who
    never signed up?
22. **Upload without enriching.** Should the admin be able to upload a list
    and skip FullEnrich (just review and send), or is enrichment always on
    for this feature?

---

## 2026-09-26: Plan written

First version of this plan, written after reading the FullEnrich client and
every place it's called, the calling campaign service and controller,
`dispatchCall`, the whole Outbound backend and frontend, and
`outboundplan.md` / `outbound.md`. Nothing built yet.

Main findings that shaped it:
- FullEnrich lookup is by email only, and the current client returns `null`
  for every kind of failure, so this feature gets its own client that says
  found / not found / failed, and uses normalized email as the dedupe key.
- The calling campaign can't accept a stored enrichment without an edit to
  `vapiCampaignService.js`, so calls need either a small runner around
  `dispatchCall` or to give up the enrichment (open question #3).
- `buildResearchSummary` hardcodes Oakland, so it can't be reused for this
  feature's calls.
- Outbound's services can be driven directly (`parseContacts` +
  `createCampaign` + `startCampaign`) with no edits to Outbound, at the cost
  of those campaigns being recorded as `source: "csv"`.
- A 500-row list can take hours at one lookup at a time, so job state goes
  in Mongo with stale detection and a Resume action, not in memory.

22 open questions are in §12.

## Fill in what has changed each time we come back to this

Same pattern as `outboundplan.md` and `outbound.md`: read the sections above,
then add a new dated entry saying what changed. That includes answers to
§12, phases completed, and any deviations from this plan.
