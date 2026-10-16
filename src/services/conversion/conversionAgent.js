// services/conversion/conversionAgent.js
//
// The sign-up doctor's AI: for one landing page that gets visitors from Meta
// ads but few sign-ups, Claude investigates why, with read-only tools:
//
//   Meta      each ad's funnel, what the ad says and who sees it, breakdowns by
//             device / placement / age, the pixel's own counts (browser vs CAPI)
//   Clarity   scroll depth, engagement, dead / rage / error clicks, quick backs
//   database  the sign-ups this page saved (no personal details), the property
//   browser   the live page on a phone or desktop, slow network, filling and
//             submitting the form (writes and tracking are blocked)
//   code      the website and backend code and their recent commits
//   history   what earlier diagnoses of this page found
//
// It finishes with ranked likely reasons, each with evidence, confidence and a
// suggested fix. It changes nothing.

const path = require("path").posix;
const Anthropic = require("@anthropic-ai/sdk");
const { getConversionConfig } = require("../../config/conversion/conversionConfig");
const { getRepairConfig } = require("../../config/repair/repairConfig");
const meta = require("../repair/metaGraph");
const { adFunnel, adDetails, pixelStats } = require("./metaFunnel");
const { clarityForPage, clarityStatus } = require("./clarity");
const { signupsForPage, propertyForPage } = require("./pageSignups");
const { createVisitor } = require("./visitorBrowser");
const ConversionDiagnosis = require("../../model/conversion/conversionDiagnosisModel");

const MAX_STEPS = 60;
const MAX_READ_CHARS = 60000;
const MAX_DIFF_CHARS = 30000;
// Screenshots kept in the conversation; older ones are dropped to save cost.
const KEEP_IMAGES = 3;
const PRUNE_AT_IMAGES = 7;
// Opus 5.5 rates, $ per million tokens (cache writes are 1.25× input).
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };
const TEXT_FILE = /\.(jsx?|tsx?|mjs|cjs|css|scss|html|json)$/;
const REPOS = {
    website: { about: "React website on Vercel. Landing pages: src/components/Landing/ (PropertyAuctionPage.jsx, landing.helpers.js, landing.config.js); pixel/GTM/Clarity in public/index.html; conversions in src/services/capi.service.js.", readable: /^(src\/|public\/|package\.json$)/ },
    backend: { about: "Node/Express backend on Render. Sign-up endpoints: src/controller/leads/; server-side Meta CAPI: src/services/integrations/metaCapiService.js.", readable: /^(src\/|package\.json$)/ },
};
const CATEGORIES = ["tracking", "traffic_quality", "message_match", "offer", "speed", "form", "ux", "trust", "technical", "other"];

let client = null;
function getClient() {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
    if (!client) {
        const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
        client = new Anthropic({ timeout: 10 * 60 * 1000, maxRetries: 2, ...(workspaceId && { defaultHeaders: { "anthropic-workspace-id": workspaceId } }) });
    }
    return client;
}

