# Outbound SMS + Email: Implementation Plan

Companion to `outbound.md` in this repo. That file has the full research and
decision history and stays the source of truth. Anything already decided there
is taken as given here. This file covers **how** to build it.

Repos: backend `viharabackend` and frontend `vihara-new-website`, both on branch
`ogdensburg-outbound`. The feature itself is not Ogdensburg-specific.

**Status (2026-09-25): all 14 open questions are resolved, and a second round
of follow-up answers has been applied.** The sections below describe the final
v1 plan. §11 lists each decision in one line, and the dated entries at the
bottom say what changed from the original recommendations.

---

## 1. Summary

We're building a new admin feature that lets an admin pick a property and a set
of contacts (one typed in by hand, or a CSV), then:

- **SMS**: upsert each contact into **that property's own outbound SMS list in
  Brevo** (`productModel.brevoOutboundSmsListId`). A Brevo automation on that
  list sends the text (Option A from `outbound.md`). Our code never sends an
  SMS directly. It only puts the contact on the list with the right attributes.
  A property with no outbound list set up can't be texted; the UI says so.
- **Email**: render an admin-written subject and body for each contact and send
  it through the existing `src/utils/sendEmail.js` (Gmail via nodemailer). No
  Brevo for email.

The admin sets a maximum contact count for each campaign when launching it.
The server enforces one hard ceiling of 500 underneath that, the same for SMS
and email (§5.1).

Hard constraints, from `outbound.md`:

- Leave the existing calling path alone. No edits to, imports from, or
  dependencies on any of these:
  - frontend `src/components/AdminPanel/Calls/CallLauncher.jsx`
  - frontend `src/components/AdminPanel/Calls/VoiceAgentDashboard.jsx`
  - backend `src/services/calling/vapiCampaignService.js`
  - backend `src/controller/calling/vapiController.js`
  - backend `src/routes/calling/vapiRoutes.js`

  The new feature may look like CallLauncher, but it is written from scratch.
  That includes CSV parsing: we do **not** import `parseContactsCsv` from
  `vapiCampaignService.js`.
- Both SMS and Email have a property picker.
- Rate limiting is out of scope for now. It's listed under future concerns in
  §10.

---

## 2. What the research found (facts the plan depends on)

These come from reading the code, not guessing.

**`brevoService.js`**
- `upsertContact({ email, attributes, listIds }, label)` does
  `POST /v3/contacts` with `updateEnabled: true`. If Brevo returns 400 because
  the SMS number already belongs to another contact, it **saves the contact
  again without the SMS number** and returns `{ smsConflict: true }`. Any other
  error is thrown.
- `buildSmsAttributes(lead)` always sets `SMS` when the phone normalizes to
  `+1XXXXXXXXXX` (via `smsNumberOf` → `utils/usPhone.toUsSmsNumber`). It sets
  `SMS_OPT_IN` / `SMS_OPT_IN_AT` / `SMS_OPT_IN_URL` **only** when
  `lead.smsOptIn === true`, and never sends `false`.
- `buildAttributes` is the older persona builder. It only attaches `SMS` when
  the raw value is already E.164. New code should use `buildSmsAttributes`
  instead.
- `upsertContact`, `buildSmsAttributes` and `smsNumberOf` are **not exported**.
  Only the `sync*` functions and `trackEvent` are. So we need a new exported
  `sync*`-style function inside `brevoService.js` (see §5).
- How the list is chosen today: each funnel has an env var
  (`BREVO_PROPERTY_LIST_ID`, `BREVO_NORCAL_LIST_ID`, `BREVO_PARTNER_LIST_ID`, …).
  `syncPropertyLead` also takes a per-property override, `lead.listId`, which
  `propertyLeadController` fills from `productModel.brevoListId`. Any positive
  integer wins; otherwise the shared `BREVO_PROPERTY_LIST_ID` is used.
- The `productModel.brevoListId` comment says it is the list for "leads
  registering on this property's /auction/:slug page". So it is the **inbound
  registrant nurture list**, whose automation starts "the property email
  sequence". That matters for §4.
- `brevoListId` is set by the admin in Manage Listings
  (`ManageListings.jsx` edit modal → `PUT /api/v1/product/admin/:id/listing-settings`
  → `updateListingSettings` in `productController.js`, which accepts a positive
  integer or `null`/`""` to clear). The new outbound list field follows the
  exact same path (§5.2, §8.2).
- Property attributes on contacts are per-contact, not per-send:
  `PROPERTY_NAME` and `LISTING_URL` hold one value for the whole Brevo contact.
  An outbound upsert that writes them would overwrite the values an inbound
  registrant's automation relies on.

**`sendEmail.js`**
- Signature is `sendEmail(to, name, subject, html, attachments = [])`. `name`
  is accepted but never used.
- The transport is nodemailer with `service: 'Gmail'`, authenticated with
  `EMAIL_USERNAME` / `EMAIL_PASSWORD`. The sender is fixed as
  `"Vihara" <EMAIL_USERNAME>`, with no reply-to.
