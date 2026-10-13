# Meta Ads Loop

Implements "Vihara Meta Ads Loop — Spec" (Oct 13, 2026). Zernio brings the numbers in, Claude suggests and builds creatives, the team approves in Slack, and Zernio publishes. Every creative carries an LT-ID end to end.

It runs inside this backend on Render. The spec's VM, Docker and SQLite are replaced by MongoDB collections, and its R2/S3 storage by Cloudinary.

## The loop

| Step | Where | Code |
|---|---|---|
| 1 Pull numbers (06:00 IST) | Zernio → `adResults` by LT-ID, plus the lead join | `services/adsLoop/dailyPull.js`, `leadJoin.js` |
| 2 Score + suggest (Mon 09:00 IST) | #ads-weekly | `weeklyAnalysis.js` |
| 3 Team says go | "Go" button, or type `go` in the proposal thread | `proposalService.js` |
| 4 Build creative | Claude plan → HTML/CSS → PNG → copy policy check + vision critic → one auto revision | `creativePipeline.js`, `creativeAi.js`, `creativeRender.js` |
| 5 Creative review (gate 1) | #creative-review thread; replies = next version | `creativeReview.js` |
| 6 Launch approval (gate 2) | #ads-weekly launch proposal → created PAUSED → "Activate" | `proposalService.js` |
| 7 Publish | Zernio: organic post, or ad PAUSED then active | `organicPublisher.js`, `proposalService.js` |
| 8 Measure | Daily results + qualified leads per LT-ID | `dailyPull.js` |

Learning store: design rules (`designRules`, exported at `GET /api/v1/ads-loop/design-rules.md`) and the example library (`creativeExamples`). Both are read by steps 2 and 4.

## Spec tables → MongoDB collections

| Spec | Collection / model |
|---|---|
| `creatives` | `adCreatives` (`model/adsLoop/adCreativeModel.js`) |
| `results` | `adResults` (unique `ltId + date + channel`, keeps `raw`) |
| `proposals` | `adProposals` |
| `change_log` | `adChangeLogs` (every Zernio write, including failed ones) |
| `processed_message_ids` | `processedSlackMessages` |
| (state) | `adsLoopStates`: kill switch, LT counter, last handled ts, heartbeat |
| `design-rules.md` | `designRules` |
| `library/` | `creativeExamples` |

## Guardrails (in code: `services/adsLoop/guardrails.js`)

- Every write goes through `executeWrite`: approver allow-list, kill switch, claims the triggering Slack action once, then logs to the change log.
- Budget changes: at most ±20%, at most once every 3 days per ad set. No budget edits while the ad set is in the learning phase.
- Daily ceiling ($50) and monthly ceiling ($1,000) on loop ads, checked at launch, activation and budget change.
- Every campaign is created with `specialAdCategories: ["HOUSING"]`. Age, gender and ZIP targeting are refused, and cities need a radius of 15 miles or more.
- Copy policy: Fair Housing words, guaranteed returns, percentages, and any dollar amount not taken from the property.
- New ads: the campaign and ad set are created on, and the ad itself PAUSED. "Activate" turns it on.

## Setup

1. **Zernio.** Put the API key in `ZERNIO_API_KEY`. Open `GET /api/v1/ads-loop/zernio/accounts` (admin login) to find the account ids, then fill `ZERNIO_ADS_ACCOUNT_ID`, `ZERNIO_AD_ACCOUNT_ID` (act_…), `ZERNIO_FACEBOOK_ACCOUNT_ID` and `ZERNIO_INSTAGRAM_ACCOUNT_ID`.
2. **Slack app.** At api.slack.com/apps, choose Create New App → From a manifest and paste `src/config/adsLoop/slackAppManifest.json`, (it already points at https://api.vihara.ai). Install it to the workspace. Copy the Bot User OAuth Token into `SLACK_BOT_TOKEN` and the Signing Secret into `SLACK_SIGNING_SECRET`.
3. **Channels.** Create #creative-review and #ads-weekly, then `/invite @Ads Loop` in both. Put their channel ids (Channel details → bottom) in `SLACK_CREATIVE_REVIEW_CHANNEL_ID` and `SLACK_ADS_WEEKLY_CHANNEL_ID`.
4. **Approvers.** Put the Slack member ids (Profile → ⋯ → Copy member ID) in `SLACK_APPROVER_IDS`, comma-separated. While it is empty, nothing can be approved.
5. Set `ADS_LOOP_ENABLED=true` and deploy. Run `/adsloop status` in Slack to check the settings.
6. Optional: point an uptime monitor at `GET /api/v1/ads-loop/health`. It returns 503 when the heartbeat is older than 26 hours.

## Using it

- `/adsloop build <property-slug>` builds a creative now. It appears in #creative-review.
- In the review thread, reply with changes to get v2, v3 and so on. Approve with **Approve + post organically** or **Approve (ads only)**. To reject, reply with the reason first, then press **Reject**.
- After approval, Claude proposes design rules in the thread. React ✅ to accept one.
- After approval, a launch proposal appears in #ads-weekly: **Go** creates the ad PAUSED, then **Activate** turns it on.
- `/adsloop stop` is the kill switch (anyone can use it). `/adsloop resume` turns writes back on (approvers only).
- Ads made by hand in Ads Manager are included if they are named `LT-0000 | property-slug | layout`. Ads without an LT-ID are listed as "unmatched" each morning.
- To add an outside ad you admire to the library: `POST /api/v1/ads-loop/library/reference { imageUrl, why, attributes }`.

The fixed attribute tags are in `src/config/adsLoop/attributeTags.js`. A person adds new values there; Claude can't invent them.
