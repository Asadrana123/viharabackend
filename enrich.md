# Contact Enrichment Lists: Implementation Plan

Companion to `outboundplan.md` and `outbound.md` in this repo. Those two stay
the source of truth for the Outbound SMS + Email feature and its decisions.
This file plans a **new, separate** feature that sits next to it.

Repos: backend `viharabackend` and frontend `vihara-new-website`. Both are
built on a branch called **`enrich-contacts`**, cut from the latest `main`
(decision #1). On the backend that `main` (`272d5c8`) already includes the
Outbound backend (`src/services/outbound/`, `src/model/outbound/`), so the
old `ogdensburg-outbound` branch isn't needed. This plan file is already
committed on the backend branch.

**Status (2026-09-26): plan revised, nothing built. All 22 questions the
first draft asked are answered by the requesting user (§12), a real SFR
export has been reviewed (§2.7), and the enrichment mechanism has changed
from reverse-email lookup to FullEnrich's name + company lookup (§2.8). The
plan is ready to build, starting with the Phase 0 checks in §9.**

---

## 1. Summary

A new admin feature for turning a raw contact CSV into a reviewed, enriched
contact list that can then be sent to the existing channels.

1. **Upload once.** The admin uploads a CSV of buyers, sellers and LLC owners
   (an "SFR" export). The real export's columns are `Full Name, Address,
   City, State, Zip Code, Phones, Emails, Active Market, Company` (§2.7).
   Header matching is flexible, the same way `parseContactsCsv` and
   `outboundContactsService` already are.
2. **Enrich in the background.** The backend sends every contact to
   FullEnrich as a background job, looking each one up by **first name +
   last name + company name**, up to 100 contacts per request (§2.8). The
   few rows that have an email but no usable name + company fall back to
   the reverse-email lookup the codebase already uses. The upload request
   returns right away with a list id, and the UI polls for progress.
   Enrichment is always on (decision #22).
3. **Persist the results.** Every enrichment result is saved in Mongo, keyed
   by normalized name + company (email as a second key when a row has one),
   so the same person isn't looked up (and billed) again the next time they
   show up in a CSV. This is a deliberate change from the calling flow,
   which throws its enrichment away after one call.
4. **Review and edit.** When enrichment finishes, the admin gets a table of
   the contacts with what FullEnrich returned next to what the CSV said, and
   can correct fields by hand or exclude rows.
5. **Send to any mix of channels.** From the reviewed list, the admin can
   start a call campaign, an SMS campaign and/or an email campaign, in any
   combination, all starting together. Each channel is handed off to its
   **existing** send path: `dispatchCall` (through a small new runner) for
   calls, and `outboundCampaignService` (which drives `outboundSmsService` /
   `outboundEmailService`) for SMS and email. No new send logic.

### What this feature is not

These are hard constraints, from the requesting user and carried over from
the Outbound project:

- **The calling agent's code stays unedited.** No edits to anything under
  `src/services/calling/`, `src/controller/calling/`, `src/routes/calling/`,
  `src/model/calling/`, or frontend `src/components/AdminPanel/Calls/`. That
  includes `vapiCampaignService.js`, `vapiController.js`, `vapiRoutes.js`,
  `vapiService.js`, `CallLauncher.jsx` and `VoiceAgentDashboard.jsx`.
  Checked 2026-09-26: the Outbound build kept to this (`outboundContactsService.js`
  lines 7–11 and `ContactTargeting.jsx` lines 6–7 say so in comments, and
  nothing under `src/services/outbound/` requires a calling file).
  **Importing** from calling modules is allowed (decision #2): this feature
  imports `dispatchCall` and `parsePhones` from `vapiService.js`,
  `resolveProperty` from `vapiPropertyService.js` and `resolvePromptConfig`
  from `vapiPromptService.js`, and never edits them.
- **The existing Outbound SMS/Email contact targeting stays untouched.**
  `ContactTargeting.jsx`, `SmsLauncher.jsx`, `EmailLauncher.jsx`,
  `outboundContactsService.js` and the `/api/v1/outbound/*` endpoints keep
  working exactly as today. The requesting user: "leave it untouched for now.
  let it sit alongside." The Outbound frontend components this feature reuses
  (`OutboundPropertyPicker`, `EmailComposer`, `CampaignProgress`) are
  imported, not edited (decision #2).
- **The existing calling CSV upload stays untouched.** `CallLauncher`'s CSV
  campaign mode keeps enriching on the fly (when its checkbox is ticked) and
  keeps throwing the result away. This feature doesn't change that or
  replace it.
- **No code integration with SFR.** SFR is only where the CSV comes from. The
  admin exports it by hand and uploads it. Nothing to build for the source.
- **Additive only.** New files, new collections, new routes, one new sidebar
  entry. Two existing Outbound backend files get small additive changes,
  both decided by the requesting user: `outboundCampaignModel.js`
  (decision #16, plus a per-recipient field for decision #18) and
  `outboundEmailService.js` (decision #18). Details in §5.2.

---

## 2. What the research found (facts the plan depends on)

These come from reading the code, not guessing. Line numbers are as of
2026-09-26.

### 2.1 The existing FullEnrich client (`src/services/shared/fullenrichService.js`)

This is what the codebase uses today. This feature doesn't edit it and
doesn't use it (decision #5); it's described here because the new client
copies its known-good parts and avoids its problems.

- **Lookup is by email only.** `enrichPerson(person)` (lines 62–72) returns
  `null` straight away if `person.email` is missing (line 63). Several lead
  controllers pass a `phone` too (`norCalLeadController.js` lines 159–163,
  `propertyLeadController.js` lines 167–171), and three lead models describe
  the field as a "reverse-email/phone profile", but the phone is never sent.
  **So with this client, a contact with no email can't be enriched at all.**
  The real SFR sample (§2.7) has no emails on any row, which is why this
  feature uses a different FullEnrich endpoint (§2.8).
- **Two-step API.** Base URL `https://app.fullenrich.com/api/v2` (line 4).
  `submitEnrichment` (lines 9–29) does `POST /contact/reverse/email/bulk`
  with a `data` array holding **one** email, and `custom.user_id` set to the
  person's full name (line 15). Then `getEnrichmentResult` (lines 32–59)
  polls `GET /contact/reverse/email/bulk/{id}` up to 10 times, 6s apart (the
  log line at 51 says "waiting 3s" but the delay at 52 is 6000ms). Worst
  case per contact is about 60s.
- **Every kind of failure comes back as the same `null`.** No email, submit
  failed, the job came back `FAILED`, a poll errored, 10 polls ran out, or
  FullEnrich finished and found nobody (`data[0].profile` missing): all
  return `null`. **A caller can't tell "not found" from "broken".** For a
  persisted, per-contact status that the admin can act on, the new feature
  needs to tell these apart (§5.4).
- **The endpoint is a bulk endpoint, but we use it one email at a time.**
- **What the profile looks like.** Our code only ever reads four paths from
  the reverse-email profile (`buildResearchSummary`, lines 79–86):
  `employment.current.title`, `employment.current.company.name`,
  `employment.current.company.industry.main_industry`, and `skills[]`.
  Everything else in the profile is unknown to the codebase. The lead models
  store the whole thing as `enrichment: { type: Mixed }`.
- **`buildResearchSummary` is hardcoded to Oakland.** Line 89 appends "…connects
  their profile to the **Oakland** investment property opportunity" to every
  summary, and line 76 says "They own property at ${address}" for everyone.
  This feature's calls don't use it; they use their own `researchSummary.js`
  built around the property picked at send time (decision #4). The shared
  function stays as it is (existing code, and the standing rule is not to
  fix known bugs in passing).
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
calling FullEnrich again. **The new store starts empty; it is not seeded
from these blobs** (decision #9). Those blobs are reverse-email profiles
keyed by email anyway, so they wouldn't line up with the name + company key.

### 2.3 The calling side (`src/services/calling/vapiCampaignService.js`), read only

- **Contact shape.** `buildContact(raw)` (lines 25–33) returns
  `{ fullName, address, city, state, zip, email | null, phones: [] }`.
  `phones` goes through `vapiService.parsePhones` (`vapiService.js` lines
  229–243), which splits on `|`, strips everything but digits, and accepts
  10-digit, 11-digit-with-1, and 12-digit-with-91 numbers (so Indian numbers
  pass). Both phone styles in the SFR sample (`3158690600` and
  `(937) 277-5374`) come out as `+1…`.
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
  (lines 8–9). An SFR row with three phones means three calls. This
  feature does the same (decision #17).
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
  is why calls go through a small new runner around `dispatchCall` instead
  (§7.2, decision #3).

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
  of `{ name, phone, email }`. `createCampaign` builds each recipient from
  exactly `name`, `email`, `phone` (lines 82–87) and saves the document
  before returning it.
- **The campaign record has no field for "where this came from" beyond
  `source: "single" | "csv"`** (`outboundCampaignModel.js` line 49), and the
  recipient subdocument (lines 14–30) has only `name`, `email`, `phone`,
  `status`, `reason` and SMS flags. Decision #16 adds `"enrichment"` to the
  enum and an `enrichmentListId` field; decision #18 needs a place on the
  recipient for enriched values (§5.2).
- **Campaign tracking is in Mongo, not in memory**, with lazy stale
  detection: a `running` campaign whose `updatedAt` is over 10 minutes old
  flips to `interrupted` on read (`outboundCampaignService.js` lines 19–42).
  This is the model the enrichment job copies (§5.5).
- **Email variables are fixed.** `EMAIL_VARIABLES` (`outboundEmailService.js`
  lines 16–28) are contact name plus property fields. `buildRecipientVars`
  (lines 45–57) only reads `contact.name`, and the email runner passes it
  the campaign's recipient subdocument (line 84). Enriched fields reaching
  an email (decision #18) therefore needs a small additive change to this
  file and to the recipient schema (§5.2).
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
  `channel, value, onChange`. All three are imported as-is (not edited) by
  the new screen (decision #2).
- The API layer is one file per domain: `src/api/outbound.api.js` wrapped by
  `src/services/outbound.service.js`.

### 2.7 The real SFR export (`Leadlist-Ogd - AI Call List.csv`, 20 rows)

Reviewed 2026-09-26. Headers, exactly:
`Full Name,Address,City,State,Zip Code,Phones,Emails,Active Market,Company`.

- **0 of 20 rows have an email.** The `Emails` column is blank on every row.
- **20 of 20 have a `Full Name`, a `Company` and a `Phones` value.** The
  companies are LLCs and similar ("NORTHERN VIEW PROPERTIES LLC",
  "ZJ PROPERTY MANAGEMENT LLC", "PENNYMAC SERVICES INC"), in capitals.
- **Only 4 of 20 have Address / City / State / Zip.** Some of those have
  leading spaces (`" WARREN"`, `" NY"`), so every value is trimmed.
- **One phone per row**, in two styles: bare `3158690600` and
  `(937) 277-5374`. No `|`-separated lists in this sample, but the parser
  still splits on `|` since the calling parser and Outbound both do.
- **`Active Market`** is a metro label, e.g. `"Massena-Ogdensburg, NY"` or
  `"New York-Newark-Jersey City, NY-NJ"` (quoted because of the comma).
- No buyer / seller / LLC-owner column. Contact type is optional per row
  (decision #11), so on this file every row is `unknown`.

What it means for the design:
- **Reverse-email lookup can't work on this data.** Nothing to look up by.
  The old premise of this plan (email-keyed, one lookup at a time) is
  replaced by the name + company lookup in §2.8.
- **Company is now a key field**, not an extra: it's half of the FullEnrich
  lookup and half of the dedupe key (§4.1).
- **SMS and email reach depends entirely on FullEnrich finding an email.**
  Outbound SMS needs a US phone *and* an email, and Outbound email needs an
  email. With no CSV emails, a row can only be texted or emailed if
  enrichment found one. Calls don't depend on enrichment (every row has a
  phone).

### 2.8 FullEnrich's name + company bulk endpoint (from `docs.fullenrich.com`)

Fetched from FullEnrich's own docs (request side only; see the note on the
response at the end).

- **`POST https://app.fullenrich.com/api/v2/contact/enrich/bulk`**, same
  base URL and same API key as the reverse-email endpoint we already use.
- Required body fields: `name` (a label for the batch, shown in FullEnrich's
  dashboard), `data` (array, **1–100 contacts per request**), and
  `enrich_fields` (array, what to retrieve).
- Each contact is one of two shapes:
  - **`first_name` + `last_name` + (`domain` or `company_name`)**: this is the
    one that fits SFR rows. Split `Full Name` into first/last, pass `Company`
    as `company_name`.
  - `linkedin_url` (standard or Sales Navigator). Not used; SFR has none.
- Optional: `custom` per contact (metadata, all string values, about 10–20
  keys, 100 chars per value), `webhook_url` (fires when the batch finishes),
  `webhook_events.contact_finished` (fires per contact), and a `silentFail`
  query param (skip invalid contacts instead of failing the whole batch).
- Response: `200 { "enrichment_id": "<uuid>" }`. Results by
  `GET /contact/enrich/bulk/{enrichment_id}`. FullEnrich prefers webhooks
  and calls polling "not recommended", but polling works, and it's the same
  pattern as the reverse-email endpoint the codebase already polls.
- **Billing, only on a found match:** work email 1 credit, personal email
  3 credits, mobile phone 10 credits. Not-found lookups cost nothing.
- Rate limit: a `429` with a retry-after style message when exceeded.

What we request: **email only** (see §12, "Fields requested"). SFR rows
already carry a phone for free, and a mobile-phone lookup costs 10× an
email, so phones aren't requested.

**What isn't confirmed yet:** only the request side was fetched. The exact
shape of a finished `GET /contact/enrich/bulk/{id}` response (the status
field and its values, where each contact's emails sit, whether our `custom`
comes back on each result, whether job title / company / industry / LinkedIn
come back when only email is requested) and the exact `enrich_fields`
identifier strings are **Phase 0 checks** (§9). This plan names them
generically ("the found work email", "status finished") rather than
guessing field names.

---

## 3. Layout

**A new top-level sidebar entry, `?tab=enrichment`, labelled
"Enrichment", placed right after "Outbound"** (decision #20). Not a fourth
tab inside Outbound.

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

Sidebar: one new `<li>` right after "Outbound", with a Phosphor icon such as
`AddressBookIcon` or `MagnifyingGlassPlusIcon`. The existing items aren't
changed.

---

## 4. Data model

Four new collections, all under `src/model/enrichment/`, all
`timestamps: true`.

### Why separate collections and not one

- **Enrichment results are shared across lists; list rows aren't.** The same
  person can appear in five uploads. Their FullEnrich result should be
  stored and paid for once. Their row in each upload (which list, which row
  number, what the admin edited for this list) is per upload.
- **Profile size.** We don't know how big a FullEnrich result is (the
  existing code stores the reverse-email profile as `Mixed`), and results
  with job history can be several KB each. Embedding 500 of them in one list
  document gets close to Mongo's 16MB limit for no reason.
- **The review table pages, filters and edits single rows.** One document per
  row makes that simple (`find({ listId }).skip().limit()`, `updateOne` by
  `_id`). Outbound embeds recipients because nobody edits them; here they're
  the thing being edited.
- **Shared results must outlive a list.** An admin can delete a list, and
  that must not delete the shared results (decision #21). Separate
  collections make that a plain `deleteMany` on the rows.

### 4.1 `enrichedPersonModel` — the shared enrichment store (the dedupe keys)

`src/model/enrichment/enrichedPersonModel.js`. One document per person we've
looked up. This is what stops a second upload from paying FullEnrich again.

**Primary key: normalized full name + company name** (decided, see §12,
"Dedupe key"). Both parts lowercased, trimmed, and runs of whitespace
collapsed to one space, then joined with `|`:
`"robert kulp|northern view properties llc"`. **Secondary key: normalized
email**, only for rows that have one.

| Field | Type | Notes |
|---|---|---|
| `dedupeKey` | String, **unique, sparse** | `"<name>|<company>"` as above. Set on every record looked up by name + company. Absent on the rare record looked up by email only. |
| `lookupEmail` | String, **unique, sparse**, lowercased, trimmed | Set only on records looked up through the reverse-email fallback (§5.4). Absent otherwise. |
| `knownEmails` | [String], lowercased | Every email tied to this person: `lookupEmail` if set, plus every email FullEnrich found. The secondary-key match (below) searches this. |
| `lookupMethod` | String, enum `name_company`, `email` | Which FullEnrich endpoint produced this record. |
| `lookupInput` | Object | Exactly what we sent: `{ firstName, lastName, companyName }` or `{ email }`. Useful when a result looks wrong. |
| `provider` | String, default `"fullenrich"` | Room for another provider later. |
| `status` | String, enum `pending`, `found`, `not_found`, `failed` | `pending` doubles as an in-flight lock (§5.5). `failed` means we don't know (API error, rejected contact, poll timeout), so it's retryable; `not_found` means FullEnrich finished and found no email. |
| `result` | Mixed, default `null` | FullEnrich's raw per-contact result, stored exactly as returned, the same way the lead models store theirs. |
| `summary` | Object | A small, flattened copy of the fields the UI and hand-off use, pulled out of `result` when it's saved: `workEmail`, `emails: [String]`, and, **if the response carries them** (Phase 0), `jobTitle`, `companyName`, `industry`, `linkedinUrl`. Nothing downstream digs into `result`. |
| `error` | String, default `""` | Last error for `failed`. |
| `attempts` | Number, default 0 | How many times we've called FullEnrich for this person. |
| `providerRequestId` | String | FullEnrich's `enrichment_id` for the batch this person was in. Used by resume and retry to re-poll a batch before paying to resubmit it (§5.5). |
| `enrichedAt` | Date | When the current `status` / `result` were set. |
| `firstSeenListId` | ObjectId, ref `enrichmentListModel` | Which upload first caused the lookup. Audit only; the list may be deleted later. |

Indexes: `{ dedupeKey: 1 }` unique sparse; `{ lookupEmail: 1 }` unique
sparse; `{ knownEmails: 1 }`; `{ status: 1, updatedAt: -1 }`.

**Why a single `dedupeKey` string rather than a compound unique index on
name + company.** Email-only records have neither part. A compound unique
index treats missing fields as `null`, so every email-only record would
collide on `(null, null)` unless we add a partial filter. One sparse string
field is simpler to index, to query (`findOne({ dedupeKey })`), and to use in
the claim/lock upsert. The separate `lookupInput` keeps the readable parts.

**How a row finds its record** (`findExisting(row)` in
`enrichmentJobService.js`):
1. If the row has a name + company key: `findOne({ dedupeKey })`.
2. If nothing yet and the row has an email:
   `findOne({ $or: [{ lookupEmail: email }, { knownEmails: email }] })`.
3. Either hit is reused. Name + company is tried first because that's what
   real rows actually have.

Consequences to be aware of:
- **Rows missing both keys can't be enriched.** A row needs either a name
  that splits into first + last *and* a company, or a valid email. A row
  with neither still goes into the list (it may still be callable) with
  enrichment status `no_lookup_key`. On the real sample this is 0 of 20.
- **Single-word names can't use name + company**, since FullEnrich needs a
  first and a last name. They fall back to email if they have one, else
  `no_lookup_key`.
- **Normalization is deliberately plain.** "Northern View Properties LLC"
  and "NORTHERN VIEW PROPERTIES LLC" match; "Northern View Properties, L.L.C."
  doesn't. Stripping punctuation or legal suffixes would catch more repeats
  but also risks merging different companies. Noted, not designed for.
- **Which email when a row has several?** The first valid one only
  (decision #6), using the same rule as `outboundContactsService.isValidEmail`.
  With SFR data this almost never comes up.

### 4.2 `enrichmentListModel` — one per upload

`src/model/enrichment/enrichmentListModel.js`.

| Field | Type | Notes |
|---|---|---|
| `name` | String | Admin-given label, defaulting to the file name plus date. |
| `csvFileName` | String, default `""` | |
| `source` | String, enum `csv`, default `csv` | Room for other sources later. |
| `status` | String, enum `queued`, `enriching`, `ready`, `failed`, `interrupted` | `ready` means enrichment is done and the list can be reviewed and sent. `interrupted` is set lazily, as in Outbound (§5.5). |
| `counts.total` | Number | Rows accepted into the list. At most 500 (decision #10). |
| `counts.processed` | Number | Rows whose enrichment step is finished, whatever the outcome. |
| `counts.enriched` | Number | FullEnrich found an email on this run. |
| `counts.reused` | Number | Already in `enrichedPerson` from an earlier upload; nothing was billed. |
| `counts.notFound` | Number | FullEnrich finished and found no email. |
| `counts.noLookupKey` | Number | Row has neither name + company nor a valid email, so enrichment wasn't attempted. |
| `counts.failed` | Number | API error, rejected contact or poll timeout. Retryable. |
| `parseSkipped` | `[{ row, name, reason }]` | Rows dropped at upload (empty rows, no name and no contact info, in-file duplicates). Same idea as Outbound's `parseSkipped`. |
| `createdBy.id` / `.email` / `.name` | ObjectId ref `userModel`, String, String | From `req.user`. |
| `enrichStartedAt`, `enrichFinishedAt` | Date | |
| `lastPolledAt` | Date | Heartbeat, set on every poll round so a healthy job waiting on a slow batch isn't flagged stale (§5.5). |
| `error` | String | If the whole job aborted. |
| `dispatches` | Array of subdocs | One entry per send from this list (§7.5): `{ channel: "call" \| "sms" \| "email", refId: ObjectId, propertyId, propertyName, rowCount, createdBy, createdAt }`. `refId` points at the `outboundCampaign` (SMS/email) or the `enrichmentCallRun` (calls). This is the list's own "what did we send and when" log. |

Indexes: `{ createdAt: -1 }`, `{ status: 1, updatedAt: -1 }`.

There is no list-level contact type and no list-level property. Contact type
is per row, from the CSV (decision #11). The property is picked at send
time, per dispatch, so one list can be sent for several properties
(decision #11). There's no "enrich or not" flag: enrichment always runs
(decision #22).

### 4.3 `enrichmentListRowModel` — one per contact in an upload

`src/model/enrichment/enrichmentListRowModel.js`.

| Field | Type | Notes |
|---|---|---|
| `listId` | ObjectId, ref `enrichmentListModel`, required | |
| `rowNumber` | Number | 1-based data row from the CSV, for the admin to find it in their file. |
| `raw` | Mixed | The original CSV row, all columns, exactly as uploaded. Nothing from the source is lost even if we don't map a column. |
| `csv` | Object | What the parser pulled out of `raw` (§5.3): `fullName`, `firstName`, `lastName`, `company`, `address`, `city`, `state`, `zip`, `activeMarket`, `contactType` (`buyer` \| `seller` \| `llc_owner` \| `unknown`), `phones: [String]` (all of them, in file order, as written), `emails: [String]` (all of them, lowercased). |
| `keys.nameCompany` | String | The normalized `"<name>|<company>"` key (§4.1), or `""`. |
| `keys.email` | String | The first valid email, normalized, or `""`. |
| `enrichment.status` | String, enum `pending`, `enriched`, `reused`, `not_found`, `no_lookup_key`, `failed` | Per-row outcome of this list's job. `reused` = found in the shared store, not billed again. |
| `enrichment.method` | String, enum `name_company`, `email`, `null` | Which lookup this row used. |
| `enrichment.personId` | ObjectId, ref `enrichedPersonModel` | Null for `no_lookup_key`. |
| `enrichment.providerRequestId` | String | The FullEnrich batch this row was submitted in, while it's in flight. Lets resume re-poll instead of resubmitting (§5.5). |
| `enrichment.stale` | Boolean, default `false` | Set when the admin edits name, first/last name, company or email (§7.4). The old result stays visible with a "may be stale" marker until the admin clicks Re-enrich (decision #7). |
| `enrichment.error` | String | For `failed`: "FullEnrich batch timed out after 30 min", "rejected by FullEnrich", "submit failed: 401", etc. Shown in the table. |
| `enrichment.processedAt` | Date | |
| `overrides` | Object | **The admin's edits**, stored separately from both the CSV values and the FullEnrich values, so nothing is overwritten and it's always clear what was changed by hand. Keys are the editable fields (§8.3). A key that's absent means "not edited". Edits live only here, never in `enrichedPerson` (decision #13). |
| `editedBy` / `editedAt` | `{ id, email }`, Date | Last edit. |
| `excluded` | Boolean, default `false` | Drops the row from every future send without deleting it. There's no separate approve step: a row that isn't excluded is sendable (decision #14). |
| `lastSent.call` / `.sms` / `.email` | `{ at: Date, refId: ObjectId, status: String }` | The most recent send per channel, so the table can show "texted 2 days ago" and the send panel can warn about re-sends. |

Indexes: `{ listId: 1, rowNumber: 1 }` unique; `{ listId: 1, "enrichment.status": 1 }`;
`{ listId: 1, excluded: 1 }`; `{ "keys.nameCompany": 1 }`; `{ "keys.email": 1 }`.

**What the table and the hand-off read (the "effective" value).** One
function, `effectiveContact(row, person)` in `enrichmentContactsService.js`,
computes it, and everything downstream (the table, the three adapters, the
research summary, the email merge tags) uses that one function. For each
field:
1. `overrides[field]` if the admin set it;
2. otherwise the CSV value, if the CSV has one — **the CSV wins when both
   have a value** (decision #12);
3. otherwise the FullEnrich value.

FullEnrich's extra fields are added alongside, never replacing CSV identity
fields. In practice:
- **Email:** CSV emails first, then FullEnrich's found emails appended
  (deduped). The primary email is the first of those. On SFR data that's the
  FullEnrich email, since the CSV has none.
- **Company:** the CSV `Company` is the effective company. If FullEnrich
  returns a company name too, it's shown next to it in the row editor, not
  swapped in.
- **Job title, industry, LinkedIn URL:** CSV has none, so these come from
  FullEnrich when it returns them.

**Where edits live: on the row only** (decision #13). An edit fixes this
contact *for this list*. It doesn't change what FullEnrich said, and it
doesn't reach into other lists the person appears in.

### 4.4 `enrichmentCallRunModel` — one per call dispatch

`src/model/enrichment/enrichmentCallRunModel.js`. Calls go through our own
runner (decision #3, §7.2), so their tracking lives here. It mirrors the
shape of `outboundCampaignModel` so the progress UI can treat it the same
way.

| Field | Type | Notes |
|---|---|---|
| `listId` | ObjectId, ref `enrichmentListModel` | |
| `status` | enum `queued`, `running`, `completed`, `failed`, `interrupted` | `interrupted` set lazily on read, same 10-minute rule as Outbound. |
| `property` | `{ id, name, slug, address }` | Snapshot of the property picked at send time, like Outbound. |
| `createdBy` | `{ id, email, name }` | |
| `counts` | `{ total, processed, dispatched, skipped, failed }` | Same counters `vapiCampaignService` jobs use. |
| `recipients[]` | `{ rowId, name, phones: [String], status: pending \| dispatched \| skipped \| failed, reason, researchSummary: String, calls: [{ phone, success, callId, error }], processedAt }`, `_id: false` | Snapshot at send time. Every valid phone is dialed (decision #17). The research summary actually sent is stored, for checking. |
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
| `src/model/enrichment/enrichmentCallRunModel.js` | §4.4. |
| `src/services/enrichment/enrichmentContactsService.js` | CSV parsing and normalizing for this feature (§5.3), `MAX_ROWS_CEILING = 500` (decision #10), name splitting, key normalization (`nameCompanyKey`, `emailKey`), `effectiveContact(row, person)` (§4.3), and the editable-field whitelist with per-field validation. Written fresh with `papaparse`, **not** importing `parseContactsCsv` from the calling file or the non-exported `normalizeRow` from Outbound. |
| `src/services/enrichment/fullenrichClient.js` | The FullEnrich client for this feature (§5.4, decision #5). Primary: name + company bulk lookup, up to 100 per request. Fallback: reverse-email lookup. Returns a clear outcome per contact instead of `null` for everything. `shared/fullenrichService.js` is left byte-for-byte as is. |
| `src/services/enrichment/enrichmentJobService.js` | The background job (§5.5): `startEnrichment(listId)`, the runner, `findExisting`, the claim/lock, per-row marking with `$inc` counters, heartbeat, stale detection, `resumeEnrichment(listId)`, `retryFailed(listId)`, `reEnrichRow(listId, rowId)`. |
| `src/services/enrichment/enrichmentListService.js` | `createList(...)`, `getList(id)` (lightweight, for polling), `listLists(page, limit)`, `getRows(listId, { page, limit, status, search, excluded })`, `updateRow(listId, rowId, patch, user)`, `setExcluded(...)`, `deleteList(listId)`. |
| `src/services/enrichment/enrichmentDispatchService.js` | The hand-off to the three existing channels (§7): `sendableRows(listId, channel)`, `toOutboundContacts(rows, channel)`, `toCallContacts(rows)`, `dispatchSms(...)`, `dispatchEmail(...)`, `dispatchCalls(...)`, and the pre-flight check that validates every selected channel before starting any of them. |
| `src/services/enrichment/enrichmentCallRunner.js` | The call loop (§7.2): for each row, each valid phone, `vapiService.dispatchCall`, with the same pacing as `runCampaign`. |
| `src/services/enrichment/researchSummary.js` | Builds the `prospect_research` string from the effective (edited) contact and **the property picked at send time** (decision #4). No Oakland text; `shared/fullenrichService.js`'s `buildResearchSummary` isn't used or touched. |
| `src/controller/enrichment/enrichmentController.js` | Thin handlers wrapped in `catchAsyncError`, throwing `Errorhandler` (§6). |
| `src/routes/enrichment/enrichmentRoutes.js` | `router.use(isAuthenticated, authorizeRoles("admin"))`, then §6's routes. |

### 5.2 Changes to existing backend files

| File | Change |
|---|---|
| `src/app.js` | `const enrichmentRoutes = require("./routes/enrichment/enrichmentRoutes");` and `app.use("/api/v1/enrichment", enrichmentRoutes);` next to the Outbound mount (line 126). |
| `src/model/outbound/outboundCampaignModel.js` | Decision #16: add `"enrichment"` to the `source` enum (line 49) and an optional `enrichmentListId: { type: ObjectId, ref: "EnrichmentList", default: null }`. Decision #18: add an optional `vars` object to `recipientSchema` (lines 14–30): `{ company, jobTitle, industry }`, each `String, default ""`. Existing campaigns and Outbound's own launches are unaffected (the fields default empty). |
| `src/services/outbound/outboundEmailService.js` | Decision #18: add and export `ENRICHED_EMAIL_VARIABLES = [{ key: "company", label: "Company" }, { key: "job_title", label: "Job title" }, { key: "industry", label: "Industry" }]`, and have `buildRecipientVars` (lines 45–57) also return `company: contact?.vars?.company \|\| ""`, `job_title`, `industry` the same way. `EMAIL_VARIABLES` itself is **not** changed, so Outbound's own email composer doesn't start showing tags that are always blank there. `renderTemplate` already renders an empty value as blank. |

`outboundCampaignService.js` is **not** edited. `createCampaign` already
passes `source` through, so `"enrichment"` just works once the enum allows
it. `enrichmentListId` and each recipient's `vars` are set by our dispatch
service on the returned document and saved before `startCampaign` is called
(§7.3), so `createCampaign`'s recipient mapping (lines 82–87) doesn't need to
change.

The merge-tag list is final after Phase 0: `company` always works (it comes
from the CSV). `job_title` and `industry` are only worth offering if the
name + company endpoint actually returns them when we request email only
(§2.8). If it doesn't, they're dropped from `ENRICHED_EMAIL_VARIABLES`
rather than shipped as tags that are always blank.

### 5.3 CSV parsing (`enrichmentContactsService.js`)

Same approach as the two parsers that already exist, written fresh:

- `Papa.parse(csvData, { header: true, skipEmptyLines: true })`.
- Header keys normalized once per row: trim, lowercase, collapse spaces (as
  `outboundContactsService.normalizeHeaderKey`, line 29–30).
- Every cell value trimmed (the sample has `" WARREN"`, `" NY"`).
- **Alias table.** One table drives everything, so adding a column name is a
  one-line change. The confirmed SFR header comes first in each entry; the
  others are fallbacks so PropStream-shaped and lead-list-shaped files work
  too.

  | Field | Confirmed SFR header | Fallback aliases |
  |---|---|---|
  | `fullName` | `full name` | `name`; or `first name` + `last name` joined when there's no full-name column |
  | `company` | `company` | `company name`, `llc name`, `entity name` |
  | `phones` | `phones` | `phone`, `phone number` |
  | `emails` | `emails` | `email` |
  | `address` | `address` | `street` |
  | `city` | `city` | |
  | `state` | `state` | |
  | `zip` | `zip code` | `zip`, `zipcode` |
  | `activeMarket` | `active market` | `market` |
  | `contactType` | (none in the sample) | `contact type`, `lead type`, `owner type`, `role` |

  The first draft's guessed SFR names (`owner 1 full name`, `mailing …`,
  numbered `phone 1 … N` columns) are dropped: the real export doesn't use
  them.
- **Name splitting.** If the file has `first name` / `last name` columns,
  use them. Otherwise split `Full Name` on whitespace: first word is the
  first name, the rest is the last name ("Lakshmi Medapati" →
  `Lakshmi` / `Medapati`). A one-word name gets no last name and can't use
  the name + company lookup (§4.1).
- **`Active Market`** is kept as `csv.activeMarket`, shown as a column in
  the review table and usable as a filter (it's the easiest way to tell the
  Ogdensburg rows from the New York rows in one file). It's also passed to
  the research summary as context. It isn't sent to FullEnrich.
- **Contact type** is read per row when one of its columns is present
  (decision #11): values containing "buyer" → `buyer`, "seller" → `seller`,
  "llc" or "owner" → `llc_owner`, anything else or no column → `unknown`.
  The raw value stays in `raw`.
- Multi-value cells (`phones`, `emails`) split on `|`. All values kept in
  `csv.phones` / `csv.emails`; validation happens later, per channel, at
  hand-off time, because the three channels have different rules (§7.1).
- Every original column is kept in `raw`, so nothing SFR sends us is lost.
- A row is accepted if it has a name **or** at least one phone or email.
  Rows with none of those go to `parseSkipped` with a reason. (The calling
  parser drops rows without a Full Name; the Outbound parser doesn't
  require a name. This one follows Outbound.)
- **Keys** are computed at parse time: `keys.nameCompany` when there's a
  first + last name and a company; `keys.email` from the first valid email
  (decision #6).
- **In-file duplicates** are dropped into `parseSkipped` as "duplicate
  within this file": same `keys.nameCompany`, or (for rows without one) same
  `keys.email`. Rows with neither key aren't deduped.
- Over 500 rows: the upload is rejected with a clear 400, never truncated,
  the same rule Outbound uses (decision #10).

### 5.4 FullEnrich client (`fullenrichClient.js`)

A new file for this feature (decision #5), same env var
(`FULLENRICH_API_KEY`), same base URL as the shared client
(`https://app.fullenrich.com/api/v2`). Two methods, one outcome shape.

**Primary: `enrichByNameCompany(contacts, { label })`** — the bulk
name + company endpoint (§2.8).

```
enrichByNameCompany([{ ref, firstName, lastName, companyName }], { label }) →
  { providerRequestId,
    results: [{ ref, outcome: "found" | "not_found" | "failed",
                workEmail, emails, result, error }] }
```

- Submits `POST /contact/enrich/bulk?silentFail=true` with
  `{ name: label, enrich_fields: [<email field>], data: [{ first_name,
  last_name, company_name, custom: { ref } }] }`. `label` is
  `"Vihara Enrichment <listId> batch <n>"` so batches are easy to find in
  FullEnrich's dashboard. `ref` is our `enrichedPerson._id` as a string (not
  the person's name; the shared client sends `fullName` as `user_id`, line
  15, which isn't unique).
- **`enrich_fields` asks for email only** (§12, "Fields requested"). The
  exact identifier string is a Phase 0 check (§2.8). Default: work email
  only (1 credit on a hit). Personal email (3 credits) is left out unless
  the requesting user asks for it after seeing Phase 0 hit rates. Mobile
  phone (10 credits) is never requested.
- **Up to 100 contacts per request** (FullEnrich's limit). A 500-row list is
  at most 5 submits.
- `silentFail=true` so one contact FullEnrich considers invalid doesn't sink
  the other 99. Any contact we submitted that doesn't come back in the
  results is marked `failed` with "rejected by FullEnrich".
- **Polling**, not webhooks, for v1: `GET /contact/enrich/bulk/{id}` every
  10s until the batch reports finished, up to a 30-minute cap per batch
  (both constants, tuned after Phase 0). Reasons: it's the pattern the
  codebase already uses, it needs no new public endpoint or webhook
  authentication, and our job state is in Mongo anyway. Webhooks are a later
  improvement if polling proves slow or FullEnrich starts throttling it.
- **`429`**: wait for the retry-after the message gives (or 30s if none can
  be read) and resubmit the same batch. Not counted as a failure.
- **Outcome mapping** (field names confirmed in Phase 0):
  - `found`: the batch finished and this contact has at least one email.
  - `not_found`: the batch finished and this contact has no email.
  - `failed`: submit error (other than 429), the batch came back failed,
    the contact was rejected under `silentFail`, or the 30-minute cap ran
    out (with the reason in `error`).
- **Matching results back** relies on our `custom.ref` coming back on each
  result. If Phase 0 shows it doesn't, fall back to matching by position,
  and if that isn't guaranteed either, by `first_name` + `last_name` +
  `company_name` echoed back. This is the most important thing Phase 0 has
  to confirm.
- It never throws. The job decides what to do with each outcome.

**Fallback: `lookupEmails(contacts, { label })`** — the reverse-email bulk
endpoint the shared client already uses (`/contact/reverse/email/bulk`),
same outcome shape. Used only for rows that have a valid email but no
usable name + company (§4.1). It batches the same way (the endpoint takes a
`data` array; the batch limit is a Phase 0 check, default 1 until
confirmed, which is what the shared client does today). On SFR data this
path should almost never run.

A row that has **both** a name + company key and an email uses the name +
company lookup. If that comes back `not_found`, the email isn't tried as a
second paid lookup in v1; the admin can see the row and re-enrich it by hand
(decision #7).

### 5.5 The background enrichment job (`enrichmentJobService.js`)

**State lives in Mongo, following `outboundCampaignService`, not in an
in-memory `Map` like `CAMPAIGN_JOBS`.** The requesting user explicitly wants
the results kept and visible later, and a job that's waiting on FullEnrich
must survive a Render redeploy well enough to be resumed without paying
twice. The `CAMPAIGN_JOBS` idea still applies in two places: the job is
started after the HTTP response and polled, and old state is cleaned up
lazily on read (here, flipping stale `enriching` lists to `interrupted`).

**Flow:**

1. `POST /lists` parses the CSV, inserts the list (`status: queued`) and all
   its rows (`enrichment.status: pending`, or `no_lookup_key` straight
   away), responds `202 { listId, total, noLookupKey, skipped }`, then calls
   `startEnrichment(listId)` without awaiting it (same shape as
   `vapiController.js` lines 113–117 and `outboundController.js` lines
   119–125).
2. `startEnrichment` sets `status: enriching`, `enrichStartedAt`.
3. **Store pass.** For every `pending` row, `findExisting(row)` (§4.1):
   - `found` or `not_found` there already: link the row, mark it `reused`
     (or `not_found`), `$inc counts.reused` (or `notFound`). No FullEnrich
     call. Stored results are always reused by default (decision #7); a
     fresh lookup only happens when the admin clicks Re-enrich on a row.
   - `pending` there (another list is looking it up right now): leave the
     row for a later pass.
   - `failed` there, or no record: goes into the "to look up" set.
4. **Claim.** For each row to look up, upsert `enrichedPerson` with
   `status: pending` using `findOneAndUpdate` on
   `{ dedupeKey, status: { $ne: "pending" } }` (or `{ lookupEmail, … }` for
   the email fallback). The unique sparse index makes this safe. If the
   claim fails, another job has it; treat as `pending` above. This stops two
   uploads running at the same time from paying for the same person twice.
5. **Submit.** Group the claimed name + company rows into batches of up to
   100 and submit each (email-fallback rows go through `lookupEmails`). As
   soon as a batch is accepted, write its `enrichment_id` to
   `providerRequestId` on every row and `enrichedPerson` in it.
6. **Poll** all open batches every 10s. Each poll round sets
   `lastPolledAt` on the list (the heartbeat).
7. **Save outcomes** as each batch finishes: on `enrichedPerson` (`status`,
   `result`, `summary`, `knownEmails`, `error`, `attempts +1`,
   `enrichedAt`), then on the row (`enrichment.status`, `method`,
   `personId`, `error`, `processedAt`, clear `providerRequestId`), and
   `$inc` the matching list counter plus `counts.processed`, one
   `updateOne` each, like `outboundCampaignService.markRecipient`.
8. Rows left waiting on another list's in-flight lookup are re-checked at
   the end; if that lookup is still `pending` after 10 minutes it's treated
   as abandoned and reclaimed.
9. When no `pending` rows are left: `status: ready`, `enrichFinishedAt`.
   A thrown error that escapes the loop: `status: failed`, `error` set.

**Per-contact failures never stop the job.** A `failed` row is recorded with
its reason and the job moves on, like the calling flow's "best effort"
rule. Failed rows show in the table with the reason, and a "Retry failed"
action re-runs just those (§6).

**How long it takes.** With 100 contacts per request, a 500-row list is at
most 5 submits. How long FullEnrich takes to finish one batch isn't in the
docs we fetched (Phase 0 measures it), but it's one wait per 100 contacts
instead of one 6–60s wait per contact. A plausible estimate is minutes for
a full 500-row list, not the 50 minutes to 8 hours the first draft
estimated for one-at-a-time reverse-email lookups. The 20-row sample is one
batch.

That makes the long-run risk much smaller, but the Mongo job state, stale
detection and resume stay, because they're cheap and they protect money:
- **Stale detection.** A list in `enriching` whose `lastPolledAt` (or
  `updatedAt`, whichever is later) hasn't moved in 10 minutes becomes
  `interrupted` on the next read (the same `STALE_MS` rule as Outbound).
  The heartbeat is on every poll, not every row, because with batching no
  row may change for several minutes while a batch runs.
- **Resume.** `POST /lists/:id/resume` restarts the runner on an
  `interrupted` list. Every row's status is stored, so it carries on with
  the `pending` rows. **Rows that were already submitted (they have a
  `providerRequestId`) are re-polled on that id first, not resubmitted**, so
  a redeploy mid-batch doesn't pay for the batch twice. Only rows with no
  `providerRequestId` are submitted fresh.
- **Retry failed** does the same check: a row that failed on a poll timeout
  still has its `providerRequestId`, so its batch is polled once more
  before the row is resubmitted.
- Auto-resume on server start is **not** planned; the codebase has no
  startup-hook pattern for this (Outbound chose not to either). An admin
  clicks Resume.

**Re-enrich one row** (decision #7). `reEnrichRow` looks the row up again
using its *effective* first name, last name and company (or email for a
fallback row), so an edited name or company is what gets sent. It always
calls FullEnrich, even if a stored result exists. If the effective key is
unchanged it overwrites that shared `enrichedPerson` record with the fresh
FullEnrich answer (this is FullEnrich's data, not an admin edit, so it
belongs in the shared store); if the admin changed the name or company, the
key is new and it claims or creates that record instead and relinks the
row. It clears `enrichment.stale`. It's a batch of one, run in the
background; the row shows `pending` until it finishes. A found email costs
1 credit again.

**Counts the UI shows while it runs:** `processed / total`, and the
breakdown `enriched`, `reused (no charge)`, `not found`, `no lookup key`,
`failed`. The "reused" number is worth showing on its own because it's the
visible proof that dedupe saved money.

---

## 6. API endpoints

All under `/api/v1/enrichment`, all admin only (`isAuthenticated` +
`authorizeRoles("admin")`). JSON bodies. CSV is sent as raw text in
`csvData`, like calls and Outbound. At the 500-row cap that's about 100KB,
well under the 5mb body limit in `app.js` line 62.

| Method | Path | Purpose |
|---|---|---|
| GET | `/config` | `{ maxRowsCeiling: 500, fullenrichConfigured: Boolean(FULLENRICH_API_KEY), editableFields: [{ key, label, type }], emailVariables: [...EMAIL_VARIABLES, ...ENRICHED_EMAIL_VARIABLES] }`. |
| POST | `/lists/parse` | Body `{ csvData }`. **Parses only. Doesn't save, doesn't call FullEnrich.** Returns `{ total, skipped, noLookupKey, alreadyEnriched, toLookUp: { byNameCompany, byEmail }, sample: first 20 rows, headersSeen, headersUnmapped }`. `alreadyEnriched` is a count from `enrichedPerson`, so the admin sees "412 rows: 120 already enriched (no charge), 290 to look up, 2 with nothing to look up by" before starting. `headersUnmapped` shows which columns we didn't recognize. |
| POST | `/lists` | Body `{ csvData, csvFileName?, name? }`. Rejects over 500 rows (400) or with no usable rows (400). Creates the list and rows, returns `202 { listId, total, noLookupKey, skipped }`, starts the job. Enrichment always runs (decision #22). |
| GET | `/lists` | Query `page=1, limit=20`. Newest first, without rows. Stale check applied. |
| GET | `/lists/:id` | The list document with counts and `dispatches`. No rows. **This is what the progress view polls** every 3s, so it stays small. Stale check applied. |
| DELETE | `/lists/:id` | Deletes the list and its rows (decision #21). **The shared `enrichedPerson` records are kept**, since other lists and future uploads reuse them. 409 while the list is `enriching` or one of its call runs is `running`. Outbound campaigns already sent from it stay in Outbound → History (their `enrichmentListId` just points at nothing); call runs from it are deleted with it. |
| GET | `/lists/:id/rows` | Query `page, limit (default 50, max 200), status?, search?, excluded?, activeMarket?, channel?`. Each row comes back with its effective values, its CSV values, its FullEnrich summary, its `overrides`, `enrichment.stale`, and `lastSent`, so the table can show what was edited and where each value came from. `channel=call\|sms\|email` filters to rows that qualify for that channel (§7.1). |
| PATCH | `/lists/:id/rows/:rowId` | Body `{ overrides?, excluded? }`. Only whitelisted keys; each validated (email format, phone parse). Sending `null` for a key clears that override. Records `editedBy` / `editedAt`. If name, first/last name, company or email changed, sets `enrichment.stale: true` (§7.4). **Doesn't start any enrichment or send.** |
| POST | `/lists/:id/rows/:rowId/re-enrich` | Decision #7. Looks the row up again with its effective name + company (or email), even if a stored result exists. `202`; the row shows `pending` until done. 409 while the list is `enriching`. The UI says it may cost a credit. |
| POST | `/lists/:id/resume` | Restarts an `interrupted` list's job. 409 if it's already `enriching`. |
| POST | `/lists/:id/retry-failed` | Sets the list's `failed` rows back to `pending` and restarts the job (re-polling any known batch first, §5.5). May cost credits for rows that are found this time; the UI says so. |
| POST | `/lists/:id/dispatch/preview` | Body `{ channels: ["call","sms","email"], propertyId }`. **Sends nothing.** For each channel, returns how many non-excluded rows qualify and why the rest don't (§7.1), plus the setup checks (SMS list set? voice prompt written? email configured?). This is what the send panel's "Check" button calls. |
| POST | `/lists/:id/dispatch` | Body `{ channels, propertyId, maxContacts, sms?: { consentAttested }, email?: { subject, body, bodyFormat } }`. **Validates every requested channel first. If any one fails, nothing is started** and a 400 lists every problem. Otherwise starts every requested channel together (decision #19) through its existing path (§7) and returns `202 { sms?: { campaignId }, email?: { campaignId }, call?: { callRunId } }`. |
| GET | `/call-runs/:id` | Same lightweight / `?all=true` split as Outbound's `GET /campaigns/:id`. Stale check applied. |

SMS and email progress after a dispatch is polled on the **existing**
`GET /api/v1/outbound/campaigns/:id`, since those are ordinary Outbound
campaigns. Call progress is polled on `/call-runs/:id`.

**What a dispatch sends to** (decision #15): every row in the list that
isn't excluded and meets that channel's own requirement (§7.1). There's no
per-send row picker; excluding a row on the review screen is how the admin
keeps it out of every future send.

Route order: `/lists/parse` is declared before `/lists/:id` so `parse` isn't
read as an id.

---

## 7. Handing off to the existing channels

This is the part that needs the most care. The three existing send paths
each expect a different contact shape and have different rules.

### 7.1 The shapes don't match

| | Calling (`buildContact` / `dispatchCall`) | Outbound SMS | Outbound Email | Enrichment row (effective) |
|---|---|---|---|---|
| Name | `fullName` | `name` | `name` | `fullName` (+ first/last) |
| Company | not used, except through `prospect_research` | not accepted | `vars.company` merge tag (decision #18) | `company` (CSV, required for the lookup) |
| Phones | `phones: []`, all of them, `+1…` or `+91…` (`parsePhones`) | `phone`, **one**, US only (`toUsSmsNumber`), **required** | `phone` optional, unused | `phones: []`, as written |
| Email | `email` or `null`, optional | `email`, **required** (decision #5 in `outboundplan.md`) | `email`, **required** | CSV emails, then FullEnrich's found emails |
| Address / city / state / zip | Used (prompt variables `prospect_address`, `prospect_city`, `prospect_state`) | Not accepted | Not accepted | Kept (often blank on SFR rows) |
| Enrichment | `researchSummary` string, built by us per property (§7.2) | No field for it | `company`, `job_title`, `industry` merge tags (decision #18, §5.2) | Stored result + summary + edits |
| Cap | 500 hard (`MAX_CONTACTS_PER_CAMPAIGN`) | admin `maxContacts` ≤ 500 | admin `maxContacts` ≤ 500 | 500 per list (decision #10) |
| Must be set up first | Property voice prompt (422 without) | Property `brevoOutboundSmsListId`; consent checkbox | `EMAIL_USERNAME`/`EMAIL_PASSWORD` | |

What this means:
- **Each channel sends to the rows that meet its own rule** (decision #15).
  Call: at least one phone that `parsePhones` accepts. SMS: a valid US
  phone *and* an email. Email: a valid email. The adapters report skipped
  rows with reasons, the same way Outbound's parser does.
- **On SFR data, SMS and email reach equals FullEnrich's email hit rate.**
  The CSV has no emails (§2.7), so a row is only textable or emailable if
  enrichment found one. Calls reach every row.
- **Phones differ in count.** Calls dial every valid phone on a row
  (decision #17, matching today's calling campaign); SMS takes the first
  valid US one.
- **Where enriched data shows up.** Calls get it through
  `prospect_research` (§7.2). Emails get it as merge tags (`{{company}}`,
  and `{{job_title}}` / `{{industry}}` if FullEnrich returns them), plus the
  found email address itself is what makes most SFR rows emailable at all.
  SMS text lives in Brevo automations (decision #11 in `outboundplan.md`)
  and can't use enriched fields; for SMS, enrichment's value is finding the
  email that Outbound's SMS rule requires, and letting the admin review and
  clean the list.

### 7.2 Calls: our own small runner around `dispatchCall` (decision #3)

`enrichmentCallRunner.js`, tracked in `enrichmentCallRunModel` (§4.4).

- For each sendable row: build the contact in exactly `buildContact`'s
  shape (`fullName, address, city, state, zip, email, phones`) from the
  effective values, with phones run through the imported
  `vapiService.parsePhones`. Build a `researchSummary` with
  `researchSummary.js` from the stored (and edited) enrichment and **the
  property picked for this dispatch** (decision #4). Then call
  `dispatchCall(phone, contact, { researchSummary, property, promptConfig })`
  for **each valid phone** (decision #17), with the same 2s between phones
  and 6s between contacts as `runCampaign`.
- `property` and `promptConfig` come from the imported `resolveProperty` and
  `resolvePromptConfig`, checked in the dispatch pre-flight so a missing
  voice prompt fails before anything starts.
- No `source` passed, so `metadata.source` stays `"vihara-voice"`, the same
  as admin campaigns today (§2.4). Callbacks, caller-number rotation, the
  daily cap, prior-call memory and `CallLog` all work unchanged because
  they're inside `dispatchCall` or downstream of VAPI.
- Results persisted in `enrichmentCallRunModel` and on each row's
  `lastSent.call`. Stale detection as in Outbound.
- Cost of this choice: it copies about 40 lines of loop logic from
  `runCampaign` (the phone loop and delays), so if someone later changes the
  pacing in `vapiCampaignService.js`, this copy won't follow. It imports from
  `vapiService.js`, `vapiPropertyService.js` and `vapiPromptService.js`
  (import only, allowed by decision #2).

**The research summary** (`researchSummary.js`, decision #4). Built from
the effective contact and the dispatch's property, never a hardcoded place.
Roughly: who they are (name, and company from the CSV), what FullEnrich
added if anything (job title, industry), the contact type if known, their
market (`Active Market`) and their own address if the CSV had one, and a
closing line tying the call to *this* property by its name and address. Any
empty part is left out. The exact sentence templates are written in Phase 5
and checked on a real call to the requesting user's own phone. This fixes
the Oakland problem for this feature's calls only; `buildResearchSummary`
in `shared/fullenrichService.js` stays as it is.

Options considered and not taken:
- Reusing `vapiCampaignService.createCampaign` / `runCampaign` with
  `enrich: false`: the agent would get no enrichment, and tracking is in
  memory.
- The same with `enrich: true`: pays FullEnrich again per contact, ignores
  the admin's edits, can't look up email-less SFR rows anyway, and carries
  the Oakland text.
- A small option added to `vapiCampaignService.js`: edits calling code,
  which is ruled out.

Also worth knowing:
- The admin calling campaign has no consent gate today (SMS has the
  attestation checkbox; calls don't). This feature doesn't add one; calls
  from it behave like today's admin calling campaigns.
- `pickCallerNumberId` returns a failure once every caller number hits its
  daily cap, so big lists may partly fail on one day. Those rows are
  recorded as `failed` with that reason; nothing retries them automatically.

### 7.3 SMS and Email: call the Outbound services directly

**Build the same `{ name, phone, email }` contacts Outbound builds, by
running the sendable rows through Outbound's own exported parser, then call
`createCampaign` + `startCampaign`.**

1. Map each sendable row's effective values to a plain object with the
   column names Outbound understands: `{ "full name": fullName, phones:
   phones.join("|"), emails: emails.join("|") }` (primary email first).
2. Turn the array into CSV text with `Papa.unparse` and call
   `outboundContactsService.parseContacts({ channel, csvData, maxContacts })`.
   **This runs Outbound's real validation and dedupe, unchanged:** SMS gets
   the first valid US phone and requires an email; email requires a valid
   email; in-batch duplicates are dropped. Skipped rows come back with
   Outbound's own reasons and row numbers, which map to our rows by
   position in the CSV we built.
3. Repeat the guards `outboundController.js` does, since the controller
   can't be called as a function: property exists, `validateMaxContacts`,
   `overLimit`, `total > 0`; for SMS `consentAttested === true` and
   `resolveOutboundSmsListId(property) !== null`; for email subject and body
   present. All of these use exported functions, so the rules are the same
   ones, not copies. (The one thing that is a copy is the *order* of the
   checks and their messages; about 20 lines.)
4. `outboundCampaignService.createCampaign({ channel, source: "enrichment",
   csvFileName: <list name>, maxContacts, property, createdBy: req.user,
   contacts, parseSkipped, sms | email })` (decision #16).
5. On the returned document, set `enrichmentListId` (decision #16) and, for
   email, each recipient's `vars` (`company`, `jobTitle`, `industry` from
   the effective contact; decision #18). Recipients are matched back to
   rows by email, which is unique among accepted email recipients because
   Outbound dedupes email campaigns by email. `await doc.save()`, then
   `startCampaign(doc._id)` without awaiting.
6. Push a `dispatches` entry on the list and set `lastSent.sms` /
   `lastSent.email` on the rows.

Why this way:
- **No edits to `outboundContactsService.js`, `outboundCampaignService.js`
  or the controller.** The SMS and email runners, the Brevo remove-then-add,
  `sendEmailAsync`, stale detection: all exactly as they are. The only
  Outbound edits are the two additive ones in §5.2.
- **The campaign shows up in Outbound → History** like any other, now with
  `source: "enrichment"` and a link back to the list, and progress can use
  the existing `CampaignProgress` component and
  `GET /api/v1/outbound/campaigns/:id`.

Still worth knowing:
- **Outbound's History UI may show the raw `enrichment` source value.**
  Whatever label mapping it has for `single` / `csv` isn't edited
  (frontend Outbound files stay untouched), so it may display the plain
  string. Cosmetic; check in Phase 4.
- **Round-tripping through CSV text is a bit indirect.** The alternative is
  exporting `normalizeRow` from `outboundContactsService.js`, which is
  another edit. The data is small, so the round trip stays.
- **SMS consent is still the admin's statement.** The send panel shows the
  same required checkbox as `SmsLauncher.jsx`, and the same TCPA caveat
  from `outboundplan.md` §4 applies. Enrichment doesn't change consent.

### 7.4 What editing does and doesn't do

- Editing a field saves it to `overrides` on that row. Nothing else happens:
  no enrichment, no send, no change to other lists or to `enrichedPerson`
  (decision #13).
- **Editing an identifying field** (name, first/last name, company, or
  email) **doesn't re-enrich** (decision #7). The row keeps showing its
  current enrichment with a "may be stale" marker (`enrichment.stale`).
  The admin clicks Re-enrich on that row to look it up again with the
  edited values (§5.5); until then, nothing is billed.
- Sends read the effective values at the moment the admin clicks Send.
  Edits after that don't change a campaign already started (Outbound
  snapshots recipients into the campaign document; the call run does the
  same).

### 7.5 Several channels at once

- The admin ticks any of Call / SMS / Email, picks one property for this
  send (decision #11), and fills in what each ticked channel needs (SMS
  consent; email subject/body with the existing `EmailComposer`, which now
  also offers the enriched merge tags).
- **All ticked channels are validated before any starts** (§6
  `/dispatch`). A half-sent list (texts gone out, emails refused because of
  a missing subject) is worse than a clear error.
- **Then all of them start together** (decision #19). Each runs on its own
  runner at its own pace: emails in seconds, SMS in a few minutes, calls at
  6s+ per contact. So in practice someone may get the text and email well
  before the call.
- The same list can be sent again later, for the same or a different
  property. The send panel warns using `lastSent` ("37 of these were texted
  in the last 7 days").

---

## 8. Frontend plan (`vihara-new-website`)

Branch `enrich-contacts`, from the latest `main` (decision #1).

### 8.1 New files

| Path | What it does |
|---|---|
| `src/api/enrichment.api.js` | Thin `apiClient` calls for §6. Separate file, like `outbound.api.js`. |
| `src/services/enrichment.service.js` | Wraps the API, unwraps `data`, light client-side guards. |
| `src/components/AdminPanel/Enrichment/EnrichmentHub.jsx` + `EnrichmentHub.css` | The page for `?tab=enrichment`, with the `view` / `listId` params from §3, updated with the functional `setSearchParams` form (as `OutboundHub.jsx` lines 42–49). Loads `/config` once. CSS prefix `enx-`, same design tokens as `OutboundHub.css` lines 1–11. |
| `src/components/AdminPanel/Enrichment/ListUpload.jsx` | "Choose .csv" (FileReader) or paste, an optional list name, then "Check file" → `/lists/parse`, showing: rows found, already enriched (no charge), to look up (by name + company / by email), nothing to look up by, skipped (collapsible table), columns we didn't recognize, and the first 20 rows. Then "Start enrichment" with a confirm showing the lookup count ("Look up 290 contacts on FullEnrich? 120 more are already enriched and won't be charged. You're only charged for emails found."). No skip-enrichment option (decision #22). Written fresh; doesn't reuse `ContactTargeting.jsx`, which is tied to SMS/email channel rules. |
| `src/components/AdminPanel/Enrichment/EnrichmentProgress.jsx` | Status pill, progress bar, `processed / total`, and the five counts from §5.5. "Resume" when `interrupted`. "Retry failed" when done with failures. |
| `src/components/AdminPanel/Enrichment/useEnrichmentPolling.js` | Same shape as `Outbound/useCampaignPolling.js` (3s, cleanup on unmount), polling `GET /lists/:id`, stopping on `ready | failed | interrupted`. Written as a copy rather than a generalization, so the Outbound hook stays untouched. |
| `src/components/AdminPanel/Enrichment/ListsTable.jsx` | Paginated table of lists: date, name, created by, status, total, enriched, reused, failed, sends so far. Click opens the list. A delete action with a confirm that says the shared enrichment results are kept (decision #21). |
| `src/components/AdminPanel/Enrichment/ListDetail.jsx` | Shows `EnrichmentProgress` while enriching; once `ready`, the review table and the send panel. Also shows the list's `dispatches` log with links to each campaign's progress. |
| `src/components/AdminPanel/Enrichment/ReviewTable.jsx` | The review/edit table (§8.3). |
| `src/components/AdminPanel/Enrichment/RowEditor.jsx` | Side panel or modal for editing one row: each editable field showing its CSV value, its FullEnrich value, and the current effective value, with a "reset to original" per field. Saves with `PATCH`. Has the Re-enrich button (decision #7), with a note that it may cost a credit. |
| `src/components/AdminPanel/Enrichment/SendPanel.jsx` | Channel checkboxes, a property picker (imports `Outbound/OutboundPropertyPicker.jsx` as-is), max contacts, per-channel inputs: SMS consent checkbox and list status; `Outbound/EmailComposer.jsx` imported as-is for email, given `emailVariables` from our `/config` (Outbound's variables plus the enriched ones). "Check" calls `/dispatch/preview` and shows per-channel ready/skipped counts and setup problems. "Send" shows one confirm listing everything that will happen, then calls `/dispatch`. |
| `src/components/AdminPanel/Enrichment/DispatchProgress.jsx` | After a send: for SMS and email, renders `Outbound/CampaignProgress.jsx` (imported as-is) per campaign id; for calls, a small progress view on `/call-runs/:id`. |

### 8.2 Changes to existing frontend files (additive)

| File | Change |
|---|---|
| `src/components/AdminPanel/Core/adminPanel.jsx` | Import `EnrichmentHub`, add `'enrichment'` to `VALID_TABS`, add `{mainContent === 'enrichment' && <EnrichmentHub />}`. |
| `src/components/AdminPanel/Core/adminPanelSidebar.jsx` | One new `<li>` labelled "Enrichment" right after "Outbound" (decision #20), calling `navTo('enrichment')`, with a Phosphor icon. |

Nothing under `AdminPanel/Calls/` or `AdminPanel/Outbound/` is edited.
`OutboundPropertyPicker`, `EmailComposer` and `CampaignProgress` are
imported, not changed (decision #2).

### 8.3 The review/edit screen

- **Columns:** row #, name, company, primary email (with a small "CSV" /
  "FullEnrich" source tag), phones, city/state, active market, contact type,
  job title and industry (only if FullEnrich returns them, per Phase 0),
  enrichment status (enriched / reused / not found / no lookup key /
  failed + reason), stale marker, edited marker, last sent per channel.
- **Editable fields:** full name, first name, last name, company, primary
  email, phones, address, city, state, zip, contact type, job title,
  industry, notes. The CSV value wins over FullEnrich's by default wherever
  both exist (decision #12); FullEnrich's value is shown next to it in the
  row editor.
- **Filters:** enrichment status, stale, edited / not edited, excluded,
  active market, "can be called" / "can be texted" / "can be emailed" (from
  the same rules the adapters use). A search box on name, company and
  email.
- **Paging:** server-side, 50 rows a page.
- **Editing:** click a row to open `RowEditor`. A panel is simpler to build
  than inline editing and makes it easy to show "CSV said X, FullEnrich
  said Y, you set Z".
- **Saving:** one `PATCH` per row on Save. No autosave, no bulk edit in v1.
- **Exclude:** a per-row toggle. Excluded rows are left out of every send;
  every other row is sendable on each channel it qualifies for (decisions
  #14 and #15). There's no approve step.
- **Editing doesn't re-trigger anything** (§7.4). Re-enrich is a separate,
  explicit button.

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
first because they reuse Outbound's services almost unchanged; calls go
last because they add the most new code (runner, call-run model, research
summary).

### Phase 0: FullEnrich checks (no code)

The design decisions are all made (§12). What's left is confirming the
parts of FullEnrich's API we haven't seen, from their docs or support, or
with a live test of one or two contacts **only with the requesting user's
permission** (for example their own name + company):
- The response of `GET /contact/enrich/bulk/{id}`: the status field and its
  values, where each contact's emails are, **whether our `custom` comes back
  on each result** (how rows are matched back, §5.4), and whether job title,
  company, industry or LinkedIn come back when only email is requested.
  That last answer fixes the merge-tag list (§5.2) and the table columns
  (§8.3).
- The exact `enrich_fields` identifier(s) for work email (and, for
  reference, personal email).
- How long a batch of 20 and of 100 usually takes, to set the poll interval
  and the 30-minute cap.
- The rate limit, and the exact form of the retry-after message on a `429`.
- How `silentFail` reports a skipped contact.
- The reverse-email endpoint's batch limit, for the fallback path.
- A rough hit rate: on a handful of SFR rows (with permission), how many get
  an email. This tells the requesting user how much SMS/email reach to
  expect (§7.1).

### Phase 1: Backend foundations (no FullEnrich, no sends)

- The three list/store models, `enrichmentContactsService` (parser, alias
  table, name split, keys, 500 cap, `effectiveContact`, editable-field
  whitelist), `enrichmentListService`, the controller with `getConfig`,
  `parseList`, `createList` (with the job not started yet, rows stay
  `pending`), `listLists`, `getList`, `getRows`, `updateRow`, `deleteList`,
  the routes and the `app.js` mount.
- Check with curl and an admin cookie: the real SFR sample (20 rows, 20
  name + company keys, 0 emails, `Active Market` and `Company` mapped,
  trimmed city/state), a PropStream-shaped file, a lead-list-shaped file, a
  file with junk and duplicate rows, a file over 500 rows (400). Editing,
  clearing an override, the stale flag on a company edit, excluding,
  deleting a list. A non-admin gets 403.

### Phase 2: Enrichment job

- `fullenrichClient` (name + company bulk, reverse-email fallback),
  `enrichmentJobService` (store-first lookup, claim/lock, batching, polling
  with heartbeat, per-row marking, stale detection, resume with re-poll,
  retry-failed, re-enrich one row).
- Check (with permission, on the requesting user's own name + company and
  one or two known-good test contacts): found, not found, no lookup key, a
  forced failure (bad API key in local env only) shows every row `failed`
  with the reason, then retry-failed with the right key fixes them. Upload
  the same file again: every row is `reused` and **no FullEnrich call is
  made** (check the logs). Two lists with the same person started together
  only look them up once. Kill the server mid-batch: the list shows
  `interrupted`, Resume re-polls the same `enrichment_id` instead of
  resubmitting. Deleting a list leaves its `enrichedPerson` records in
  place, and re-uploading reuses them.

### Phase 3: Frontend upload, progress, lists, review/edit

- `enrichment.api.js`, `enrichment.service.js`, `EnrichmentHub`,
  `ListUpload`, `EnrichmentProgress`, `useEnrichmentPolling`, `ListsTable`,
  `ListDetail`, `ReviewTable`, `RowEditor`, sidebar and `adminPanel.jsx`
  wiring.
- Check: the parse preview numbers match the backend; progress updates
  every 3s and stops at `ready`; the table pages and filters (including
  active market and stale); edits save and show as edited; reset clears
  them; Re-enrich works on one row; delete works; a deep link to one list
  works.

### Phase 4: Send to Email and SMS

- The two Outbound edits (§5.2), `enrichmentDispatchService` (sendable rows,
  the Outbound adapter, recipient `vars`, `enrichmentListId`, pre-flight,
  `dispatches` log, `lastSent`), `/dispatch/preview`, `/dispatch` for `sms`
  and `email`. `SendPanel` and `DispatchProgress` (Outbound components
  imported as-is).
- Check: preview counts match what Outbound's parser would say for the same
  rows; one email to the requesting user's own inbox using an edited name
  and `{{company}}`; one SMS to their own phone on a property with an
  outbound list; both campaigns appear in Outbound → History with
  `source: "enrichment"`; an ordinary Outbound email campaign still renders
  exactly as before; SMS without consent and SMS on a property without a
  list are refused by UI and API; ticking both SMS and email with a missing
  subject starts **neither**.

### Phase 5: Send to Calls

- `enrichmentCallRunModel`, `enrichmentCallRunner`, `researchSummary`,
  `/call-runs/:id`, the call part of `SendPanel` and `DispatchProgress`.
- Check (the requesting user's own phone only, with permission): the call
  goes out with the right property and prompt; the VAPI call shows
  `prospect_research` built from the stored and edited enrichment and
  naming the property picked for this send, with no Oakland text; **no
  FullEnrich call is made at dispatch time**; a property with no voice
  prompt is refused before anything starts; a row with two phones gets two
  calls; the call shows up in the Voice Agent dashboard as normal (it reads
  `CallLog`, which the webhook fills). Ticking all three channels starts
  all three together.
- Re-check nothing under `src/services/calling/` or
  `src/components/AdminPanel/Calls/` changed (`git diff --stat` on those
  paths is empty).

### Phase 6: Polish

- Empty, loading and error states; the list's dispatch log with links;
  "last sent" warnings in the send panel; CSS tidy.

### Phase 7: Future (not now)

- Using the shared enrichment store from the lead-form controllers too, so
  a lead who registers after being in an uploaded list isn't looked up
  again.
- Webhooks instead of polling (`webhook_url`, `contact_finished`) if
  polling proves slow or gets throttled.
- Trying the email as a second lookup when name + company finds nothing,
  and personal email (3 credits), if hit rates call for it.
- Enriched fields as Brevo attributes for SMS.
- A real job queue if the API ever runs on more than one instance.
- Folding the calling CSV upload onto enrichment lists (only if the calling
  code is ever opened up again).

---

## 10. Env vars

**No new env vars.** `FULLENRICH_API_KEY` is reused. The row ceiling (500),
batch size (100), poll interval, per-batch poll cap and stale timeout are
code constants, like `MAX_CONTACTS_CEILING` in Outbound, so changing them is
a deliberate code change.

---

## 11. Risks and known gaps (noted, not designed for now)

- **Cost.** A 500-row list is at most 500 work-email lookups, and FullEnrich
  only charges on a found email (1 credit each), so at most 500 credits for
  a list that's entirely new and entirely found. Dedupe saves the cost on
  repeat uploads, not the first. Re-enrich and retry-failed can cost again.
  There's no daily lookup cap (decision #10); the parse preview's "to look
  up" count is the admin's warning.
- **Hit rate is unknown.** Many SFR companies are small property LLCs, not
  employers with work profiles, so FullEnrich may find emails for only part
  of a list. That directly limits SMS and email reach (§7.1). Phase 0
  gives a first read.
- **Name + company normalization is plain** (§4.1): punctuation and legal
  suffix variants of the same company won't dedupe.
- **Long runs in the web process.** Much less of a concern with 100-per-
  request batching, but a batch is still waited on inside the web process.
  Resume with re-poll covers a redeploy; a job queue is the long-term fix.
- **Personal data.** This stores enriched results for people who never
  signed up with us. An admin can delete a list, but the shared
  `enrichedPerson` records are kept on purpose (decision #21), and there's
  no retention period or purge for them yet.
- **Consent.** Same TCPA and CAN-SPAM gaps as Outbound (`outboundplan.md`
  §10): SMS relies on the admin's attestation, SMS opt-out is per Brevo
  list, email has no unsubscribe check or link. Calls from admin campaigns
  have no consent gate today, and this feature doesn't add one. This
  feature makes it easier to send to large cold lists on all three channels
  at once, which makes those gaps matter more.
- **Known issue left alone:** `buildResearchSummary` in
  `shared/fullenrichService.js` hardcodes "Oakland" (line 89), so today's
  calling CSV campaigns with enrichment on pitch Oakland in the research
  line whatever property is picked. Not fixed here (existing code); this
  feature's own `researchSummary.js` avoids it for its own calls.
- **Known issue left alone:** the lead-form controllers pass `phone` to
  `enrichPerson`, which ignores it, and three lead models describe their
  `enrichment` field as a "reverse-email/phone profile". Only email is ever
  looked up.

---

## 12. Decisions

All 22 questions from the first draft were answered by the requesting user
on 2026-09-26. Numbers match the original questions, and the rest of this
file cites them as "decision #N".

1. **Branch.** New branch `enrich-contacts` in both repos, cut from the
   latest `main` (pulled first), not from the stale `ogdensburg-outbound`.
   The backend branch exists and already has this plan committed.
2. **Imports.** Importing (never editing) calling modules is allowed:
   `dispatchCall` and `parsePhones` from `vapiService.js`, `resolveProperty`,
   `resolvePromptConfig`. Same for Outbound: `OutboundPropertyPicker`,
   `EmailComposer`, `CampaignProgress` and the Outbound services. (§1,
   §7.2, §8.1)
3. **How calls are started.** Option C: a small new runner around
   `dispatchCall` using the stored, edited enrichment. Not `runCampaign` /
   `createCampaign`. (§4.4, §7.2)
4. **Research summary for calls.** Built from the effective contact and the
   property picked at send time, never a hardcoded place. This fixes the
   Oakland problem for this feature's own `researchSummary.js` only;
   `shared/fullenrichService.js` is untouched. (§7.2)
5. **FullEnrich client.** A new dedicated `fullenrichClient.js`, not an
   export added to the shared file. Primary method: the name + company bulk
   endpoint. Reverse-email kept only as a fallback for rows with an email
   but no usable name + company. (§5.4)
6. **Several emails on a row.** First valid one only. (§4.1, §5.3)
7. **Re-enrichment.** Stored results are reused automatically. A per-row
   Re-enrich action forces a fresh lookup. Editing a row's name, company or
   email doesn't trigger re-enrichment; the row is marked stale until the
   admin asks. (§4.3, §5.5, §6, §7.4)
8. **SFR format.** Real sample reviewed: `Full Name, Address, City, State,
   Zip Code, Phones, Emails, Active Market, Company`; no emails, all rows
   have name + company + phone. The alias table uses these headers first.
   (§2.7, §5.3)
9. **Seeding.** The new store starts empty; no seeding from lead models'
   `enrichment` blobs. (§2.2)
10. **Size cap.** 500 rows per list, same as calling. No daily lookup cap
    for now. (§5.3, §6, §11)
11. **Contact type and property.** Contact type is optional, read per row
    from a CSV column if present, otherwise `unknown`; not a list-wide
    setting. The property is picked at send time, per dispatch, not bound
    to the list. (§4.2, §5.3, §7.5)
12. **Conflicts between CSV and FullEnrich.** The CSV value wins by default
    where both have one. FullEnrich's extra fields (found email, job title,
    industry, and so on) are added alongside, never replacing CSV identity
    fields. (§4.3, §8.3)
13. **Where edits live.** Only on the list's row (`overrides`), never written
    to the shared store. (§4.3, §7.4)
14. **Approval step.** None. Not excluded is enough to be sendable.
    (§4.3, §8.3)
15. **What gets sent.** Every non-excluded row that meets the channel's own
    requirement (phone for calls and SMS, plus email for SMS; email for
    email). No per-send row picker. (§6, §7.1)
16. **Outbound link-back.** Additive change to `outboundCampaignModel.js`:
    `"enrichment"` in the `source` enum and an optional `enrichmentListId`.
    (§5.2, §7.3)
17. **Phones for calls.** Call every valid phone on a row, like today's
    calling campaign. (§4.4, §7.2)
18. **Enriched fields in emails.** Yes, as merge tags: additive change to
    `outboundEmailService.js` (`ENRICHED_EMAIL_VARIABLES`,
    `buildRecipientVars`) plus a `vars` field on the Outbound recipient
    schema. Final tag list depends on what FullEnrich returns (Phase 0);
    `company` always works. (§5.2, §7.3)
19. **Several channels at once.** All selected channels start together;
    each runs at its own pace. No consent gate added for calls. (§7.2, §7.5)
20. **Naming.** "Enrichment", right after "Outbound" in the admin sidebar.
    (§3, §8.2)
21. **Retention.** An admin can delete a list. That deletes the list and its
    rows, not the shared `enrichedPerson` records. (§4, §6, §11)
22. **Skip enrichment.** No toggle; enrichment always runs on upload.
    (§4.2, §6, §8.1)

Also decided with the answers:
- **Dedupe key.** Normalized full name + company name (lowercased, trimmed,
  whitespace collapsed) is the primary key. Normalized email is a secondary
  key for rows that have one; if either key finds an existing record, it's
  reused. Chosen over email-first because real rows almost never have an
  email. (§4.1)
- **Fields requested.** Email only, not mobile phone. SFR rows already have
  a phone, and a mobile lookup costs 10 credits against 1 for a work email.
  (§2.8, §5.4)

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
  `dispatchCall` or to give up the enrichment.
- `buildResearchSummary` hardcodes Oakland, so it can't be reused for this
  feature's calls.
- Outbound's services can be driven directly (`parseContacts` +
  `createCampaign` + `startCampaign`) with no edits to Outbound, at the cost
  of those campaigns being recorded as `source: "csv"`.
- A 500-row list can take hours at one lookup at a time, so job state goes
  in Mongo with stale detection and a Resume action, not in memory.

22 open questions were listed in §12.

## 2026-09-26: SFR sample reviewed, lookup switched to name + company, all questions decided

Revised the plan in place. Still nothing built.

- **Real SFR export reviewed** (`Leadlist-Ogd - AI Call List.csv`, 20 rows,
  §2.7). 0 of 20 rows have an email; all 20 have a name, a company (mostly
  LLCs) and a phone; only 4 have an address. There's an `Active Market`
  column the first draft didn't know about. Reverse-email lookup can't work
  on this data.
- **FullEnrich's name + company bulk endpoint adopted as the primary
  mechanism** (`POST /api/v2/contact/enrich/bulk`, confirmed from
  `docs.fullenrich.com`, §2.8): first + last name + company name, up to 100
  contacts per request, charged only on a found match (work email 1 credit).
  Reverse-email is now a fallback for the rare row with an email but no
  usable name + company. We request email only, not phones.
- **Dedupe key changed** from normalized email to normalized name + company,
  with email as a secondary key. `enrichedPersonModel` redesigned around a
  sparse unique `dedupeKey` plus a sparse unique `lookupEmail` (§4.1). The
  row status `no_email` became `no_lookup_key`.
- **Timing re-estimated.** 500 rows is at most 5 batch submits, so minutes,
  not the 50 minutes to 8 hours estimated before. Mongo job state, stale
  detection and resume stay; resume and retry now re-poll an existing batch
  before resubmitting, so a redeploy doesn't pay twice. A per-poll
  heartbeat replaces the per-row one.
- **All 22 questions answered by the requesting user** and written into
  §12 and every section that referred to them. Notable effects: calls go
  through a new runner around `dispatchCall` with a per-property research
  summary; enriched fields become email merge tags (small additive change to
  `outboundEmailService.js` and the Outbound recipient schema);
  `outboundCampaignModel.js` gets `source: "enrichment"` and
  `enrichmentListId`; lists can be deleted without deleting shared results;
  no approve step, no per-send row picker, no skip-enrichment toggle; the
  property is picked per send.
- **Still to confirm in Phase 0** (§9): the exact response shape of the
  name + company endpoint, especially whether `custom` comes back per
  result, whether job title / industry come back when only email is
  requested, and the exact `enrich_fields` identifiers.

## Fill in what has changed each time we come back to this

Same pattern as `outboundplan.md` and `outbound.md`: read the sections above,
then add a new dated entry saying what changed. That includes phases
completed and any deviations from this plan.