- **It is fire-and-forget.** It uses the `sendMail` callback form and returns
  `undefined`. Errors are only `console.log`ged. **A caller cannot tell whether
  a given email was accepted or failed.** For a bulk sender with an audit trail
  this is the biggest gap. It's closed by the additive `sendEmailAsync` export
  (§5.2, §5.3; decided, §11 #6).
- The same Gmail account sends password resets, registration confirmations,
  auction emails and so on (about 30 call sites). A bulk send that gets that
  account throttled or locked would break all of them.

**Unsubscribes**
- `GET /api/unsubscribe?email=` writes to the `Unsubscribe` collection
  (`model/integrations/unsubscribeModel.js`). The newsletter template has a
  footer link to it, hardcoded to `https://viharabackend.onrender.com`.
- **Nothing in the codebase reads that collection before sending.** Outbound
  email v1 won't either: checking it and adding an unsubscribe link were both
  **deferred** by decision (§11 #9). This is a known gap, tracked in §10.

**Calling reference (read only, not reused)**
- `vapiCampaignService.js` tracks campaigns in memory in a `Map` with a 24h TTL.
  Its own comment says: "Lost on process restart … Move to Mongo if the API
  ever runs on more than one instance."
- Its pattern: the controller returns `202` with a `jobId`, the worker runs
  after the response, and the UI polls every 3s. Calls use a fixed 500-contact
  cap; outbound does **not** copy that as-is: the admin sets a limit per
  campaign, under a 500 ceiling (§11 #12). CSV is posted as raw text in
  JSON, not multipart. The body limit is 5mb in `app.js`, which is plenty at
  the outbound ceiling (500 rows is roughly 100KB of CSV).

**Auth**
- Admin routes use
  `router.use(isAuthenticated, authorizeRoles("admin"))` from
  `src/middleware/auth.js`. This is cookie JWT → `userModel`, and it sets
  `req.user` (which has `.email`). `middleware/adminAuth.js`
  (`resolveAdvisor`) is only for lead notes and isn't needed here.

**Routing and mounting**
- Route files are grouped by domain under `src/routes/<domain>/`, with matching
  `src/controller/<domain>/`, `src/services/<domain>/` and `src/model/<domain>/`.
- They are mounted in `src/app.js` with `app.use("/api/v1/...", router)`.

**Property data for the picker**
- `GET /api/v1/product/admin/all` (`getAllProductsAdmin`) already returns
  `productName street city state zipCode slug brevoListId isTestProperty status
  startBid auctionStartDate auctionEndDate …`. With `brevoOutboundSmsListId`
  added to its `.select(...)` (§5.2), that's everything the picker needs,
  including whether a property is set up for outbound SMS.
- Frontend: `getAllProductsAdmin()` in `src/services/admin.service.js`. It is a
  generic listings function, not part of the calling path, so it's fine to
  import.

**Frontend admin shell**
- `Core/adminPanel.jsx` switches on a `?tab=` value that must be listed in
  `VALID_TABS`, and renders `{mainContent === 'x' && <X />}`.
- `Core/adminPanelSidebar.jsx` is a flat list of `<li>` items calling
  `navTo('x')`, using `@phosphor-icons/react`.
- The API layer is `src/api/<domain>.api.js` (on `apiClient` from
  `src/api/client.js`, `withCredentials`), wrapped by
  `src/services/<domain>.service.js`.
- `LeadsHub` is the precedent for "one sidebar entry, a picker inside".

---

## 3. Layout (decided, §11 #1)

**One "Outbound" sidebar entry (`?tab=outbound`) with three inner tabs: SMS,
Email and History.** The active inner tab goes in the URL as
`&channel=sms|email|history` so each one can be linked directly.

Why:
- **The two channels share most of the screen.** Property picker,
  single-or-CSV contact targeting, the parse preview, the progress view and the
  campaign history are all the same. `outbound.md` already says the targeting
  component should be shared between SMS and Email. One hub makes that sharing
  natural rather than something two parallel sections have to keep in sync.
- **There's one history collection for both channels** (§6). A single History
  tab with a channel filter beats two half-histories.
- **The sidebar is already long** (about 17 flat items). One entry is better
  than two.
- **There's already a precedent.** `LeadsHub` uses "one entry, picker inside".
- **It leaves room for later.** If Calls are ever folded in (deferred in
  `outbound.md`), that's one more inner tab. Nothing has to move.

The trade-off: two sidebar entries would give each channel a one-click entry.
The `channel` query param gets most of that back.

---

## 4. SMS property → Brevo list model (decided, §11 #2: one list per property)

**Decision: each property that needs outbound SMS gets its own dedicated Brevo
list with its own automation.** The list id lives on the property in a new
field, `productModel.brevoOutboundSmsListId`, set by the admin in Manage
Listings. It is separate from the existing `brevoListId`.

This reverses the original recommendation (one shared outbound list). The
reasons for going per-property:

- **It matches the precedent already in the codebase.** Inbound registrant
  leads already use a per-property list override (`productModel.brevoListId`).
  Outbound SMS follows the same shape with its own field.
- **No branching logic inside one Brevo automation.** With a shared list, one
  automation has to personalize the text for every property through
  attributes or conditional branches. With one automation per property, each
  one's text is simply written for that property.
- **Per-property analytics in Brevo for free.** Brevo's own list and
  automation dashboards then show sends, deliveries and replies per property,
  with no extra work on our side.
- **The extra setup is small and one-time per property.** Setting up a new
  property means duplicating an existing automation and pointing it at a new
  list, which takes a few minutes. New properties launch rarely, so this is not
  the ongoing engineering burden the original recommendation assumed.

What picking a property does on the SMS side:
- It **picks the list.** Contacts go to
  `resolveOutboundSmsListId(property)`, which returns
  `property.brevoOutboundSmsListId` when it is a positive integer.
- **There is no fallback list.** If the property has no outbound list set, the
  resolver returns `null`, the picker shows "Not set up for outbound SMS yet",
  the Launch button stays disabled, and the launch endpoint rejects the request
  with a clear 400 ("<property> has no outbound SMS list. Set one in Manage
  Listings."). Silently sending to some default list would mean texting people
  with another property's automation, or a generic one.
- It **stamps property context onto the contact** for reference and audit:
  - `OUTBOUND_PROPERTY_NAME` (for example "Ogdensburg")
  - `OUTBOUND_LISTING_URL` (`listingPageUrl(slug)` from `config/siteUrls.js`)
  - `OUTBOUND_PROPERTY_SLUG`
  - `OUTBOUND_SENT_AT` (Date)
  - `FIRSTNAME` (Brevo default)
  - `SMS` plus the `SMS_OPT_IN*` attributes (via `buildSmsAttributes`, see
    consent below)

  The `OUTBOUND_*` names are deliberately different from `PROPERTY_NAME` and
  `LISTING_URL`. That way an outbound send never overwrites what an inbound
  registrant's own automation relies on, even when the same person is on both
  lists.

  Because these attributes hold one value per contact, a contact texted for
  property A and then property B shortly after carries B's values. So each
  property's automation should **write the property name and link directly
  into its SMS text**, and use only `{{contact.FIRSTNAME}}` from attributes.
  The `OUTBOUND_*` attributes stay useful for filtering and for seeing the
  latest send in Brevo, but the message shouldn't depend on them.
- It gets **recorded on the campaign document** (§6) for the audit trail,
  including the list id actually used.

Why not reuse `productModel.brevoListId`:
- That field is the **inbound registrant nurture list**. Its automation starts
  the property email sequence for people who registered on the auction page.
- Upserting cold, admin-imported contacts into it would enroll them in a flow
  written for opted-in registrants. It would also make those lists meaningless
  as "people who registered".

**Consent (decided, §11 #3).** Admin-imported contacts haven't ticked an
opt-in box themselves. The SMS launcher has a **required** checkbox: "These
contacts have given consent to receive texts." The launch endpoint rejects any
SMS campaign where `consentAttested` isn't `true`. When it is, every contact in
the campaign is upserted with `smsOptIn: true`, so `buildSmsAttributes` sets
`SMS_OPT_IN` / `SMS_OPT_IN_AT`, and the attestation is stored on the campaign
as `sms.consentAttested` together with who ticked it (`createdBy`). We never
set `SMS_OPT_IN` without the checkbox. Texting cold lists without real prior
consent still carries legal (TCPA) risk; the checkbox records the admin's
statement but doesn't make it true.

**Re-sends (decided, §11 #4): remove-then-add on every send.** Brevo may not
fire "contact added to list" again for a contact already on the list. So for
every recipient, `syncOutboundSmsContact` first removes the contact from the
target property's list (`POST /v3/contacts/lists/{listId}/contacts/remove`),
then upserts it with that list. Every send is a fresh "added". This is scoped
to the one property list being targeted; the contact's membership in other
property lists is left alone.

**Things to check in Brevo before building (Phase 0):**

1. **Re-trigger behavior.** Confirm that remove-then-add fires the automation
   again for someone who was already on the list, and check the automation's
   own re-entry setting doesn't block it.
2. **The automation filters on `SMS_OPT_IN`.** Each property automation should
   only text contacts with `SMS_OPT_IN` set, as a second guard behind the
   consent checkbox.
**Opt-out scope (confirmed: per list only; accepted risk).** A STOP reply in
Brevo applies only to the list it came from, not to the contact across the
account. Combined with per-property lists, this means **someone who replies
STOP to property A's texts is not suppressed from property B's list**. If an
admin later imports them for property B, they will be texted again. This is a
real compliance (TCPA) risk. It is **accepted as-is for v1**: the user
confirmed per-list scope is fine, and no suppression layer of our own is being
built to compensate. Tracked in §10.

---

## 5. Backend plan (`viharabackend`)

### 5.1 New files

| Path | What it does |
|---|---|
| `src/model/outbound/outboundCampaignModel.js` | Mongoose model for campaigns and their recipients, for both channels. Schema in §6. |
| `src/services/outbound/outboundContactsService.js` | Parses CSV and normalizes contacts, written fresh with `papaparse` (already a dependency). Headers are matched case- and space-insensitively, with aliases: `full name`/`name`/`first name`, `phone`/`phones`/`phone number`, `email`/`emails`. Multiple values split on `\|` and the first valid one wins. Validation depends on the channel: SMS needs **both** a phone that passes `toUsSmsNumber` **and** an email, and rows missing either are skipped with a clear reason (decided, §11 #5); Email needs an email that matches a basic regex. Removes duplicates within the batch (by normalized phone for SMS, lowercased email for Email). **Contact limits:** exports `MAX_CONTACTS_CEILING = 500`, the single hard server-side ceiling shared by SMS and email, plus `validateMaxContacts(maxContacts)`, which throws a 400 unless `maxContacts` is a positive integer no greater than the ceiling ("Max contacts per campaign is 500; you asked for 800"). If the number of ready contacts is over the admin's `maxContacts`, the parse result says so (`overLimit: true`) and launch is rejected with a clear message. Contacts are never silently cut off. Returns `{ contacts, skipped: [{ row, name, reason }], overLimit }`. The single-contact form goes through the same normalizer, so there's one code path. |
| `src/services/outbound/outboundCampaignService.js` | Campaign lifecycle for both channels: `createCampaign(...)`, `startCampaign(id)` (kicks off the channel runner after the HTTP response, like calls do), `markRecipient(id, index, patch)` (one atomic `$set` on the recipient plus `$inc` on the counters), `finishCampaign(id, status, error)`, `getCampaign(id, { recent, all })` (recent N recipients by default, the full list only when `all` is set; §6), `listCampaigns(filter, page, limit)`. Also handles stale runs lazily: on read, a `running` campaign whose `updatedAt` is older than 10 minutes gets flipped to `interrupted`, which covers a Render restart mid-run with no startup hook (`updatedAt` moves on every recipient, so a long but healthy run isn't flagged). Also exports **`resolveOutboundSmsListId(property)`**: returns `property.brevoOutboundSmsListId` if it's a positive integer, otherwise `null`. This is the real v1 mechanism (§4), with no env fallback. Callers treat `null` as "not set up for outbound SMS". |
| `src/services/outbound/outboundSmsService.js` | `runSmsCampaign(campaignId)`. Loads the campaign and property, then processes recipients **one at a time**, calling `brevoService.syncOutboundSmsContact({ ...recipient, listId: campaign.sms.listId, smsOptIn: true, property })` for each and recording the result. It uses the list id snapshotted on the campaign at launch, so editing the property's list mid-run can't split a campaign across two lists. Outcomes: `succeeded` means "added to Brevo list". `smsConflict: true` is recorded as **`failed`** with reason "SMS number already on another Brevo contact", because the fallback saved the contact without the number, so the automation can't text them. A thrown or `success: false` result is `failed` with Brevo's message. Uses a small fixed delay between contacts (e.g. 250ms). That's politeness, not rate-limit engineering. |
| `src/services/outbound/outboundEmailService.js` | `EMAIL_VARIABLES` catalogue; `renderTemplate(str, vars)` (`{{key}}` substitution, HTML-escaped values, unknown keys left blank); `buildRecipientVars(contact, property)`; `renderEmail({ subject, body, bodyFormat }, contact, property)` → `{ subject, html }`; `runEmailCampaign(campaignId)`. For each recipient it renders, calls `sendEmailAsync(...)` (see §5.3), and records `succeeded` with the `messageId`, or `failed`. **v1 does not check the `Unsubscribe` collection** (deferred by decision, §11 #9 and §10). Variables v1: `first_name`, `full_name`, `property_name`, `property_address`, `property_city`, `property_state`, `listing_url`, `auction_url`, `start_bid`, `auction_start`, `auction_end`. |
| `src/htmlPages/outbound/outboundEmailLayout.js` | Wraps the rendered body in a plain, email-safe Vihara layout. Text-format bodies (the default) are escaped and turned into `<p>` paragraphs (blank-line split, `<br>` for single newlines); HTML-format bodies are inserted as written (decided, §11 #8). **No unsubscribe footer link in v1** (deferred, §11 #9 and §10). When it's built, the footer goes here. |
| `src/controller/outbound/outboundController.js` | Thin handlers wrapped in `catchAsyncError` that throw `Errorhandler`: `getConfig`, `parseContacts`, `launchSmsCampaign`, `previewEmail`, `sendTestEmail`, `launchEmailCampaign`, `listCampaigns`, `getCampaign`. Each launch handler loads the property by `propertyId` (404 if missing), checks `maxContacts` with `validateMaxContacts` (400 if missing or over the 500 ceiling), validates and normalizes the contacts (400 if the ready count is over `maxContacts`), creates the campaign doc with `createdBy` from `req.user`, responds `202 { campaignId, total, skipped }`, then calls `startCampaign` without awaiting it. `launchSmsCampaign` also: rejects with 400 unless `consentAttested === true`; resolves the list with `resolveOutboundSmsListId(property)` and rejects with 400 ("<property> is not set up for outbound SMS yet. Add its Brevo list id in Manage Listings.") if it's `null`; and snapshots the resolved id into `sms.listId`. |
| `src/routes/outbound/outboundRoutes.js` | `router.use(isAuthenticated, authorizeRoles("admin"))`, then the routes in §7. |

### 5.2 Changes to existing backend files (all additive)

| File | Change |
|---|---|
| `src/app.js` | `const outboundRoutes = require("./routes/outbound/outboundRoutes");` and `app.use("/api/v1/outbound", outboundRoutes);` next to the other `/api/v1/*` mounts. |
| `src/model/property/productModel.js` | Add `brevoOutboundSmsListId: { type: Number, default: null }` right after `brevoListId`, with a comment: the Brevo list for **admin-triggered outbound SMS** for this property; `null` means the property isn't set up for outbound SMS. It's separate from `brevoListId` (inbound registrant nurture). |
| `src/controller/property/productController.js` | `getAllProductsAdmin`: add `brevoOutboundSmsListId` to the `.select(...)` string. `updateListingSettings`: accept `brevoOutboundSmsListId` with exactly the same rule as the existing `brevoListId` block (positive integer, or `null`/`""` to clear, otherwise 400 "Invalid brevoOutboundSmsListId value"), and include it in the response's `product` object. Existing behavior is unchanged. |
| `src/services/integrations/brevoService.js` | Add and export **`syncOutboundSmsContact(contact)`**, written the same way as `syncNorCalLead` / `syncPartnerLead`. It **requires** `contact.listId` (a positive integer resolved by the caller; if it's missing it returns `{ success: false, error: "no outbound SMS list" }`, and there's no env fallback). It first removes the contact from that list (`POST /v3/contacts/lists/{listId}/contacts/remove`, ignoring "contact not in list" responses), then builds `{ FIRSTNAME, OUTBOUND_PROPERTY_NAME, OUTBOUND_LISTING_URL, OUTBOUND_PROPERTY_SLUG, OUTBOUND_SENT_AT, ...buildSmsAttributes(contact) }` (with `contact.smsOptIn === true` because the campaign was consent-attested), calls the existing `upsertContact(..., "outbound-sms")` with `listIds: [contact.listId]`, and returns `{ success, smsConflict }` or `{ success: false, error }`. It doesn't throw. **Existing functions are untouched.** |
| `src/utils/sendEmail.js` | **Decided (§11 #6).** Add a sibling export `sendEmailAsync(to, subject, html, attachments)` that reuses the same `transporter` and returns `transporter.sendMail(mailOptions)` (a Promise resolving to `info` with `messageId` / `response`). The default export `sendEmail` stays exactly as it is. The plain callback form is kept for existing callers on purpose: turning `sendEmail` itself into a rejecting Promise would create unhandled rejections at about 30 call sites that don't await it, and that can crash the Node process. Exports become `module.exports = sendEmail; module.exports.sendEmailAsync = sendEmailAsync;`, so every existing `require('../utils/sendEmail')` keeps working. |

### 5.3 Why email needs `sendEmailAsync`

Without it, the email runner can only record "handed to nodemailer". Every
recipient would show as a success even if Gmail rejected the whole batch.
Credentials expired, the account got throttled, or the address was malformed:
none of it would show up. That makes the audit trail misleading. The change is
small and additive, and it still uses the existing `sendEmail.js`
module and transport, which is in line with the "use the existing sender"
decision. The user approved it (§11 #6).

Sender identity stays `"Vihara" <EMAIL_USERNAME>`, the existing Gmail
transactional account, with no reply-to (decided, §11 #7). The rate-limit
risk that comes with that is accepted for now and noted in §10.

### 5.4 Env vars

**No new env vars in v1.**

- `BREVO_OUTBOUND_SMS_LIST_ID` (a single shared list) is **dropped**. Lists
  are per property and live on `productModel.brevoOutboundSmsListId`. A shared
  fallback env var was considered and rejected on purpose: a property with no
  list should show up clearly as "not set up", not quietly send to a default
  list whose automation was written for something else.
- `BACKEND_PUBLIC_URL` is **not needed in v1**. It was only for the
  unsubscribe link, which is deferred (§10). Add it when that's built.
- The contact ceiling (`MAX_CONTACTS_CEILING = 500`, shared by SMS and
  email) is a code constant in `outboundContactsService.js`, not an env var.
  Raising it should be a deliberate code change.
- Existing and reused: `BREVO_API_KEY`, `EMAIL_USERNAME`, `EMAIL_PASSWORD`,
  `PUBLIC_SITE_URL`.

### 5.5 Brevo dashboard setup (done by the user, not in code)

**Once, for the whole account:**

1. Pre-create these contact attributes (Brevo attributes are account-wide, so
   every property list shares them):
   - `OUTBOUND_PROPERTY_NAME` (text)
   - `OUTBOUND_LISTING_URL` (text)
   - `OUTBOUND_PROPERTY_SLUG` (text)
   - `OUTBOUND_SENT_AT` (date)

   Brevo returns 400 on any attribute it doesn't know about.
2. Build the first property's automation carefully (see the per-property steps
   below). It becomes the template that later properties copy.

**For each property that needs outbound SMS (repeat whenever a property
launches):**

1. Create a list named like "Outbound SMS - <Property name>".
2. Duplicate an existing outbound SMS automation and point its trigger
   ("contact added to list") at the new list.
3. Edit the SMS text for this property. Write the property name and listing
   link directly into the text, and use `{{contact.FIRSTNAME}}` for the name
   (see §4 for why the text shouldn't rely on `OUTBOUND_*` attributes).
4. Make sure the automation only texts contacts with `SMS_OPT_IN` set, and its
   re-entry setting lets remove-then-add trigger again (§4).
5. Put the list id into that property's "Outbound SMS list id" field in
   Manage Listings. Until this is done, the property shows as "not set up for
   outbound SMS" in the Outbound picker and can't be texted.

This is a real, ongoing setup step each time a new property needs outbound
SMS (a few minutes each), not a one-time task. The SMS wording lives in these
automations and isn't editable from our admin UI (decided, §11 #11).

---

## 6. Campaign tracking in a new Mongo collection, not in memory

**Recommendation: a real Mongoose collection.** Don't copy the in-memory `Map`
that calls use.

Why:
- **SMS sends can't be seen from our side at all.** The campaign record is the
  only evidence of what an admin sent, to whom, for which property and when. An
  in-memory job that disappears on restart or after 24h defeats that.
- **Render restarts and redeploys are routine.** The calling service's own
  comment already says "move to Mongo" as the correct end state.
- **A History tab needs data that persists.**
- **It's cheap.** At the hard ceiling of 500 embedded recipients, a document
  is roughly 100–200KB, far under Mongo's 16MB document limit, even with the
  email body stored once. Polling returns only recent recipients by default
  (§7), so the UI doesn't pull the whole document every 3s.

**Collection:** `outboundCampaignModel` (`src/model/outbound/outboundCampaignModel.js`).
`timestamps: true`.

| Field | Type | Notes |
|---|---|---|
| `channel` | String, enum `sms`, `email`, required | |
| `status` | String, enum `queued`, `running`, `completed`, `failed`, `interrupted`, default `queued` | `interrupted` is set lazily for stale `running` docs (§5.1). |
| `source` | String, enum `single`, `csv` | Which UI mode created it. |
| `csvFileName` | String, default `""` | |
| `maxContacts` | Number, required | The limit the admin set at launch. Always ≤ the hard ceiling of 500 (same for both channels). Kept for the audit trail. |
| `property.id` | ObjectId, ref `productModel`, required | |
| `property.name` | String | Snapshot of `productName`, so history still reads correctly if the listing changes. |
| `property.slug` | String | Snapshot. |
| `property.address` | String | Snapshot: `street, city, state`. |
| `createdBy.id` | ObjectId, ref `userModel` | From `req.user`. |
| `createdBy.email` | String | |
| `createdBy.name` | String | |
| `sms.listId` | Number, required when `channel` is `sms` | Snapshot of the property's `brevoOutboundSmsListId` at launch: the per-property Brevo list actually targeted. There's no list-source enum; per-property is the only v1 path and there's no fallback. |
| `sms.consentAttested` | Boolean, required `true` when `channel` is `sms` | The admin's consent attestation (§4). A campaign can't be created without it. |
| `email.subject` | String | The template, before substitution. |
| `email.body` | String | The template, before substitution. |
| `email.bodyFormat` | String, enum `text`, `html`, default `text` | |
| `counts.total` | Number | |
| `counts.processed` | Number | |
| `counts.succeeded` | Number | SMS means "added to Brevo list"; Email means "accepted by the mail server". The UI labels these per channel. |
| `counts.skipped` | Number | Not used by the v1 runners (invalid and duplicate rows are dropped at parse time into `parseSkipped`). Kept for when the unsubscribe check is added (§10). |
| `counts.failed` | Number | |
| `parseSkipped` | `[{ row: Number, name: String, reason: String }]` | Rows dropped at parse time (invalid or missing phone or email, duplicates). Kept for the audit trail. |
| `recipients` | Array of subdocs, no `_id` | One per accepted contact, in order. |
| `recipients[].name` | String | |
| `recipients[].email` | String, lowercased | |
| `recipients[].phone` | String | Normalized `+1XXXXXXXXXX`; SMS only. |
| `recipients[].status` | String, enum `pending`, `succeeded`, `skipped`, `failed` | `skipped` is unused in v1 (see `counts.skipped`). |
| `recipients[].reason` | String | Fail reason (Brevo or SMTP message). |
| `recipients[].smsConflict` | Boolean | SMS only. |
| `recipients[].messageId` | String | Email only, from `sendEmailAsync`. |
| `recipients[].processedAt` | Date | |
| `error` | String | Set if the whole campaign aborted. |
| `startedAt`, `finishedAt` | Date | |

**Indexes:**
- `{ createdAt: -1 }`
- `{ channel: 1, createdAt: -1 }`
- `{ "property.id": 1, createdAt: -1 }`

**Payload rules:**
- `GET /campaigns` (the list) uses projection `-recipients -email.body` to keep
  the payload small.
- `GET /campaigns/:id` is lightweight by default: it returns the campaign
  fields, the counters, and only the last N processed recipients (a `$slice`
  projection). N comes from `?recent=N` and defaults to 50 when omitted (capped
  at the 500 ceiling). This is what the progress view polls with.
- `GET /campaigns/:id?all=true` returns the full recipient list. It is only
  used when explicitly asked for (the "View all recipients" action in the
  progress view and the History detail view), never for live polling. `all`
  takes precedence over `recent` if both are sent.
- The client-safe view adds `progress = round(processed / total * 100)`.

Outbound contacts live only in this collection. They don't appear in LeadsHub
or any lead model (decided, §11 #13).

---

## 7. API endpoints

All of these are under `/api/v1/outbound` and admin only (`isAuthenticated` +
`authorizeRoles("admin")`). JSON bodies. CSV is sent as raw text in `csvData`,
the same as calls.

| Method | Path | Purpose |
|---|---|---|
| GET | `/config` | Query `propertyId?`. Always returns `{ email: { configured: bool, from }, maxContactsCeiling: 500, emailVariables: [{ key, label }] }`. With `propertyId`, it also returns `sms: { configured: bool, listId: Number \| null }` for **that property** (`configured` is `resolveOutboundSmsListId(property) !== null`). SMS setup is a per-property question now, so there's no global "SMS configured" flag. The picker already shows each property's status from `getAllProductsAdmin`; this call confirms it for the selected property right before launch. |
| POST | `/contacts/parse` | Body `{ channel, maxContacts?, csvData? , contact? }`. Parses and validates only; **sends nothing**. If `maxContacts` is given, it's checked against the 500 ceiling (400 if over), and the result flags `overLimit` when the ready count is over it. Returns `{ contacts, skipped, total, overLimit }` so the UI can show a preview table ("412 ready, 23 skipped: invalid phone"). |
| POST | `/sms/campaigns` | Body `{ propertyId, maxContacts, consentAttested, csvData? , contact?, source, csvFileName? }`. Rejects with 400 if: `maxContacts` is missing, not a positive integer, or over 500; the ready count is over `maxContacts`; `consentAttested !== true`; or the property has no `brevoOutboundSmsListId`. Otherwise it creates the campaign, returns `202 { campaignId, total, skipped }`, and runs in the background. Single contact and CSV both use this endpoint; a single contact is just a campaign of 1. |
| POST | `/email/preview` | Body `{ propertyId, subject, body, bodyFormat, contact? }`. Returns the rendered `{ subject, html }` for one sample contact (the first parsed row, or dummy values). Sends nothing. |
| POST | `/email/test` | Body `{ propertyId, subject, body, bodyFormat }`. Sends one rendered email **only to `req.user.email`** (the logged-in admin), using sample variables. Not recorded as a campaign. Returns `{ success, messageId }` or the SMTP error. |
| POST | `/email/campaigns` | Body `{ propertyId, maxContacts, subject, body, bodyFormat, csvData?, contact?, source, csvFileName? }`. Same `maxContacts` rules as SMS, with the same 500 ceiling. Same `202` pattern as SMS. |
| GET | `/campaigns` | Query `channel?, propertyId?, page=1, limit=20`. History list, newest first, without recipients. |
| GET | `/campaigns/:id` | Query `recent?`, `all?`. **Default is lightweight:** campaign fields, counters, and only the last `recent` processed recipients (`recent` defaults to 50). `?all=true` returns the full recipient list and is only sent on an explicit "View all" action or the History detail view. The progress view polls every 3s in the default mode while the campaign is running. |

Route order note: `/campaigns` and `/config` are literal paths and there's no
`/:param` at the root, so nothing gets shadowed.

---

## 8. Frontend plan (`vihara-new-website`)

### 8.1 New files

| Path | What it does |
|---|---|
| `src/api/outbound.api.js` | Thin `apiClient` calls for each endpoint in §7. It's a separate file from `admin.api.js`, following the per-domain `norCal.api.js` / `partner.api.js` pattern. That keeps the calling-related `admin.api.js` untouched. |
| `src/services/outbound.service.js` | Wraps `outbound.api.js`. Does client-side guard checks (property selected, CSV not empty, `maxContacts` set and within the 500 ceiling from `/config`, subject and body present, consent ticked for SMS) and unwraps `data` into plain objects, the same way `admin.service.js` does. |
| `src/components/AdminPanel/Outbound/OutboundHub.jsx` + `OutboundHub.css` | The page for `?tab=outbound`. It has the SMS / Email / History inner tabs, synced to `&channel=` via `useSearchParams`. It loads `/config` once (without `propertyId`) for the ceiling, email sender and variables, and passes it down. CSS uses an `obx-` class prefix so it can't collide with CallLauncher's `vcl-` classes. |
| `src/components/AdminPanel/Outbound/OutboundPropertyPicker.jsx` | A fresh property dropdown. It calls `getAllProductsAdmin()` from `admin.service.js` (a listings function, not part of the calling path), sorts by name, and labels options `productName — street, city, state`. It **shows every property** (decided, §11 #14), with non-blocking inline warnings on `isTestProperty` and on `status !== 'active'`, the same way CallLauncher shows everything. Takes a `channel` prop. On the SMS tab it also shows each property's outbound SMS status: "SMS list #N" when `brevoOutboundSmsListId` is set, and "Not set up for outbound SMS yet — add a list id in Manage Listings" when it isn't. That one blocks launch (the others don't). |
| `src/components/AdminPanel/Outbound/ContactTargeting.jsx` | Shared by SMS and Email. It has two modes: **Single** (name, phone, email; for SMS both phone and email are required) and **CSV** (a "Choose .csv" button using `FileReader`, a paste box, a Clear button, and a header hint that depends on channel). It has a **"Max contacts" number input** (required, empty by default, with the 500 ceiling from `/config` shown as the upper bound for both channels; values over the ceiling are refused inline). A "Check contacts" button calls `/contacts/parse` with `maxContacts` and shows ready vs. skipped counts, a clear "N ready is over your limit of M" warning when `overLimit`, and a collapsible table of skipped rows with reasons. It reports the result upward with `onChange({ source, csvData, csvFileName, contact, maxContacts, parsed })`. |
| `src/components/AdminPanel/Outbound/SmsLauncher.jsx` | Property picker (with SMS status), then `ContactTargeting`, then an info panel explaining that the text itself is written in this property's Brevo automation on list #N, not here, with the exact attributes that will be set. Then a **required** consent checkbox: "These contacts have given consent to receive texts." The Launch button is disabled until the property has an outbound SMS list, contacts parse to more than zero ready and not over the limit, `maxContacts` is set, and consent is ticked. A confirmation dialog shows "Add N contacts to Brevo list #X for <property>? (limit M)". After launch it shows `CampaignProgress`. |
| `src/components/AdminPanel/Outbound/EmailComposer.jsx` | Subject input, body textarea, a text/HTML format toggle (plain text by default, decided §11 #8), and variable chips that insert `{{key}}` at the cursor. That's the same UX idea as CallLauncher's variable panel, written fresh. The chips show the selected property's current value. There's a "Preview" button (calls `/email/preview` and renders the HTML in a sandboxed `<iframe srcDoc>`) and a "Send test to me" button (calls `/email/test` and shows which address it went to). |
| `src/components/AdminPanel/Outbound/EmailLauncher.jsx` | Property picker, then `ContactTargeting`, then `EmailComposer`, then Launch with confirmation ("Send N emails from <from address> for <property>? (limit M)"). After launch it shows `CampaignProgress`. |
| `src/components/AdminPanel/Outbound/CampaignProgress.jsx` | Takes a `campaignId` and polls `GET /campaigns/:id` in the default lightweight mode (last 50 recipients) through `useCampaignPolling`. Shows the status pill, progress bar, processed/total, and succeeded and failed counts (labeled per channel), plus the latest results list and a "Start another" button. A separate **"View all recipients"** action makes a one-off `GET /campaigns/:id?all=true` call and shows the full list with reasons; it doesn't change what the poll fetches. Stops polling on `completed`, `failed` or `interrupted`. |
| `src/components/AdminPanel/Outbound/useCampaignPolling.js` | A small hook that polls every 3s, cleans up on unmount, and stops on a terminal status. It's separate so History's detail view can reuse it. |
| `src/components/AdminPanel/Outbound/CampaignHistory.jsx` | A paginated table from `GET /campaigns`: date, channel, property, created by, total, succeeded, failed, limit, status. It has filters for channel and property. Clicking a row opens the full recipient list (with reasons, fetched with `?all=true`); SMS rows also show the list id and the consent attestation, and email rows show the subject and body template. |

### 8.2 Changes to existing frontend files (additive)

| File | Change |
|---|---|
| `src/components/AdminPanel/Core/adminPanel.jsx` | `import OutboundHub from '../Outbound/OutboundHub';`, add `'outbound'` to `VALID_TABS`, and add `{mainContent === 'outbound' && <OutboundHub />}`. |
| `src/components/AdminPanel/Core/adminPanelSidebar.jsx` | Add one `<li>` "Outbound" that calls `navTo('outbound')`, using a Phosphor icon (e.g. `PaperPlaneTiltIcon`). Put it right after the Voice Agent / Scheduled Callbacks group. That group itself isn't changed. |
| `src/components/AdminPanel/Listings/ManageListings.jsx` | In `EditListingModal`, add an "Outbound SMS list id" field next to the existing "Brevo list id" field, with the same state/validation/save pattern (`brevoOutboundSmsListId`, positive integer or blank to clear; hint: "blank = not set up for outbound SMS"). Relabel the existing field's hint only if needed so the two are clearly distinguished (for example, "Registrant list id"). Sent through the existing listing-settings update call. |

Nothing under `src/components/AdminPanel/Calls/` is touched, and neither are
the vapi functions in `admin.service.js` / `admin.api.js`.

Small catch: `adminPanel.jsx` calls `setSearchParams({ tab })` when navigating,
which drops `channel`. That's fine because the hub defaults to `sms`. But
`OutboundHub` has to update `channel` with
`setSearchParams(prev => { prev.set('channel', x); return prev; })` so it
doesn't wipe out `tab`.

---

## 9. Phased build order

Each phase ends with something working and checked. Per the standing rules:
no real SMS or email goes to anyone other than the user's own phone or email
without asking first, and nothing is pushed without an explicit go-ahead.

### Phase 0: Set up Brevo (no code)
- All decisions are made (§11). Nothing left to confirm before building.
- User creates the four `OUTBOUND_*` attributes, then the list and automation
  for the first property (§5.5), and notes its list id for Phase 2.
- With the user's permission, check these using one test contact that is the
  user's own phone:
  - (a) adding to the list triggers the SMS;
  - (b) removing and re-adding the same contact triggers it again (§4);
  - (c) the automation skips a contact without `SMS_OPT_IN`.
- Opt-out scope doesn't need checking: it's confirmed that a STOP reply only
  applies to the list it came from, and that's accepted for v1 (§4, §10).
- The Brevo IP allowlist issue from the Brevo QC work is already fixed
  (§11 #10), so it doesn't block this.

### Phase 1: Backend foundations (no sends)
- `outboundCampaignModel`, `outboundContactsService` (including the ceiling
  and `validateMaxContacts`), `outboundCampaignService`, `outboundController`
  (just `getConfig`, `parseContacts`, `listCampaigns`, `getCampaign`),
  `outboundRoutes`, and the `app.js` mount.
- `productModel.brevoOutboundSmsListId`, plus the `getAllProductsAdmin` select
  and `updateListingSettings` changes.
- Check:
  - `/config` (with and without `propertyId`, for a property with and without
    an outbound list) and `/contacts/parse` using curl with an admin cookie;
  - sample CSVs: a PropStream-shaped one, a lead-list-shaped one, one with
    junk rows, one over an admin-set `maxContacts` (gets `overLimit`), and a
    request with `maxContacts` over 500 for each channel (gets 400);
  - `GET /campaigns/:id` returns only the recent recipients by default and the
    full list with `?all=true`;
  - setting and clearing `brevoOutboundSmsListId` through listing-settings,
    including a bad value (gets 400);
  - a non-admin gets 403.

### Phase 2: Outbound SMS end to end
- Backend:
  - `brevoService.syncOutboundSmsContact` (with remove-then-add);
  - `outboundSmsService`;
  - `launchSmsCampaign` plus the route.
- Frontend:
  - `outbound.api.js` / `outbound.service.js`;
  - `OutboundHub` with only the SMS tab turned on;
  - `OutboundPropertyPicker` (with SMS status), `ContactTargeting`,
    `SmsLauncher`, `CampaignProgress`, `useCampaignPolling`;
  - the "Outbound SMS list id" field in `ManageListings.jsx`;
  - the sidebar and `adminPanel.jsx` wiring.
- Check:
  - a property with no outbound list shows "not set up" in the picker and
    can't be launched; the API rejects it with 400 even if called directly;
  - launch without the consent box ticked is refused by both UI and API;
  - a single-contact send to the user's own phone (with permission) shows up on
    that property's Brevo list with the right `OUTBOUND_*` and `SMS_OPT_IN`
    attributes, and the text arrives;
  - sending the same contact again texts them again (remove-then-add works);
  - a small CSV (2–3 rows, all the user's own or test numbers) completes, and
    the campaign doc is correct in Mongo (`sms.listId`, `sms.consentAttested`,
    `maxContacts`);
  - a `maxContacts` over 500 is refused;
  - the progress view polls in the default recent-N mode, and "View all
    recipients" loads the full list;
  - the `smsConflict` path is recorded as failed;
  - a server restart mid-run shows `interrupted`.

### Phase 3: Outbound Email end to end
- Backend:
  - `sendEmailAsync`;
  - `outboundEmailLayout` (no unsubscribe footer);
  - `outboundEmailService` (rendering and variables; no unsubscribe check);
  - `previewEmail`, `sendTestEmail`, `launchEmailCampaign` plus their routes.
- Frontend:
  - `EmailComposer` and `EmailLauncher`;
  - turn on the Email tab.
- Check:
  - preview renders the variables correctly for the picked property, in both
    text and HTML formats;
  - "Send test to me" arrives at the admin's own inbox;
  - a `maxContacts` over 500 is refused;
  - a forced SMTP failure (a bad `EMAIL_PASSWORD` in local env only) shows every
    recipient as `failed` with the reason.

### Phase 4: History and polish
- `CampaignHistory` plus the detail view.
- Channel and property filters.
- Deep links (`?tab=outbound&channel=history`).
- Empty, loading and error states.
- "Not set up for outbound SMS" and "email not configured" states driven by
  the picker data and `/config`.
- Tidy the CSS shared between the SMS and Email launchers.
- Check: history lists the campaigns from Phases 2 and 3, and the detail view
  matches the Mongo documents.

### Phase 5: Future (explicitly not now)
- Rate limiting and throttling (see §10).
- Unsubscribe handling for outbound email: the check and the footer link (see
  §10).
- Saved email templates per property.
- Option B (the Brevo Transactional SMS API), if the automation dependency
  becomes a real pain.
- Folding Calls into this hub (deferred in `outbound.md`).

---

## 10. Future concerns (noted, not designed for now)

- **Unsubscribe handling is deferred (a known gap, accepted on purpose).** The
  user chose to skip it for v1 (§11 #9), against the original recommendation.
  Two pieces are not built:
  1. **Checking the `Unsubscribe` collection before sending.** Someone who
     unsubscribed through the newsletter link will still get outbound email.
  2. **An unsubscribe link in the outbound email footer.** Recipients have no
     one-click way out. This would need `BACKEND_PUBLIC_URL` (or reuse of the
     hardcoded onrender URL) and a footer in `outboundEmailLayout.js`.

  This is a real **compliance** risk (CAN-SPAM expects commercial email to
  offer a working opt-out and to honor it) and a **deliverability** risk (with
  no easy way to opt out, more people hit "report spam", which hurts the
  shared Gmail account that also sends transactional mail). It's acceptable
  only while sends stay small and internal during the dev stage. Build both
  before any real marketing send. The schema already has room for it
  (`counts.skipped`, `recipients[].status: skipped`).
- **SMS opt-out is per list, not global (a known gap, accepted on purpose).**
  Confirmed: a STOP reply in Brevo only applies to the list it was sent from.
  Because lists are per property (§4), someone who replied STOP to property
  A's texts is not suppressed from property B's list and can still be texted
  about B if an admin imports them there. This is a real TCPA compliance risk.
  The user accepted per-list scope for v1, so **no suppression layer of our
  own is being built now**. If it's needed later, the likely shape is a
  global SMS opt-out check before `syncOutboundSmsContact` (the schema's
  `skipped` status already has room for it).
- **Gmail sending limits.** Gmail SMTP allows roughly 500 recipients a day on a
  consumer account and roughly 2,000 on Workspace. Going over can lock the
  account for about 24h. Because the **same account sends password resets,
  registration confirmations and auction emails** (kept as the sender by
  decision, §11 #7), a large outbound send could take all of those down.
  - The shared ceiling of 500 per campaign happens to match the lower Gmail
    figure, but it's per campaign, not per day. One email campaign at the
    ceiling, or two in the same day, can still use up the whole day's quota.
    It's a guard against typos, not protection against this.
  - Before any real bulk send: add per-day caps plus pacing, or move outbound
    email to a separate sender account or provider. If the ceiling is ever
    raised, revisit whether email needs its own lower cap.
- **Brevo SMS throughput and credits.** The automation sends at Brevo's pace and
  uses Brevo SMS credits. A campaign at the 500 ceiling still uses a
  noticeable number of credits. Watch this before real sends.
- **SMS run length.** At about 0.5s per contact (250ms delay plus two Brevo
  calls for remove-then-add), a 500-contact campaign takes around 4–5 minutes
  in the web process. That's fine on a single instance (stale detection keys
  off `updatedAt`, which moves per recipient), but a redeploy mid-run leaves
  it `interrupted` with no resume. Resume or a job queue is future work.
- **Delivery visibility.**
  - SMS: we only know "added to list". Whether the text went out lives in
    Brevo (per property list, which at least makes that easy to find).
  - Email: we know "accepted by Gmail", not delivered, opened or bounced.
    `emailEventModel` only captures **Brevo** webhook events, so Gmail sends
    won't appear there.
- **Multi-instance.** The background runners are fire-and-forget in the web
  process, like calls. That's fine on a single Render instance. With more than
  one instance or long campaigns, move them to a real job queue.

---

## 11. Decisions (all resolved 2026-09-25)

All 14 original open questions are closed. The reasoning lives in the section
referenced in each line.

1. **Layout:** one "Outbound" sidebar entry with SMS / Email / History tabs (§3).
2. **SMS list model:** a **dedicated Brevo list per property**
   (`productModel.brevoOutboundSmsListId`), with no shared fallback. Reversed
   from the original shared-list recommendation (§4). A STOP reply only
   applies to that one list, not across properties; accepted for v1 with no
   extra suppression built (§4, §10).
3. **SMS consent:** a required admin "these contacts have given consent"
   checkbox; only then is `SMS_OPT_IN` set; stored as `sms.consentAttested` (§4).
4. **Re-sends:** remove-then-add on every send, scoped to the targeted
   property's list (§4, §5.2).
5. **Phone-only contacts:** SMS requires both email and a valid US phone; other
   rows are skipped with a reason (§5.1).
6. **`sendEmailAsync`:** yes, added as an additive export; `sendEmail` is
   unchanged (§5.2, §5.3).
7. **Sender identity:** the existing Gmail transactional account,
   `"Vihara" <EMAIL_USERNAME>`, no reply-to; rate-limit risk accepted for now
   (§5.3, §10).
8. **Email body format:** plain text auto-converted to paragraphs by default,
   with a raw-HTML toggle; no rich-text editor (§5.1, §8.1).
9. **Unsubscribe:** **deferred.** No `Unsubscribe` check and no footer link
   in v1. Reversed from the original "yes to both"; tracked as a known gap in
   §10.
10. **Brevo IP allowlist:** already fixed in the Brevo QC work; not a blocker
    (§9 Phase 0).
11. **SMS wording location:** lives in each property's Brevo automation, not
    editable in our UI (§5.5).
12. **Campaign cap:** the **admin sets `maxContacts` per campaign** at launch,
    under **one hard server-side ceiling of 500 for both SMS and email** (not
    split per channel). Over-limit launches are rejected, never truncated
    (§5.1, §7).
13. **Leads visibility:** outbound contacts stay in `outboundCampaign` history
    only, not in LeadsHub (§6).
14. **Test/inactive properties:** the picker shows all properties with inline
    warnings, plus each property's outbound SMS setup status (§8.1).

---

## 2026-09-25: All 14 open questions resolved

The user went through every question in §11 and made a final call on each.
The whole document was updated to match, not just this note. Most decisions
confirmed the original recommendation. Three changed the plan:

- **SMS list model: shared list → dedicated list per property.** Reasons: it
  matches the existing `productModel.brevoListId` per-property precedent, it
  avoids branching logic inside one Brevo automation, it gives per-property
  analytics in Brevo for free, and the extra setup (duplicate an automation,
  a few minutes) is small given how rarely properties launch. What followed:
  - a new `productModel.brevoOutboundSmsListId` field, editable in Manage
    Listings;
  - `resolveOutboundSmsListId` is now the real v1 mechanism, with no fallback;
    unconfigured properties are shown and rejected clearly;
  - the `BREVO_OUTBOUND_SMS_LIST_ID` env var is dropped;
  - Brevo setup is now a per-property step;
  - `sms.listSource` is removed from the schema;
  - `/config` takes `propertyId` for SMS status;
  - the open question of how far a STOP reply reaches was raised (answered in
    the follow-up entry below).
- **Campaign cap: fixed 500 → admin-set `maxContacts` per campaign** under a
  hard server ceiling. Launches over the limit are rejected, never truncated.
  (The ceiling was first written as split per channel; the follow-up entry
  below replaced that with one shared 500.)
- **Unsubscribe: recommended "yes" → deferred.** No `Unsubscribe` check and no
  footer link in v1. `BACKEND_PUBLIC_URL` isn't needed until that's built.
  This is logged in §10 as a compliance and deliverability gap that was
  accepted on purpose.

Also confirmed: consent is required through the attestation checkbox, and
remove-then-add happens on every send, not only if Phase 0 shows it's needed.
The Brevo IP allowlist is already fixed. **v1 adds no new env vars.**

## 2026-09-25 (follow-up): five more answers, three corrections

After reviewing the entry above, the user answered five follow-up questions.
Two confirmed what was already written; three changed it. The whole document
was updated again to match.

- **Campaign cap: one ceiling of 500 for both channels, not split.** The
  split ceiling (a higher one for SMS, 500 for email) was rejected.
  `MAX_CONTACTS_CEILING` is now a single constant, `500`;
  `validateMaxContacts` no longer takes a channel; `/config` returns
  `maxContactsCeiling: 500`. Knock-on numbers were recomputed: a full SMS
  run is about 4–5 minutes, a full campaign document is roughly 100–200KB,
  and a full CSV is roughly 100KB.
- **SMS opt-out (STOP) scope: confirmed per list only, not global.** This is
  now stated as a fact, not a Phase 0 check. Because lists are per property,
  someone who replied STOP for one property can still be texted for another.
  That TCPA risk is **accepted for v1**, and no suppression layer of our own
  is being built (§4, §10).
- **Campaign polling: defaults to recent N, with a full-list option.**
  `GET /campaigns/:id` now returns only the last N recipients by default
  (`?recent=N`, default 50), and the full list only with `?all=true`. Live
  polling uses the default; the progress view's "View all recipients" action
  and the History detail view use `?all=true` (§6, §7, §8.1).

Confirmed with no change: the admin sets `maxContacts` per campaign (required,
empty by default, over-limit launches rejected, not truncated), and each
property's Brevo SMS template has the property name written directly into it.

---

## Fill in what has changed each time we come back to this

Same pattern as `outbound.md` and this repo's `plan.md`: read the sections
above, then add a new dated entry saying what changed. That includes
phases completed and any deviations from this plan.
