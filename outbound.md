# Outbound Infra (Calls, SMS, Email) — Planning & Investigation Log

Scope note: this is CRA (`vihara-new-website`) + backend (`viharabackend`) work,
tracked here so all planning/history for this task lives in one place. Started
on branch `ogdensburg-outbound` in both repos, but **this is explicitly NOT
Ogdensburg-specific** — the goal is a centralized outbound system reusable for
any property going forward. Ogdensburg was just the first real use case that
prompted the task.

Related but separate: the "Brevo Texting QC" investigation (see this repo's
`plan.md` — different doc, different task) covers the existing *inbound/
reactive* SMS-consent flow and a real production incident found there (Brevo
IP-allowlist rejecting Render's outbound IP). That work stays in `plan.md`.
This doc (`outbound.md`) is specifically about building a new, *admin-
triggered* outbound system — separate feature, shares some infrastructure
(Brevo, calling) with the QC work, worth keeping in mind but not the same
task.

---

## 2026-09-25 — Initial research: what already exists

Before building anything, did a full audit of what's currently inbound-only
(reactive to a lead submitting a web form) vs. what's already a real,
admin-triggered outbound capability.

### Outbound calling — already fully built, reusable as-is

Found a complete, working, admin-triggered outbound calling system that
predates this task entirely (not something started on this branch):

- **Frontend**: `src/components/AdminPanel/Calls/CallLauncher.jsx`, embedded
  inside `VoiceAgentDashboard.jsx` (Admin Panel → Voice Agent Dashboard).
  Two modes:
  - **Single call** — admin manually enters a contact's
    name/phone/address/city/state/zip/email, picks a property to pitch, and
    fires one call immediately.
  - **CSV campaign** — admin uploads a CSV (client-side `FileReader`, posted
    as raw text, not multipart), up to `MAX_CONTACTS_PER_CAMPAIGN = 500`
    contacts, picks a property + editable voice prompt, and it sequentially
    dials through the whole list with pacing delays.
- **Backend**: `src/services/calling/vapiCampaignService.js` is the real
  engine — CSV parsing (Papa Parse, header-flexible, accepts both a generic
  lead-list export shape and a PropStream export shape), contact
  normalization, in-memory job tracking, sequential dispatch. Built on
  `vapiService.dispatchCall(phone, contact, {...})` — the same low-level
  primitive the reactive/inbound signup calls use, but this path takes a
  **plain phone string + plain contact object**, not a Mongoose Lead
  document, so it's already fully decoupled from any specific lead source.
- Routes: `POST /api/vapi/call` (single), `POST /api/vapi/launch-campaign`
  (CSV), `GET /api/vapi/campaign/:jobId` (poll status) —
  `vapiController.js` (`startSingleCall`, `launchCampaign`,
  `getCampaignStatus`), `vapiRoutes.js`.
- **Already property-agnostic**: both modes have a property picker (dropdown
  over every `productModel` document via `getAllProductsAdmin`), nothing
  Ogdensburg-specific baked in anywhere.

**Decision: reuse this as-is for outbound calling.** No rework needed
architecturally — it's already the centralized system this task wants.

**Important correction (2026-09-25):** user initially said "I tested the
calling, it also works" — turned out that test was on the **Northern
California landing page's own lead form** (the existing *reactive/inbound*
signup-call flow), **not** the admin CallLauncher / Voice Agent Dashboard
outbound path described above. **The actual outbound admin-triggered
calling flow has NOT been tested yet as of this entry** — real open item,
see Next Steps.

### Outbound SMS — does not exist; decision made to extend the existing Brevo pattern

Current state: `src/services/integrations/brevoService.js` only ever
**upserts a contact into a Brevo list** — it never sends an SMS/email
itself. The actual send is 100% delegated to a Brevo-dashboard-configured
automation attached to that list, triggered by "contact added." Every call
site (`syncPropertyLead`, `syncNorCalLead`, `syncPartnerLead`, etc.) is
invoked only from a public lead-form controller — **no admin controller
calls any Brevo function today.**