const str = (description) => ({ type: "string", description });
const obj = (properties, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
const repoProp = { type: "string", enum: Object.keys(REPOS) };
const dates = { since: str("YYYY-MM-DD"), until: str("YYYY-MM-DD") };
const target = {
    type: "object",
    description: "The element, by ONE of: text (visible text), label (accessible name, e.g. a field's label), placeholder, css.",
    properties: { text: { type: "string" }, label: { type: "string" }, placeholder: { type: "string" }, css: { type: "string" } },
    additionalProperties: false,
};

const TOOLS = [
    { name: "all_pages", description: "The funnel of every landing page ads sent people to in the window, so you can compare this page with ones that convert well.", input_schema: obj({}) },
    { name: "ad_funnel", description: "Per ad over a date range: spend, impressions, frequency, CTR, link clicks, landing page views, registrations, Leads. Optional breakdown: device_platform, publisher_platform, platform_position, age, gender, region, or hourly_stats_aggregated_by_advertiser_time_zone. Optional ad_id for one ad.", input_schema: obj({ ...dates, breakdown: str("optional"), ad_id: str("optional") }, ["since", "until"]) },
    { name: "ad_details", description: "What one ad says (headline, text, call to action, image) and who it is shown to (ages, places, interests, placements, what it optimizes for).", input_schema: obj({ ad_id: str("Meta ad id") }) },
    { name: "meta_daily_conversions", description: "Registrations and Leads Meta received per day for the whole ad account (at most 30 days).", input_schema: obj(dates) },
    { name: "pixel_stats", description: "Counts from the pixel itself in Events Manager. aggregation: event (per event name), event_source (browser vs server/CAPI), url (per page), device_type, browser_type, event_processing_results, match_keys, had_pii. Optional event, e.g. CompleteRegistration or PageView.", input_schema: obj({ aggregation: str("see description"), event: str("optional"), ...dates }, ["aggregation", "since", "until"]) },
    { name: "clarity", description: "Microsoft Clarity for a page from the daily pulls (each covers the 3 days before it): sessions, pages per session, scroll depth, engagement time, dead clicks, rage clicks, error clicks, quick backs, excessive scrolling, script errors, by page, device and traffic source. pulls: how many days of pulls (1-7). Check the thank-you page too (page + /thank-you).", input_schema: obj({ url: str("page link"), pulls: { type: "integer" } }, ["url"]) },
    { name: "signups", description: "Sign-ups this page saved in our database over a date range: count per day, how many came from Meta ads, and per sign-up: time, channel, utm_content, whether they gave phone / consent. No personal details.", input_schema: obj({ url: str("page link"), ...dates }) },
    { name: "property", description: "For /auction/<slug> pages: the property's address, status, auction dates, reserve price — is it still something a visitor can register for?", input_schema: obj({ url: str("page link") }) },
    { name: "past_diagnoses", description: "What earlier days' diagnoses of this page found.", input_schema: obj({ url: str("page link") }) },
    {
        name: "open_page",
        description: "Open a page in a real Chrome as an ad visitor would. Returns status, timings (largest paint, when the first form field appears, download size), errors, tracking events fired, the form fields and buttons (and whether each is on the first screen), headings, visible text, things covering the screen, and a screenshot. Writes and tracking are blocked, so nothing is saved or counted. Add the ad's utm/fbclid query if you want the page to behave as for an ad click.",
        input_schema: obj({ url: str("page link"), device: { type: "string", enum: ["mobile", "desktop"] }, network: { type: "string", enum: ["normal", "slow4g", "3g"] } }, ["url"]),
    },
    {
        name: "browser",
        description: "Act on the open page like a visitor: click, fill (type into a field), select (choose an option), press (a key, e.g. Enter), scroll (value = pixels, or a target to scroll to), wait (value = ms), look (full=true for a picture of the whole page). Returns the page state and a screenshot. You may fill and submit the form with obviously fake test details (Test Visitor, test@example.com, 555-010-0100): submitting is blocked and you'll see what the form WOULD send, so expect the page to show an error or stay put afterwards. Note that, don't report it as a bug.",
        input_schema: obj({ action: { type: "string", enum: ["click", "fill", "select", "press", "scroll", "wait", "look"] }, target, value: str("text to type, option, key, pixels or ms"), full: { type: "boolean" } }, ["action"]),
    },
    { name: "list_files", description: "List files under a folder of a repo.", input_schema: obj({ repo: repoProp, folder: str("e.g. src/components/Landing/") }) },
    { name: "search_code", description: "Every line containing text (case-insensitive) in a repo's code, optionally under folder.", input_schema: obj({ repo: repoProp, text: str(""), folder: str("optional") }, ["repo", "text"]) },
    { name: "read_file", description: "Read a file from a repo (the live version).", input_schema: obj({ repo: repoProp, path: str("") }) },
    { name: "recent_commits", description: "Commits on the live branch, newest first; since/until ISO dates and path narrow it. Use it when sign-ups dropped on a date.", input_schema: obj({ repo: repoProp, since: str("optional"), until: str("optional"), path: str("optional") }, ["repo"]) },
    { name: "commit_diff", description: "The changes one commit made.", input_schema: obj({ repo: repoProp, sha: str("") }) },
    {
        name: "finish",
        description: "Give your diagnosis: the likely reasons this page gets visitors but few sign-ups, most likely first.",
        input_schema: obj({
            headline: str("One sentence a marketer understands: the main reason, or 'no clear cause' if the evidence doesn't point anywhere."),
            reasons: {
                type: "array",
                description: "1-6 reasons, most likely first.",
                items: obj({
                    reason: str("Short plain-English reason, e.g. 'On phones the form starts below 2 full screens of photos'."),
                    category: { type: "string", enum: CATEGORIES },
                    confidence: { type: "string", enum: ["high", "medium", "low"], description: "high only when you saw it yourself or the numbers show it clearly" },
                    evidence: str("The numbers / what you saw that point to it, with sources (Meta, Clarity, database, browser, code)."),
                    suggested_fix: str("What to change, concretely, in plain language."),
                }),
            },
            checked: str("One or two sentences: what you looked at, and anything you couldn't check and why."),
            screenshots: { type: "array", description: "Up to 3 screenshot ids (s1, s2…) that show the problems best, with a short caption each.", items: obj({ id: str(""), caption: str("") }) },
        }),
    },
];

function systemPrompt() {
    const { siteUrl } = getRepairConfig();
    return `You are Vihara's sign-up doctor. Vihara (${siteUrl}) is an online real-estate auction marketplace. Meta ads send investors and home buyers to landing pages (mostly /auction/<property> pages, plus buyer-list and early-access pages) where they register with name, email and phone. A sign-up is a saved registration.

You get one landing page that gets visitors from ads but few or no sign-ups. Find out WHY, with evidence, the way a senior conversion-rate expert would. You only report: you change nothing.

Work through these possible causes, and use the tools to check each one that the numbers don't already rule out:
1. Tracking, not conversion: does our database have sign-ups that Meta didn't count (or the reverse)? Compare the database with Meta registrations and pixel_stats (event_source shows browser vs CAPI). If people DO sign up and Meta just doesn't see it, say so first: it's then a tracking problem, not a page problem.
2. Traffic quality: link clicks that never become page views (slow page, accidental taps, Audience Network or in-app placements), placements / ages / regions that click but never sign up, very high frequency, a CTR that is high but leads nowhere, Clarity quick backs.
3. Message match: does the page deliver what the ad promises (property, place, price, "no fees", photos)? Read the ad with ad_details and compare it with the page.
4. Offer: is the auction over, the property sold or unavailable, the price unclear, the auction date too far off or past?
5. Speed: on a phone, especially on slow4g, how long until the form shows and can be used? Large downloads?
6. The form: open the page on mobile first. How far down is the form? How many fields, and are any surprising (too many required fields, phone format, consent box)? Fill it with fake test details and press submit: do validation errors block it? Does a button do nothing? Would the request carry all fields? Then check desktop.
7. UX and trust: unclear call to action, things covering the screen, broken layout, missing photos, no reason to trust Vihara, scary wording about auctions, fees or deposits.
8. Technical: script errors, failed requests, Clarity script errors, dead or rage clicks, error clicks.
9. When it started: if the sign-up rate was fine the week before and dropped, look at recent commits to the landing page code around that date.
Compare with a page that converts well (all_pages) to see what differs.

Rules:
- Evidence over opinion. Every reason needs numbers or something you saw. Mark guesses as low confidence. Never invent numbers.
- Small numbers mislead: 0 sign-ups from 15 visits is not proof of anything. Say when the sample is too small.
- Don't stop at the first problem: rank all real reasons.
- Clarity data covers the 3 days before each pull, in UTC; Meta dates are in the ad account's time zone. Some data may be missing; work with what there is and say what you couldn't check.
- Write for a non-technical marketing team: short, plain English, no code. Name files only if the fix is in the code.
- When done, call finish.`;
}

function addUsage(totals, usage) {
    if (!usage) return;
    totals.inputTokens += usage.input_tokens || 0;
    totals.outputTokens += usage.output_tokens || 0;
    totals.cacheReadTokens += usage.cache_read_input_tokens || 0;
    totals.cacheWriteTokens += usage.cache_creation_input_tokens || 0;
    totals.costUsd = (totals.inputTokens * PRICE.input + totals.outputTokens * PRICE.output + totals.cacheReadTokens * PRICE.cacheRead + totals.cacheWriteTokens * PRICE.cacheWrite) / 1e6;
}

/** Drops older screenshots once there are many, keeping the newest few (in batches, so the prompt cache survives in between). */
function pruneImages(messages) {
    const spots = [];
    messages.forEach((m, i) => {
        if (m.role !== "user" || !Array.isArray(m.content)) return;
        m.content.forEach((block, j) => {
            if (block.type !== "tool_result" || !Array.isArray(block.content)) return;
            block.content.forEach((c, k) => c.type === "image" && spots.push([i, j, k]));
        });
    });
    if (spots.length < PRUNE_AT_IMAGES) return;
    for (const [i, j, k] of spots.slice(0, spots.length - KEEP_IMAGES)) {
        messages[i].content[j].content[k] = { type: "text", text: "[older screenshot removed to save space]" };
    }
}

/** Read-only GitHub access to both repos, set up on first use. */
function codeTools() {
    let ready = null;
    const setup = async () => {
        const config = getRepairConfig();
        if (!config.githubToken) throw new Error("Code reading isn't set up (REPAIR_GITHUB_TOKEN missing). Work without the code.");
        const { repoClients } = require("../repair/repairAgent");
        const gh = repoClients();
        const trees = {};
        const shas = {};
        for (const name of Object.keys(REPOS)) {
            shas[name] = await gh[name].branchSha(config.baseBranch);
            trees[name] = await gh[name].listTree(shas[name]);
        }
        return { gh, trees, shas };
    };
    const get = () => (ready = ready || setup().catch((e) => ((ready = null), Promise.reject(e))));
    const checkRepo = (repo) => {
        if (!REPOS[repo]) throw new Error(`repo must be one of: ${Object.keys(REPOS).join(", ")}`);
    };
    const clean = (p) => path.normalize(String(p || "").replace(/^\/+/, "")).replace(/^\.\/?/, "");

    return {
        async list_files({ repo, folder }) {
            checkRepo(repo);
            const { trees } = await get();
            const prefix = clean(folder).replace(/\/?$/, "/");
            const files = trees[repo].map((e) => e.path).filter((p) => p.startsWith(prefix === "/" ? "" : prefix));
            return files.length ? files.slice(0, 300).join("\n") : `No files under ${prefix}`;
        },
        async search_code({ repo, text, folder = "" }) {
            checkRepo(repo);
            const { gh, trees } = await get();
            const needle = String(text).toLowerCase();
            if (needle.length < 2) throw new Error("Search for at least 2 characters");
            const prefix = folder ? clean(folder).replace(/\/?$/, "/") : "";
            const files = trees[repo].filter((e) => TEXT_FILE.test(e.path) && e.path.startsWith(prefix) && REPOS[repo].readable.test(e.path) && !/package-lock/.test(e.path));
            const hits = [];
            for (let i = 0; i < files.length && hits.length < 150; i += 16) {
                const batch = files.slice(i, i + 16);
                const bodies = await Promise.all(batch.map((e) => gh[repo].readBlob(e.sha)));
                batch.forEach((e, n) =>
                    bodies[n].split("\n").forEach((line, ln) => line.toLowerCase().includes(needle) && hits.push(`${e.path}:${ln + 1}: ${line.trim().slice(0, 180)}`))
                );
            }
            return hits.length ? hits.slice(0, 150).join("\n") : `No matches for "${text}"`;
        },
        async read_file({ repo, path: p }) {
            checkRepo(repo);
            const { gh, shas } = await get();
            p = clean(p);
            if (!REPOS[repo].readable.test(p)) throw new Error(`You can't read ${p}`);
            const text = await gh[repo].readFile(p, shas[repo]);
            return text.length > MAX_READ_CHARS ? `${text.slice(0, MAX_READ_CHARS)}\n…(cut off)` : text;
        },
        async recent_commits({ repo, since, until, path: p }) {
            checkRepo(repo);
            const { gh } = await get();
            const commits = await gh[repo].listCommits({ since, until, path: p ? clean(p) : undefined, perPage: 40 });
            return commits.map((c) => `${c.sha.slice(0, 10)} ${c.commit.author?.date?.slice(0, 16)} ${c.commit.message.split("\n")[0]}`).join("\n") || "No commits in that range";
        },
        async commit_diff({ repo, sha }) {
            checkRepo(repo);
            const { gh } = await get();
            const c = await gh[repo].getCommit(sha);
            let out = `${c.sha} on ${c.commit.author?.date}\n${c.commit.message}\n\n`;
            for (const f of c.files || []) {
                const chunk = `--- ${f.filename} (+${f.additions} -${f.deletions})\n${f.patch || "(no diff)"}\n\n`;
                if (out.length + chunk.length > MAX_DIFF_CHARS) return `${out}…(more files cut off)`;
                out += chunk;
            }
            return out;
        },
    };
}

const json = (value) => JSON.stringify(value, null, 1);

/**
 * Investigates one page.
 * @param {object} page   the page's funnel from buildPageFunnels()
 * @param {object} ctx    { pages: all funnels, window }
 * @returns {Promise<{ok: true, headline, reasons, checked, screenshots: [{caption, buffer}], usage} | {ok: false, error, usage}>}
 */
async function diagnosePage(page, { pages, window: range }, { log = () => {} } = {}) {
    const config = getConversionConfig();
    const anthropic = getClient();
    const visitor = createVisitor({ log });
    const code = codeTools();

    const tools = {
        ...code,
        async all_pages() {
            return json(pages.map(({ ads, ...p }) => ({ ...p, ads: ads.length })));
        },
        async ad_funnel({ since, until, breakdown, ad_id: adId }) {
            const rows = await adFunnel(since, until, { breakdown, adId });
            return json(rows.filter((r) => r.impressions > 0).slice(0, 120));
        },
        async ad_details({ ad_id: adId }) {
            return json(await adDetails(adId));
        },
        async meta_daily_conversions({ since, until }) {
            return (await meta.dailyConversions(since, until)).map((d) => `${d.date}: ${d.registrations} registrations, ${d.leads} Leads`).join("\n") || "No data";
        },
        async pixel_stats({ aggregation, event, since, until }) {
            try {
                return json(await pixelStats({ aggregation, event, since, until }));
            } catch (e) {
                const m = e.response?.data?.error?.message || e.message;
                return `Pixel stats unavailable: ${m}. (The ads token may not have access to the pixel.)`;
            }
        },
        async clarity({ url, pulls = 1 }) {
            const n = Math.min(Math.max(Number(pulls) || 1, 1), 7);
            const rows = (await clarityForPage(url, { pulls: n })).filter((r) => Object.keys(r.metrics).length);
            return `${await clarityStatus()}\n${rows.length ? json(rows) : "Clarity has no rows for this page in those pulls (no sessions, or not pulled yet)."}`;
        },
        async signups({ url, since, until }) {
            const zoneStart = new Date(`${since}T00:00:00Z`);
            const zoneEnd = new Date(new Date(`${until}T00:00:00Z`).getTime() + 86400000);
            const found = await signupsForPage(url, zoneStart, zoneEnd);
            return found ? json(found) : "This page's sign-ups aren't mapped to a database collection; use Meta registrations instead.";
        },
        async property({ url }) {
            return json((await propertyForPage(url)) || "Not a property auction page.");
        },
        async past_diagnoses({ url }) {
            const key = require("./pageFunnels").pageKey(url);
            const past = await ConversionDiagnosis.find({ pageKey: key, status: "done" }).sort({ createdAt: -1 }).limit(5).lean();
            if (!past.length) return "No earlier diagnoses of this page.";
            return past.map((d) => `${d.day}: ${d.headline}\n${d.reasons.map((r, i) => `  ${i + 1}. [${r.confidence}] ${r.reason}`).join("\n")}`).join("\n\n");
        },
    };
    const browserTools = { open_page: (input) => visitor.open(input), browser: (input) => visitor.act(input) };

    const { ads, ...funnel } = page;
    const first = `Page: ${page.url}
Window: ${range.since} to ${range.until} (ad account time zone). Today is ${new Date().toISOString().slice(0, 10)}.

Funnel:
${json(funnel)}

Ads sending people here:
${json(ads)}`;

    const messages = [{ role: "user", content: first }];
    const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 };
    const system = systemPrompt();

    try {
        let warned = false;
        for (let step = 0; step < MAX_STEPS; step++) {
            const overBudget = usage.costUsd > config.agent.maxCostUsd;
            if (overBudget && warned) return { ok: false, usage, error: `Stopped at the $${config.agent.maxCostUsd} cost limit without a diagnosis.` };
            if (overBudget) {
                // Only finish is offered from here; the note rides on the last tool results.
                warned = true;
                const last = messages[messages.length - 1];
                const note = { type: "text", text: "You've reached the cost limit. Call finish now with what you found so far." };
                if (Array.isArray(last.content)) last.content.push(note);
                else last.content = [{ type: "text", text: last.content }, note];
            }
            pruneImages(messages);
            const response = await anthropic.beta.messages
                .stream({
                    model: config.agent.model,
                    max_tokens: 32000,
                    betas: ["server-side-fallback-2026-07-01", "thinking-binding-controls-2026-08-01"],
                    fallbacks: "default",
                    // pruneImages() rewrites older tool results; thinking tied to them is dropped, not rejected.
                    thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } },
                    output_config: { effort: config.agent.effort },
                    cache_control: { type: "ephemeral" },
                    system,
                    tools: overBudget ? TOOLS.filter((t) => t.name === "finish") : TOOLS,
                    messages,
                })
                .finalMessage();
            addUsage(usage, response.usage);
            messages.push({ role: "assistant", content: response.content });

            if (response.stop_reason === "refusal") return { ok: false, usage, error: "The AI declined this task." };
            if (response.stop_reason === "pause_turn") continue;
            const toolUses = response.content.filter((b) => b.type === "tool_use");
            if (!toolUses.length) {
                messages.push({ role: "user", content: "Continue: investigate with the tools, then call finish." });
                continue;
            }

            const results = [];
            let finished = null;
            for (const block of toolUses) {
                const input = block.input || {};
                if (block.name === "finish") {
                    const reasons = Array.isArray(input.reasons) ? input.reasons.filter((r) => r && r.reason) : [];
                    if (!reasons.length || !input.headline) {
                        results.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: "Give a headline and at least one reason." });
                        continue;
                    }
                    finished = { ...input, reasons };
                    results.push({ type: "tool_result", tool_use_id: block.id, content: "Done." });
                    continue;
                }
                try {
                    if (browserTools[block.name]) {
                        const { out, image } = await browserTools[block.name](input);
                        results.push({
                            type: "tool_result",
                            tool_use_id: block.id,
                            content: [{ type: "text", text: json(out) }, { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } }],
                        });
                    } else if (tools[block.name]) {
                        const out = await tools[block.name](input);
                        log(`${block.name}: ${String(out).split("\n")[0].slice(0, 140)}`);
                        results.push({ type: "tool_result", tool_use_id: block.id, content: String(out) });
                    } else {
                        results.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: `Unknown tool ${block.name}` });
                    }
                } catch (err) {
                    const m = err.response?.data?.error?.message || err.message;
                    results.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: String(m).slice(0, 1000) });
                }
            }
            messages.push({ role: "user", content: results });

            if (finished) {
                const byId = new Map(visitor.shots.map((s) => [s.id, s]));
                const screenshots = (finished.screenshots || [])
                    .filter((s) => byId.has(s.id))
                    .slice(0, 3)
                    .map((s) => ({ caption: s.caption || byId.get(s.id).caption, buffer: byId.get(s.id).buffer }));
                return {
                    ok: true,
                    headline: finished.headline.trim(),
                    reasons: finished.reasons.slice(0, 6).map((r) => ({
                        reason: r.reason,
                        category: CATEGORIES.includes(r.category) ? r.category : "other",
                        confidence: ["high", "medium", "low"].includes(r.confidence) ? r.confidence : "medium",
                        evidence: r.evidence || "",
                        suggestedFix: r.suggested_fix || "",
                    })),
                    checked: (finished.checked || "").trim(),
                    screenshots,
                    usage,
                };
            }
        }
        return { ok: false, usage, error: "The AI took too many steps without finishing." };
    } finally {
        await visitor.close();
    }
}

module.exports = { diagnosePage };
