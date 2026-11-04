# Daily website report to Slack: checklist

Task from the senior (Oct 2026): a daily website analytics report with key metrics (which pages, engagement), pushed to Slack. Numbers come from Google Analytics 4. Later the user asked for the same style as the Meta Ads daily report, including an "Actions today" section.

How to read this file: `[x]` is done, `[ ]` is not done. A step is only ticked when it is actually done. Last updated 17 Oct 2026.

Report: branch `ga-daily-report`, pull request #20 merged on 16 Oct. The env vars are set on Render and it is redeployed. The first real 4:00 PM IST post is expected on 17 Oct.

Repair agent work (second task, 17 Oct): branch `ga-repair-agent`, created from `main` at c4a0b33. Three commits, pushed 19 Oct 2026. PR #23 merged on 19 Oct 2026 (merge commit 0558287) and deployed on Render at about 8:23 PM IST. Boot log shows `[gaReport]` scheduled 4 PM and `[repair]` scheduled 08:30 IST, no errors. Env vars checked on Render (names only), nothing new needed. First real runs: 8:30 AM IST repair checks on 20 Oct, then the 4 PM report with the new problem extractor. See "Analytics agent (repair agent)" below. This file is untracked and stays out of commits.

## How it works

- Every day at 4:00 PM IST the job pulls yesterday's numbers (India time, the property's time zone), builds the Slack message, and posts it.
- Code computes every number. Claude (`claude-sonnet-5-5`) writes the analysis at the top: headline, Winners, Problems, Not enough data, Actions today.
- A figure checker compares every number in Claude's text with the data. A draft with an unknown number gets one retry, then the job posts the numbers without the text.
- If the summary fails, the numbers still post. If the whole report fails, "Website report failed: ..." goes to the channel.
- The job skips quietly when `SLACK_GA_REPORT_WEBHOOK_URL` is unset.
- Actions never mention ad spend, bids or budgets, because GA4 has no spend. For campaign advice the text says to check Ads Manager.

## Sign-in (OAuth, because service account keys are blocked)

- The org policy `iam.managed.disableServiceAccountKeyCreation` blocks service account keys in the vihara.ai organization (ID 548301129814). The senior does not know who the Workspace admin is, so the policy could not be changed.
- Workaround in use: OAuth login as info@vihara.ai, which owns GA4, GTM and Ads. Project `orbital-ethos-511805-c2` (made under info@), consent screen Internal, Desktop client, scope `analytics.readonly`.
- The refresh token came from `node src/scripts/gaOAuthLogin.js` (one time). The Google library turns it into short-lived access tokens by itself.
- The report runs as info@vihara.ai. It stops working if app access is revoked, the account is suspended or loses GA4 access, an admin changes policy, the token is unused for about 6 months, or too many tokens are issued (about 100 per account per client). I have not verified how long the token lasts for Internal apps.
- A service account key still works in the code if one is ever allowed. Credential order: OAuth, then `GA_SERVICE_ACCOUNT_JSON`, then the library default.
- The old project `vihara-analytics-reporting` and its service account `ga4-report-reader` are not used.

## IDs and names

| What | Value |
|---|---|
| GA4 property | 549331956 (account "Vihara AI" 404161454), time zone India |
| Report sign-in | info@vihara.ai (OAuth) |
| Slack test channel | Google-Analytics-Report (private, only Adarsh) |
| Slack app | separate app for the report, with an incoming webhook |
| Pull request | #20 on Asadrana123/viharabackend |

## What is done

