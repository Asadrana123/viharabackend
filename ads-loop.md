# Meta Ads Loop

Implements "Vihara Meta Ads Loop — Spec" (Oct 13, 2026). Zernio brings the numbers in, Claude suggests and builds creatives, the team approves in Slack, and Zernio publishes. Every creative carries a fixed core id end to end (see Naming).

It runs inside this backend on Render. The spec's VM, Docker and SQLite are replaced by MongoDB collections, and its R2/S3 storage by Cloudinary.

## The loop

| Step | Where | Code |
|---|---|---|
| 1 Pull numbers (06:00 IST) | Zernio → `adResults` by core id, plus the lead join | `services/adsLoop/dailyPull.js`, `leadJoin.js` |
| 2 Score + suggest (Mon 09:00 IST) | #ads-weekly | `weeklyAnalysis.js` |
| 3 Team says go | "Go" button, or type `go` in the proposal thread | `proposalService.js` |
| 4 Build creative | Claude plan → HTML/CSS → PNG → copy policy check + vision critic → one auto revision | `creativePipeline.js`, `creativeAi.js`, `creativeRender.js` |
| 5 Creative review (gate 1) | #creative-review thread; replies = next version | `creativeReview.js` |
| 6 Launch approval (gate 2) | #ads-weekly launch proposal → created PAUSED → "Activate" | `proposalService.js` |
| 7 Publish | Zernio: organic post, or ad PAUSED then active | `organicPublisher.js`, `proposalService.js` |
| 8 Measure | Daily results + qualified leads per core id | `dailyPull.js` |

Learning store: the example library (`creativeExamples`), read by steps 2 and 4. Design rules live in the Creative OS repo (`rules/`, `learning/`): a ✅ in Slack only queues a suggestion (`GET /api/v1/ads-loop/design-rules/queue.md`); once a person records it in the repo, mark it with `POST /api/v1/ads-loop/design-rules/<id>/recorded { recordedAs }`. Only recorded rules reach the interim Claude builder.

## Spec tables → MongoDB collections

| Spec | Collection / model |
|---|---|
| `creatives` | `adCreatives` (`model/adsLoop/adCreativeModel.js`) |
| `results` | `adResults` (unique `coreId + date + channel`, keeps `raw`) |
| `proposals` | `adProposals` |
| `change_log` | `adChangeLogs` (every Zernio write, including failed ones) |
| `processed_message_ids` | `processedSlackMessages` |
| (state) | `adsLoopStates`: kill switch, last handled ts, heartbeat |
| `design-rules.md` | `designRules` (suggestion queue; the repo is the source of truth) |
| `library/` | `creativeExamples` |

## Guardrails (in code: `services/adsLoop/guardrails.js`)

- Every write goes through `executeWrite`: approver allow-list, kill switch, claims the triggering Slack action once, then logs to the change log.
- Budget changes: at most ±20%, at most once every 3 days per ad set. No budget edits while the ad set is in the learning phase.
- Daily ceiling ($50) and monthly ceiling ($1,000) on loop ads, checked at launch, activation and budget change.
- Every campaign is created with `specialAdCategories: ["HOUSING"]`. Age, gender and ZIP targeting are refused, and cities need a radius of 15 miles or more.
- Copy policy: Fair Housing words and guaranteed returns are always refused. Percentages and dollar figures are refused unless they are the property's own numbers or a supported figure in the creative's Creative OS record (`sourceRecord.figures`).
- AI label: when the Creative OS record says a generated image was used, ads are created with `aiDisclosure: OPT_IN` and Instagram posts with `isAiGenerated`. Zernio has no label for Facebook Page posts, so such creatives are not posted there.
- New ads: the campaign and ad set are created on, and the ad itself PAUSED. "Activate" turns it on.

## Naming

Every creative has a **core id** that never changes and a **stage prefix** that changes with review (Prajwal's notes, 14 Oct 2026). Code: `services/adsLoop/creativeId.js`.

| Name | When |
|---|---|
| `CR-BB449-S01` | first version posted to #creative-review |
| `R1-BB449-S01`, `R2-…` | each version built from thread feedback |
| `AP-BB449-S01` | an approver pressed Approve; the only name used in ads |

- Core id: `<property code>-<S|C><nn>`. The property code is the city initials plus the street number (449 Georgia St, Big Bear Lake → `BB449`; a one-word city uses two letters, Kingwood → `KI1703`). If another property already has that code, a letter is added (`BB449B`). Numbers are never reused.
- Slack review post: the current name only. Ad name: `AP-BB449-S01_<hook>_<icp>_<direction>_static-4x5`. `utm_content`, Cloudinary folders and DB keys: the core id.
- Ad names are matched with `/(?<![A-Za-z0-9])(CR|R[1-9]d?|AP)-([A-Z0-9]{2,16}-[SC]d{2})(?!d)/`. A running ad named `CR-` or `R<n>-` is flagged each morning as launched without approval.
- A rejected creative keeps its last name; its record shows it as retired.

## Setup

1. **Zernio.** Put the API key in `ZERNIO_API_KEY`. Open `GET /api/v1/ads-loop/zernio/accounts` (admin login) to find the account ids, then fill `ZERNIO_ADS_ACCOUNT_ID`, `ZERNIO_AD_ACCOUNT_ID` (act_…), `ZERNIO_FACEBOOK_ACCOUNT_ID` and `ZERNIO_INSTAGRAM_ACCOUNT_ID`.
2. **Slack app.** At api.slack.com/apps, choose Create New App → From a manifest and paste `src/config/adsLoop/slackAppManifest.json`, (it already points at https://api.vihara.ai). Install it to the workspace. Copy the Bot User OAuth Token into `SLACK_BOT_TOKEN` and the Signing Secret into `SLACK_SIGNING_SECRET`.
3. **Channels.** Create #creative-review and #ads-weekly, then `/invite @Ads Loop` in both. Put their channel ids (Channel details → bottom) in `SLACK_CREATIVE_REVIEW_CHANNEL_ID` and `SLACK_ADS_WEEKLY_CHANNEL_ID`.
4. **Approvers.** Put the Slack member ids (Profile → ⋯ → Copy member ID) in `SLACK_APPROVER_IDS`, comma-separated. While it is empty, nothing can be approved.
5. Set `ADS_LOOP_ENABLED=true` and deploy. Run `/adsloop status` in Slack to check the settings.
6. Optional: point an uptime monitor at `GET /api/v1/ads-loop/health`. It returns 503 when the heartbeat is older than 26 hours.

## Using it

- `/adsloop build <property-slug> [static|carousel]` builds a creative now (default static). It appears in #creative-review as `CR-<core id>`.
- In the review thread, reply with changes to get v2, v3 and so on. Approve with **Approve + post organically** or **Approve (ads only)**. To reject, reply with the reason first, then press **Reject**.
- After approval, Claude suggests design rules in the thread. React ✅ to send one to the Creative OS queue.
- After approval, a launch proposal appears in #ads-weekly: **Go** creates the ad PAUSED, then **Activate** turns it on.
- `/adsloop stop` is the kill switch (anyone can use it). `/adsloop resume` turns writes back on (approvers only).
- Ads made by hand in Ads Manager are included if they are named `AP-<core id>_...`. Running ads without such a name are listed as "unmatched" each morning.
- To add an outside ad you admire to the library: `POST /api/v1/ads-loop/library/reference { imageUrl, why, attributes }`.

The fixed attribute tags are in `src/config/adsLoop/attributeTags.js`. A person adds new values there; Claude can't invent them.