Two architectural options were considered:
- **Option A** — reuse the current "upsert to list, let Brevo automation
  handle sending" pattern, just admin-triggered instead of form-triggered
  (add arbitrary contacts to a list via CSV/manual entry, reusing
  `upsertContact`/`buildSmsAttributes`). Faster to build; still depends on a
  correctly-configured Brevo automation to actually send — same
  black-box-dependency class of issue flagged during the Brevo QC work
  (can't confirm from this codebase alone that a text actually went out).
- **Option B** — use Brevo's **Transactional SMS API**
  (`POST /v3/transactionalSMS/sms`) instead, for an immediate, directly
  confirmable send, independent of dashboard automation config.

**Decision (2026-09-25): Option A.** Keep using the existing upsert-to-list
pattern, just build an admin-triggered path onto it. User's call — noted
here so the reasoning trail exists if this needs revisiting (e.g. if the
Brevo-automation-dependency problem becomes a real pain point later, Option
B is the documented alternative).

**Open design question for centralizing across "any property":** today the
target Brevo list is chosen per-funnel via hardcoded env vars
(`BREVO_PROPERTY_LIST_ID`, `BREVO_PARTNER_LIST_ID`, `BREVO_NORCAL_LIST_ID`),
with a per-property override (`productModel.brevoListId`, settable in Admin
Panel → Manage Listings). For a centralized outbound-SMS admin feature
covering any property: does every property need its own dedicated Brevo
list + automation, or is there one shared "outbound SMS" list/automation
all admin-triggered contacts go into regardless of property? Not yet
decided — needs answering before building the admin UI's list-targeting
logic.

### Outbound email — sending primitive already exists; only the admin feature layer is missing

`src/utils/sendEmail.js` — `sendEmail(to, name, subject, html, attachments)`
— is a real, generic, production-proven transactional sender (arbitrary
`to`, already used for registration confirmations, password resets, etc.,
with real provider credentials already configured). **Decision (2026-09-25):
keep using this existing utility — do NOT route outbound email through
Brevo.** (Brevo-for-email was considered and explicitly declined by the
user, to keep this simpler/consistent with what's already proven in
production.)

What's missing is purely the feature layer: no admin UI, no bulk/CSV
contact targeting, no template/compose UI, no admin-facing trigger
endpoint. All net-new, same shape of gap as SMS.

### Explicitly NOT outbound (checked and ruled out as false leads)

- Socket.IO "broadcast" hits — live-auction bidding UI updates, unrelated.
- Admin panel "bulk" hits — bulk-*creating* property listings
  (`/api/v1/product/bulk`), unrelated to contacts/outreach.
- `LeadCallingControl.jsx` — only a per-lead pause/resume toggle for the
  existing automatic daily retry sweep. Not a manual trigger, not
  multi-select, no SMS/email action.
- `callDispatchQueue.js` — purpose-built for the reactive signup/daily-sweep
  system (two priority lanes tied to registration semantics); NOT used by
  `vapiCampaignService.js`, which does its own simple delay-based pacing.
  Not directly reusable without generalizing, and not needed since the
  campaign service already has its own working pacing.
- `registrationCallService.js` / `leadCallService.js` — tightly coupled to
  the lead-registration shape; not the path outbound campaigns use (they use
  `vapiCampaignService.js` instead, which is already the right abstraction).

---

## 2026-09-25 — UI/scope decision: new standalone feature, calling left untouched

Proposed reusing the existing `CallLauncher.jsx` inside a new unified
"Outbound" admin section (one sidebar item, tabs for Calls/SMS/Email,
shared contact-targeting component). **User corrected this:**

- **Do not change anything about the existing calling agent.** Leave
  `CallLauncher.jsx`, `VoiceAgentDashboard.jsx`, `vapiCampaignService.js`,
  and everything else in the current calling path completely untouched —
  no refactor, no embedding into a new shared component, nothing.
- **This is a new, separate feature**, scoped to **SMS and Email only** for
  now. Calls stay exactly where/how they are today, on their own, outside
  this build.
- **Full centralization (potentially folding Calls into this new system
  too, possibly deprecating/removing the standalone CallLauncher) is a
  decision deferred to later** — explicitly not part of this task right
  now. Revisit once SMS + Email are built and working.
- **Both SMS and Email will have a property picker**, same as Calls does
  today — confirmed, not just for Calls.
- **Rate limits (email sending, and anything similar for SMS) are not a
  concern right now** — still in development stage. Revisit before any
  real/production bulk send, but don't design around it yet.

**Net effect on the plan:** build a new admin section for outbound SMS +
Email (tabs, or however it ends up structured — layout still open), each
with its own property picker + contact targeting + channel-specific
compose + launch, independent of the existing calling code. The
"shared contact-targeting component" idea still stands *between SMS and
Email* (no reason to duplicate CSV-import logic between those two), just
not extended to Calls for now.

---

## Next Steps (open items, update as they close)

1. **Decide the property→Brevo-list model for outbound SMS** (dedicated list
   per property vs. one shared outbound list) before building the admin
   contact-targeting UI. SMS will have its own property picker regardless
   (confirmed 2026-09-25) — this decision affects what picking a property
   actually *does* (switches target list, vs. just tags/labels the send).
2. **Design + build the outbound SMS admin feature** (Option A): property
   picker + CSV/manual contact entry → upsert into the decided Brevo
   list(s) → `SMS_OPT_IN`/`SMS_OPT_IN_AT` set appropriately → relies on
   Brevo automation to actually send (documented dependency, accepted).
   Brand-new UI, does not touch or reuse the existing calling code.
3. **Design + build the outbound email admin feature**: property picker +
   contact targeting (CSV/manual — reuse the same targeting component SMS
   uses, not the calling one) + a compose/template UI + a trigger endpoint
   wrapping the existing `sendEmail()` utility, looping over contacts. No
   rate-limit handling needed yet (dev stage) — revisit before any real
   bulk send.
4. **Layout still open**: could be one "Outbound" section with SMS/Email
   tabs, or two separate admin sections — not decided yet, revisit once
   both are scoped in more detail. Either way, Calls/`CallLauncher.jsx`
   stays completely separate and untouched.
5. **Deferred, not now**: whether to eventually fold Calls into this same
   unified system too (and possibly retire the standalone CallLauncher) —
   explicitly a later decision, not part of this build.

## Fill in what has changed each time we come back to this

Same pattern as this repo's `plan.md`: read the sections above, then append
a new dated entry below this line with what changed since.