- [x] Researched options and chose the Data API with a backend cron job
- [x] Code on the branch: `gaInsightsService.js`, `gaReportFormatter.js`, `gaSummaryService.js`, `gaReportJob.js`, `runGaReport.js` (dry run), `gaOAuthLogin.js`, job registered in `src/index.js`
- [x] OAuth sign-in set up and working with real GA4 data
- [x] Numbers for 15 Oct checked against the GA4 screens in Chrome: visitors 194, sessions 228 (GA4 later moved it to 226), page views 304, engagement 41.2%, time per visitor, channels, top pages, 4 events
- [x] Fixes: unregistered-dimension error (gRPC code 3), tracking check only flags events averaging 5 or more a day, empty landing page shows "(not set)"
- [x] Meta-style analysis: campaigns (yesterday and last 7 days, with sign-ups), Actions today, figure checker
- [x] Setup gaps (missing breakdowns) are kept out of Problems and Actions
- [x] GA4 custom dimensions created on 16 Oct: `form_location` and `page_type` (both Event scope)
- [x] Slack channel, app and webhook made. Webhook saved in the local `.env` only.
- [x] One real test post to the private channel on 16 Oct (report for 15 Oct). Looked good.
- [x] Merged `origin/main` into the branch (conflicts in `package.json`, `package-lock.json`, `src/index.js`, kept both sides)
- [x] Pushed the branch and opened PR #20, merged on 16 Oct
- [x] Set on Render by the user (secrets added in the dashboard): `GA_PROPERTY_ID`, `GA_OAUTH_CLIENT_ID`, `GA_OAUTH_CLIENT_SECRET`, `GA_OAUTH_REFRESH_TOKEN`, `SLACK_GA_REPORT_WEBHOOK_URL` (the test channel's URL). Redeployed.

## Analytics agent (repair agent)

The senior wants an analytics agent that reports, suggests improvements, waits for human approval, then fixes, like the Meta Ads agent. Decision: no separate agent. GA feeds the existing repair agent (one fix engine, one approval flow, one queue). Branch `ga-repair-agent`.

- [x] Step 1, commit 9167b16: read-only `ga_report` tool for the repair agent. `fetchGaBreakdown` in `gaInsightsService.js` (day, channel, source, campaign, page, landing_page, event, and the two custom dimension splits), `src/services/repair/gaTool.js` (max 31 days, no future dates), tool added to `repairAgent.js`.
- [x] Step 2, commit 169fa3d: daily GA check `src/services/repair/gaChecks.js`, registered in `checks.js`, model kind `ga_issue`. Runs in the 8:30 AM IST repair run and in `/adsloop repair`. Incidents (key, rule):
  - `ga:no_sessions`: no sessions on the last complete day
  - `ga:event_missing:<name>`: tracked event at 0 on both of the last two days, averaging 5 or more a day before
  - `ga:dimension:<name>`: `form_location` (5 events minimum) or `page_type` (20) has only "(not set)". Not judged before 19 Oct 2026.
  - `ga:campaign_ids`: 20 or more sessions in 7 days under "Campaign ID <n>". The fix is in the ad URL parameters, outside the code.
  - Does nothing when GA4 is not configured. An unregistered custom dimension is a setup gap, never an incident. Incidents resolve when the check stops finding the problem.
- [x] Tests: 20 made-up cases pass (scratchpad, not in the repo). Live read-only run found `ga:campaign_ids`.
- [x] Full loop test on 17 Oct (local database, real Slack channel, real Claude): incident `R-20261017-91` for `ga:campaign_ids`, 347 sessions. Claude used `ga_report` and `ad_stats`, ended as `needs_manual` with a cause and 6 Ads Manager steps. Cost $0.07. The first attempt stopped at the agent's settings pre-check, because the local `.env` lacked `META_ADS_ACCESS_TOKEN` and `META_AD_ACCOUNT_ID`.
- [x] Code-fix path test on 17 Oct (local DB, real Slack, real Claude and GitHub): made-up incident `ga:dimension:page_type` (94 of 158 property_view events "(not set)"), numbered R-20261017-111. The agent checked day by day with `ga_report` and read the site code, then ended `needs_manual`, no edit, no branch: the site sends page_type everywhere, and GA4 never fills a custom dimension for days before it was created (all 895 "(not set)" events were on 16 Oct or earlier, 17 Oct is fully filled). Cost $0.15. The edit, branch, preview, Go, merge and deploy-watch steps were NOT exercised; they are the shared engine that already runs for Meta in production.
- [ ] Not tested: Slack Go / Change / Reject on a GA incident (button clicks go to production, which does not know a local incident).
- [x] Step 3, commit d363eff: `src/services/repair/gaReportIssues.js`. After the 4 PM report posts, and only when the repair agent is enabled, Claude (medium effort) reads the report text and lists its technical problems. They become `ga_issue` incidents with the key `ga_report:<topic>`, so the Meta report (`report:`) and the rule checks (`ga:`) never resolve them. Wired in `gaReportJob.js` through `runGaReportIssues` in `incidentService.js`. Open incidents are passed in so a duplicate is skipped. At most 3 new incidents per report. A problem the next report no longer mentions is resolved.
  - Prompt thresholds (tightened after the first trial): at least 20 sessions for a page or channel, an event only if its 7-day average was 5 or more a day and it dropped, and the partly "(not set)" custom breakdowns are never listed. First prompt opened 3 false incidents on the real 16 Oct report (email_agent 0, page_type partly not set, 12 sessions with no landing page). After the change: 0 on the real report, 0 on a copy with its technical lines removed, and the 2 right ones on a fake broken report (sign_up 0, a dead auction page), two runs each.
  - Tests: 11 made-up cases (scratchpad), plus the 20 earlier ones.
  - Not tested: the saving of `ga_report:` incidents to the database and Slack (same code as the Meta report), and long-run behavior on real days. Watch the first few real reports.
- [ ] Review the Claude-identified campaign matches in Ads Manager before editing links: 52645356390924 to the Fay Big Bear campaign, 52660542623524 to Baltimore / Fairmount Hts Video, 52662640126724 to Toorak 14 Oct. They are inferred from ad stats.
- [x] Pushed `ga-repair-agent` and opened PR #23 on 19 Oct (user's go-ahead). Not merged. Merging and deploying still need a fresh go-ahead.
- [x] Final chain test on 19 Oct (local DB, real Claude): the real 18 Oct report opened 3 incidents ($1.46 total): `/new-deals` has had no sign-up form since 7 Oct while the VIH-EA-NEW DEALS campaign sends traffic there (useful, not yet verified), a borderline Baltimore page low-engagement incident (noise on about 17 visitors a day), and a duplicate of `ga:campaign_ids` (only because the local DB had no rule incident open). Fake broken report: 2 incidents saved, agent refused to run with no Slack/GitHub as intended. Healthy report closed them. These 3 incidents were posted to #ads-weekly as R-20261019-131 to -133 from the local DB: do not press their buttons, delete them.
- [ ] Watch whether the 20-session bar lets in too much noise (the Baltimore page case). If so, raise the bar for low-engagement pages.
- [x] PR #23 merged and deployed 19 Oct.
- [ ] Watch the first 8:30 AM IST run on 20 Oct (expect a `ga:campaign_ids` incident in #ads-weekly) and the first 4 PM report on 20 Oct (extractor, max 3 new incidents).
- [ ] (old line) Push, PR and merge for `ga-repair-agent` Production already has `REPAIR_AGENT_ENABLED` and `REPAIR_GITHUB_TOKEN`, so the first 8:30 AM IST run after deploy opens the `ga:campaign_ids` incident, posts it in #ads-weekly and starts an investigation (about $0.07 in the test, capped at $5).
- Incident posts go to `SLACK_REPAIR_CHANNEL_ID`, or `SLACK_ADS_WEEKLY_CHANNEL_ID` when it is unset (production uses the second).
- Known gaps: the GA report posts through a webhook, so it has no buttons. `/adsloop stop` does not stop the repair agent's Go (existing gap). Test incidents made locally need an ID above production's, so use a high number.
- Cost: repair agent runs Claude Opus 5.5 at high effort, cap `REPAIR_AGENT_MAX_COST_USD` (default 5), 80 steps. The GA report summary uses Sonnet 5.5 and stays on it. The GA check itself costs nothing.

## What is left

### Release (each step needs a fresh go-ahead)

- [x] Review and merge PR #20
- [ ] Watch the first real 4:00 PM IST post in the test channel and compare it with GA4
- [ ] Create the real channel (name to decide, for example `#website-daily-report`), add a second webhook in the same Slack app, swap the URL on Render
- [ ] Delete the test messages in the test channel

### After 24 to 48 hours of data

- [ ] Re-run `node src/scripts/runGaReport.js` and confirm Sign-ups by form and Property views by page type show real values. On 16 Oct the API already accepted both dimensions but returned "(not set)".

### Still open

- [ ] Run time: 4:00 PM IST or later. GA4 numbers for a day keep moving a little for hours (15 Oct went 228 to 226 sessions, 41.2% to 42.9% engagement). Compare the first few posts with GA4 before trusting the time.
- [ ] Some Meta ads send a campaign ID instead of a name. The report labels them "Campaign ID <n>" and flags them. Fix is in the ad links (Meta side), for the senior or info@.
- [ ] Not checked against the GA4 screens yet: the week-ago and average columns, email_agent, bid_registration_submit, sources, landing pages
- [ ] `/new-deals` can show as a problem with no comparison. Left as is by choice.
- [ ] Two-step verification on adarsh@vihara.ai before 30 Oct 2026, or Google Cloud access may stop. Not touched by me.
- [ ] Long-term: if the OAuth token is a worry, ask the Workspace admin (once found) to allow a service account key for one project, then switch to `GA_SERVICE_ACCOUNT_JSON`.

## Things to know

- The new events (`sign_up`, `property_view`, `renovation_open`, `renovation_generate`, `email_agent`, `bid_registration_submit`) exist from 7 Oct 2026. Comparisons for them were thin until about 14 Oct.
- Volumes are small. Counts under about 20 are called too small to read, and percent changes show only when both sides are 20 or more.
- Some data can arrive up to 7 days late, so recent days can change.
- GA4 API limits for a standard property: 200,000 core tokens a day and 40,000 an hour. The report runs about 12 queries a day.
- Rollback: unset `SLACK_GA_REPORT_WEBHOOK_URL` (the job logs and skips), or revert the PR.
- Custom dimension names and event parameters cannot be edited after saving. A standard property allows 50.
- Dry run (prints, never posts): `node src/scripts/runGaReport.js [YYYY-MM-DD] [--no-summary] [--json]`
