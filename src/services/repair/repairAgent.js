// services/repair/repairAgent.js
//
// The repair agent: Claude investigates one incident across the website and
// backend code (read, search, recent commits, the live page, Meta numbers),
// finds the cause, and either edits the code or explains the manual fix
// (GTM, Meta settings — places the code can't reach).
//
//   incident ─▶ Claude ─▶ read / search / commits / fetch_page / meta_conversions
//                     ─▶ edit_file / write_file (staged in memory)
//                     ─▶ finish ─▶ syntax checks ─▶ problems? back to Claude
//                                                └▶ ok: return staged files per repo
//
// Nothing is saved here. incidentService commits the files to a branch and
// asks for Go in Slack.

const path = require("path").posix;
const Anthropic = require("@anthropic-ai/sdk");
const babel = require("@babel/parser");
const { createGithubClient, GithubError } = require("../design/githubService");
const { getRepairConfig } = require("../../config/repair/repairConfig");
const { fetchPage } = require("./checks");
const meta = require("./metaGraph");
const productModel = require("../../model/property/productModel");

const MAX_STEPS = 80;
const MAX_READ_CHARS = 120000;
const MAX_DIFF_CHARS = 40000;
// Opus 5.5 rates, $ per million tokens (cache writes are 1.25× input).
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };
// A fix for one broken thing is small. Bigger changes are refused, so the agent
// can't drift into redesigns, refactors or new features.
const MAX_FILES_CHANGED = 5;
const MAX_LINES_CHANGED = 150;
// A sign-up fix (from the sign-up doctor, asked for in Slack) may also change a
// landing page's wording, layout and styling, so it gets a little more room.
const SIGNUP_LIMITS = { files: 6, lines: 250 };
const isSignupFix = (incident) => incident?.kind === "signup_issue";
const limitsFor = (incident) => (isSignupFix(incident) ? SIGNUP_LIMITS : { files: MAX_FILES_CHANGED, lines: MAX_LINES_CHANGED });
// Styling a sign-up fix may touch: the website's own stylesheets, never assets.
const SIGNUP_STYLES = /^src\/.+\.(css|scss)$/;
const TEXT_FILE = /\.(jsx?|tsx?|mjs|cjs|css|scss|html|json|md)$/;

// What each repo is, and what the agent may change in it.
const REPOS = {
    website: {
        about: "The website: React app on Vercel. Meta pixel and GTM load in public/index.html; conversions fire from src/services/capi.service.js and src/components/Landing/landing.helpers.js.",
        readable: /^(src\/|public\/|package\.json$|\.github\/workflows\/)/,
        // Code only: never styling, images or other assets.
        writable: /^(src\/.+\.(jsx?|tsx?|json)|public\/index\.html)$/,
    },
    backend: {
        about: "The backend: Node/Express on Render. Server-side Meta Conversions API is src/services/integrations/metaCapiService.js; lead sign-up controllers are in src/controller/leads/.",
        readable: /^(src\/|package\.json$)/,
        // Never its own code or config.
        writable: /^src\/(?!services\/repair\/|config\/repair\/|model\/repair\/).+\.(js|json)$/,
    },
};

let client = null;
function getClient() {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set — the repair agent is unavailable");
    if (!client) {
        const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
        client = new Anthropic({
            timeout: 10 * 60 * 1000,
            maxRetries: 2,
            ...(workspaceId && { defaultHeaders: { "anthropic-workspace-id": workspaceId } }),
        });
    }
    return client;
}

/** GitHub clients for both repos, with the repair token. */
function repoClients() {
    const config = getRepairConfig();
    const make = (name) =>
        createGithubClient({
            repo: () => config.repos[name],
            token: () => config.githubToken,
            baseBranch: () => config.baseBranch,
            label: "the repair agent",
            tokenName: "REPAIR_GITHUB_TOKEN",
        });
    return { website: make("website"), backend: make("backend") };
}

const repoProp = { type: "string", enum: Object.keys(REPOS), description: "\"website\" or \"backend\"" };
const TOOLS = [
    {
        name: "list_files",
        description: "List files under a folder of a repo, e.g. folder \"src/components/Landing/\".",
        input_schema: { type: "object", properties: { repo: repoProp, folder: { type: "string" } }, required: ["repo", "folder"], additionalProperties: false },
    },
    {
        name: "search_code",
        description: "Find every line containing `text` (exact, case-insensitive) in the repo's code files, optionally only under `folder`. Returns path:line: text.",
        input_schema: {
            type: "object",
            properties: { repo: repoProp, text: { type: "string" }, folder: { type: "string" } },
            required: ["repo", "text"],
            additionalProperties: false,
        },
    },
    {
        name: "read_file",
        description: "Read a file. Shows your unsaved edits if you changed it.",
        input_schema: { type: "object", properties: { repo: repoProp, path: { type: "string" } }, required: ["repo", "path"], additionalProperties: false },
    },
    {
        name: "recent_commits",
        description: "Commits on the live branch, newest first. Use since/until (ISO dates) to look around when a problem started, and path to narrow to a file or folder.",
        input_schema: {
            type: "object",
            properties: { repo: repoProp, since: { type: "string" }, until: { type: "string" }, path: { type: "string" } },
            required: ["repo"],
            additionalProperties: false,
        },
    },
    {
        name: "commit_diff",
        description: "The changes one commit made (files and their diffs).",
        input_schema: { type: "object", properties: { repo: repoProp, sha: { type: "string" } }, required: ["repo", "sha"], additionalProperties: false },
    },
    {
        name: "fetch_page",
        description: "Load a page of the live site (or a Vercel preview) the way a visitor's browser first does: status, final URL after redirects, load time, the scripts it loads and the start of its HTML. JavaScript is not run.",
        input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false },
    },
    {
        name: "meta_conversions",
        description: "Website registrations and Lead events Meta received per day (YYYY-MM-DD, at most 30 days).",
        input_schema: { type: "object", properties: { since: { type: "string" }, until: { type: "string" } }, required: ["since", "until"], additionalProperties: false },
    },
    {
        name: "ad_stats",
        description: "Per ad over a date range (YYYY-MM-DD): link clicks and landing page views. Also lists the ads delivering now with the links they send people to.",
        input_schema: { type: "object", properties: { since: { type: "string" }, until: { type: "string" } }, required: ["since", "until"], additionalProperties: false },
    },
    {
        name: "find_property_page",
        description: "Find a property's auction landing page by city, street or slug words (e.g. \"Lathrup Village\", \"New Orleans\"). Returns each match's address, status and page link.",
        input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
    },
    {
        name: "edit_file",
        description: "Replace old_text with new_text in a file (old_text must appear exactly once). Changes are staged; nothing goes live until an approver says Go.",
        input_schema: {
            type: "object",
            properties: { repo: repoProp, path: { type: "string" }, old_text: { type: "string" }, new_text: { type: "string" } },
            required: ["repo", "path", "old_text", "new_text"],
            additionalProperties: false,
        },
    },
    {
        name: "write_file",
        description: "Create a file or replace its whole content. Prefer edit_file for existing files.",
        input_schema: {
            type: "object",
            properties: { repo: repoProp, path: { type: "string" }, content: { type: "string" } },
            required: ["repo", "path", "content"],
            additionalProperties: false,
        },
    },
    {
        name: "finish",
        description: "End the investigation. Call once you know the cause. If the fix is in the code, make the edits first. If the cause is outside the code (GTM, Meta Events Manager, ad settings, hosting), make no edits and give manual_steps.",
        input_schema: {
            type: "object",
            properties: {
                cause: { type: "string", description: "What broke and why, with the evidence (commit, file, date). Plain language, 2-5 sentences." },
                fix_summary: { type: "string", description: "What your edits change, in plain language. Empty if you made no edits." },
                manual_steps: { type: "string", description: "Numbered steps a non-technical person can follow, for anything that must be done outside the code. Empty if none." },
            },
            required: ["cause", "fix_summary", "manual_steps"],
            additionalProperties: false,
        },
    },
];

function systemPrompt(incident) {
    const { siteUrl } = getRepairConfig();
    const signup = isSignupFix(incident);
    const { files: maxFiles, lines: maxLines } = limitsFor(incident);
    const intro = signup
        ? "The sign-up doctor found a likely reason an ad landing page gets visitors but few sign-ups, and a person asked in Slack for it to be fixed. Its evidence and suggested fix are below: check them against the code and the live page, then make the change that removes this reason, or explain exactly what a person must do when the fix is outside the code."
        : "A daily check, or a technical action item in the daily Meta Ads report, found a broken technical thing (Meta tracking, an ad's landing page, a link, an ad that isn't delivering). When the item comes from the report, its suggestion (\"audit the page\", \"confirm the event fires\") is your task: do that audit yourself with the tools, then fix what is broken. Your job: find the real cause and fix it with the smallest safe change, or explain exactly what a person must do when the cause is outside the code.";
    const scope = signup
        ? `2. Fix only this one reason. You may change the landing page's wording, layout, styling (the website's .css files) and form behaviour, but nothing unrelated: no refactors, no new packages, no redesign. Keep Vihara's brand (main colour #0c4bea). When the code is shared by every landing page (e.g. PropertyAuctionPage.jsx, landing.helpers.js), make sure the change is right for all of them, or limit it to the pages that need it. A fix may change at most ${maxFiles} files and ${maxLines} lines.`
        : `2. You only repair broken technical things. Fix only the cause of this incident: no refactors, no unrelated cleanups, no new packages, no new features, no changes to design, styling, layout or wording. You can't change CSS or assets, and a fix may change at most ${maxFiles} files and ${maxLines} lines.`;
    const outside = signup
        ? "4. Some fixes are outside the code: the ad's text, image, targeting or budget in Ads Manager, or a property's details (type, price, dates, photos) entered in the admin panel. Then make no edits for that part; write manual_steps a non-technical person can follow (where to click, what to change it to), and say how to confirm it worked."
        : "4. Some causes are outside the code: Google Tag Manager tags/triggers, Meta Events Manager settings, ad links, review status or delivery settings in Ads Manager, DNS/hosting. Then make no edits; write manual_steps a non-technical person can follow (where to click, what to check), and say how to confirm it worked.";
    return `You are Vihara's repair agent. ${intro}

You have two repos:
- website: ${REPOS.website.about}
- backend: ${REPOS.backend.about}
The live site is ${siteUrl}.

How to work:
1. Start from the evidence. Find when it started, then use recent_commits around that date and commit_diff to see what changed. Read the code that is involved. Don't guess.
${scope}
3. Never remove tracking, consent, or lead-saving code to make a check pass, and never weaken validation of contact details or consent.
${outside}
5. Everything you change waits for a person's Go in Slack before it goes live, and the next day's check confirms it. Still, be certain: a wrong fix to sign-up or tracking code loses real leads.
6. Write cause, fix_summary and manual_steps in short, plain English for a non-technical reader. No code in them; name files only where needed.`;
}

function incidentText(incident) {
    const evidence = Object.entries(incident.evidence || {})
        .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join("\n");
    let text = `Incident ${incident.incidentId}: ${incident.title}\nFirst seen ${incident.firstSeenAt.toISOString().slice(0, 10)}.\n\nEvidence:\n${evidence}`;

    // A person looked at the last fix and pressed "✏️ Change".
    const feedback = incident.feedback || [];
    const last = feedback[feedback.length - 1];
    if (last) {
        const earlier = feedback.slice(0, -1).map((f) => `- "${f.text}"`).join("\n");
        text += `

A person reviewed your previous fix and asked for changes. Your edits start again from the live code, so make a NEW complete fix: keep what was right in the previous one and change what they asked for.

Previous cause: ${last.previousCause || "(none)"}
Previous fix: ${last.previousFix || "(no code change)"}${last.previousManualSteps ? `\nPrevious manual steps: ${last.previousManualSteps}` : ""}
Previous change:
${last.previousDiff || "(no code change)"}

They asked: "${last.text}"${earlier ? `\n\nTheir earlier requests (still apply unless the new one says otherwise):\n${earlier}` : ""}`;
    }
    return text;
}

function addUsage(totals, usage) {
    if (!usage) return;
    totals.inputTokens += usage.input_tokens || 0;
    totals.outputTokens += usage.output_tokens || 0;
    totals.cacheReadTokens += usage.cache_read_input_tokens || 0;
    totals.cacheWriteTokens += usage.cache_creation_input_tokens || 0;
    totals.costUsd =
        (totals.inputTokens * PRICE.input +
            totals.outputTokens * PRICE.output +
            totals.cacheReadTokens * PRICE.cacheRead +
            totals.cacheWriteTokens * PRICE.cacheWrite) /
        1e6;
}

/** Lines added + removed between two versions of a file (order-insensitive estimate). */
function linesChanged(before, after) {
    const count = (text) => {
        const m = new Map();
        for (const line of String(text || "").split("\n")) m.set(line, (m.get(line) || 0) + 1);
        return m;
    };
    const a = count(before);
    const b = count(after);
    let diff = 0;
    for (const [line, n] of a) diff += Math.max(0, n - (b.get(line) || 0));
    for (const [line, n] of b) diff += Math.max(0, n - (a.get(line) || 0));
    return diff;
}

/** Changes too big to be a repair ([] when within limits). */
function scopeProblems(changed, originals, limits) {
    const problems = [];
    const files = Object.keys(changed);
    if (files.length > limits.files) {
        problems.push(`You changed ${files.length} files; a repair may change at most ${limits.files}. Fix only the cause of this incident.`);
    }
    const lines = files.reduce((sum, k) => sum + linesChanged(originals[k], changed[k]), 0);
    if (lines > limits.lines) {
        problems.push(`You changed about ${lines} lines; a repair may change at most ${limits.lines}. Undo anything that isn't needed to fix this incident (re-write the files with their original text where needed).`);
    }
    return problems;
}

/** Syntax problems in changed files ([] when all parse). */
function syntaxProblems(changed) {
    const problems = [];
    for (const [key, text] of Object.entries(changed)) {
        const file = key.slice(key.indexOf(":") + 1);
        try {
            if (/\.json$/.test(file)) JSON.parse(text);
            else if (/\.(jsx?|mjs|cjs)$/.test(file)) {
                babel.parse(text, { sourceType: "unambiguous", allowReturnOutsideFunction: true, errorRecovery: false, plugins: ["jsx"] });
            }
        } catch (error) {
            problems.push(`${key} doesn't parse: ${error.message}`);
        }
    }
    return problems;
}

/**
 * Investigates one incident.
 * @returns {Promise<{ok: true, cause, fixSummary, manualSteps, files: {website: {}, backend: {}}, usage, baseShas}
 *                  | {ok: false, error, usage}>}
 */
async function investigate(incident, { log = () => {} } = {}) {
    const config = getRepairConfig();
    const anthropic = getClient();
    const gh = repoClients();

    // Read everything at the commit main is on now, so the fix applies cleanly.
    const baseShas = {};
    const repoFiles = {};
    for (const name of Object.keys(REPOS)) {
        baseShas[name] = await gh[name].branchSha(config.baseBranch);
        repoFiles[name] = await gh[name].listTree(baseShas[name]);
    }
    const exists = (repo, p) => repoFiles[repo].some((e) => e.path === p);

    const staged = {}; // "repo:path" → new content
    const originals = {}; // "repo:path" → content before (null = new file)
    const cleanPath = (p) => path.normalize(String(p).replace(/^\/+/, ""));
    const checkRepo = (repo) => {
        if (!REPOS[repo]) throw new Error(`repo must be one of: ${Object.keys(REPOS).join(", ")}`);
        return repo;
    };
    const currentText = async (repo, p) => {
        const k = `${repo}:${p}`;
        if (k in staged) return staged[k];
        if (!(k in originals)) originals[k] = exists(repo, p) ? await gh[repo].readFile(p, baseShas[repo]) : null;
        return originals[k];
    };
    const assertWritable = (repo, p) => {
        const styling = isSignupFix(incident) && repo === "website" && SIGNUP_STYLES.test(p);
        if (!REPOS[repo].writable.test(p) && !styling) throw new Error(`You're not allowed to change ${p} in ${repo}.`);
    };

    const tools = {
        async list_files({ repo, folder }) {
            checkRepo(repo);
            const prefix = cleanPath(folder).replace(/\/?$/, "/").replace(/^\.\//, "");
            const files = repoFiles[repo].map((e) => e.path).filter((p) => p.startsWith(prefix));
            if (!files.length) return `No files under ${prefix}`;
            return files.slice(0, 400).join("\n") + (files.length > 400 ? `\n…and ${files.length - 400} more` : "");
        },
        async search_code({ repo, text, folder = "" }) {
            checkRepo(repo);
            const needle = String(text).toLowerCase();
            if (needle.length < 2) throw new Error("Search for at least 2 characters");
            const prefix = folder ? cleanPath(folder).replace(/\/?$/, "/") : "";
            const candidates = repoFiles[repo].filter(
                (e) => TEXT_FILE.test(e.path) && e.path.startsWith(prefix) && REPOS[repo].readable.test(e.path) && !/package-lock\.json$/.test(e.path)
            );
            const hits = [];
            for (let i = 0; i < candidates.length && hits.length < 200; i += 16) {
                const batch = candidates.slice(i, i + 16);
                const texts = await Promise.all(batch.map((e) => gh[repo].readBlob(e.sha)));
                batch.forEach((e, j) => {
                    const k = `${repo}:${e.path}`;
                    const body = k in staged ? staged[k] : texts[j];
                    body.split("\n").forEach((line, n) => {
                        if (line.toLowerCase().includes(needle)) hits.push(`${e.path}:${n + 1}: ${line.trim().slice(0, 200)}`);
                    });
                });
            }
            if (!hits.length) return `No matches for "${text}"`;
            return hits.slice(0, 200).join("\n") + (hits.length >= 200 ? "\n…(more matches cut off; narrow with folder)" : "");
        },
        async read_file({ repo, path: p }) {
            checkRepo(repo);
            p = cleanPath(p);
            if (!REPOS[repo].readable.test(p)) throw new Error(`You can't read ${p} in ${repo}`);
            const text = await currentText(repo, p);
            if (text === null || text === undefined) throw new Error(`${p} doesn't exist in ${repo}`);
            return text.length > MAX_READ_CHARS ? `${text.slice(0, MAX_READ_CHARS)}\n…(cut off: file is ${text.length} characters)` : text;
        },
        async recent_commits({ repo, since, until, path: p }) {
            checkRepo(repo);
            const commits = await gh[repo].listCommits({ since, until, path: p ? cleanPath(p) : undefined, perPage: 50 });
            if (!commits.length) return "No commits in that range";
            return commits
                .map((c) => `${c.sha.slice(0, 10)} ${c.commit.author?.date?.slice(0, 16)} ${c.commit.author?.name}: ${c.commit.message.split("\n")[0]}`)
                .join("\n");
        },
        async commit_diff({ repo, sha }) {
            checkRepo(repo);
            const c = await gh[repo].getCommit(sha);
            let out = `${c.sha} by ${c.commit.author?.name} on ${c.commit.author?.date}\n${c.commit.message}\n\n`;
            for (const f of c.files || []) {
                const chunk = `--- ${f.filename} (${f.status}, +${f.additions} -${f.deletions})\n${f.patch || "(no diff shown)"}\n\n`;
                if (out.length + chunk.length > MAX_DIFF_CHARS) {
                    out += `…(more files cut off: ${(c.files || []).map((x) => x.filename).join(", ")})`;
                    break;
                }
                out += chunk;
            }
            return out;
        },
        async fetch_page({ url }) {
            const u = new URL(url);
            const siteHost = new URL(config.siteUrl).hostname.replace(/^www\./, "");
            if (u.hostname.replace(/^www\./, "") !== siteHost && !u.hostname.endsWith(".vercel.app")) {
                throw new Error(`Only ${siteHost} and Vercel preview links can be fetched`);
            }
            const page = await fetchPage(url);
            const scripts = [...page.html.matchAll(/<script[^>]*src=["']([^"']+)["']/g)].map((m) => m[1]);
            return [
                `status ${page.status}${page.error ? ` (${page.error})` : ""}, ${page.ms} ms, final URL ${page.finalUrl}`,
                `scripts: ${scripts.join(", ") || "none"}`,
                `HTML (start):\n${page.html.slice(0, 6000)}`,
            ].join("\n");
        },
        async meta_conversions({ since, until }) {
            const days = await meta.dailyConversions(since, until);
            return days.map((d) => `${d.date}: ${d.registrations} registrations, ${d.leads} Leads`).join("\n") || "No data";
        },
        async ad_stats({ since, until }) {
            const [traffic, live] = await Promise.all([meta.adTraffic(since, until), meta.activeAdsWithLinks().catch(() => [])]);
            const rows = traffic.map((t) => `${t.adName} (${t.adId}): ${t.linkClicks} link clicks, ${t.pageViews} page views`);
            const links = live.map((a) => `${a.adName}: ${a.links.join(" ") || "(link not readable with the ads token)"}`);
            return `Traffic:\n${rows.join("\n") || "none"}\n\nDelivering now:\n${links.join("\n") || "none"}`;
        },
        async find_property_page({ text }) {
            const words = String(text).trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
            if (!words.join("").length || words.join("").length < 2) throw new Error("Give at least 2 characters");
            const match = new RegExp(words.join(".*"), "i");
            const found = await productModel
                .find({ $or: [{ city: match }, { street: match }, { slug: new RegExp(words.join("-"), "i") }] })
                .select("street city state slug status")
                .limit(15)
                .lean();
            if (!found.length) return `No property matches "${text}"`;
            return found.map((p) => `${p.street}, ${p.city}, ${p.state} (${p.status}): ${config.siteUrl}/auction/${p.slug}`).join("\n");
        },
        async edit_file({ repo, path: p, old_text: oldText, new_text: newText }) {
            checkRepo(repo);
            p = cleanPath(p);
            assertWritable(repo, p);
            const text = await currentText(repo, p);
            if (text === null) throw new Error(`${p} doesn't exist — use write_file to create it`);
            const count = text.split(oldText).length - 1;
            if (count === 0) throw new Error("old_text was not found. Read the file again and copy the text exactly.");
            if (count > 1) throw new Error(`old_text appears ${count} times. Include more surrounding text so it's unique.`);
            staged[`${repo}:${p}`] = text.replace(oldText, () => newText);
            return `Edited ${repo}:${p}`;
        },
        async write_file({ repo, path: p, content }) {
            checkRepo(repo);
            p = cleanPath(p);
            assertWritable(repo, p);
            await currentText(repo, p); // remember the original before overwriting
            staged[`${repo}:${p}`] = content;
            return `Wrote ${repo}:${p}`;
        },
    };

    const messages = [{ role: "user", content: incidentText(incident) }];
    const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 };
    const system = systemPrompt(incident);

    for (let step = 0; step < MAX_STEPS; step++) {
        if (usage.costUsd > config.agent.maxCostUsd) {
            return { ok: false, usage, error: `Stopped at the $${config.agent.maxCostUsd} cost limit before finding a fix.` };
        }
        const response = await anthropic.beta.messages
            .stream({
                model: config.agent.model,
                max_tokens: 64000,
                betas: ["server-side-fallback-2026-07-01"],
                // If this model declines a request, the API retries it on a fallback model.
                fallbacks: "default",
                output_config: { effort: config.agent.effort },
                cache_control: { type: "ephemeral" },
                system,
                tools: TOOLS,
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
            if (response.stop_reason === "max_tokens") {
                results.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: "Your response was cut off before this finished. Make smaller edits." });
                continue;
            }
            const schema = TOOLS.find((t) => t.name === block.name)?.input_schema;
            if (!schema || !schema.required.every((k) => typeof input[k] === "string")) {
                results.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: `Invalid input for ${block.name}` });
                continue;
            }
            if (block.name === "finish") {
                const changed = Object.fromEntries(Object.entries(staged).filter(([k, t]) => t !== originals[k]));
                const problems = [...syntaxProblems(changed), ...scopeProblems(changed, originals, limitsFor(incident))];
                if (Object.keys(changed).length && !input.fix_summary.trim()) problems.push("You changed files, so fix_summary can't be empty.");
                if (!Object.keys(changed).length && !input.manual_steps.trim()) {
                    problems.push("You made no edits, so give manual_steps (or make the fix in the code).");
                }
                if (problems.length) {
                    results.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: `Not finished — fix these and call finish again:\n${problems.map((p) => `- ${p}`).join("\n")}` });
                } else {
                    finished = { changed, input };
                    results.push({ type: "tool_result", tool_use_id: block.id, content: "Done." });
                }
                continue;
            }
            try {
                const out = await tools[block.name](input);
                if (!["read_file", "list_files", "search_code"].includes(block.name)) log(`${block.name}: ${String(out).split("\n")[0].slice(0, 160)}`);
                results.push({ type: "tool_result", tool_use_id: block.id, content: String(out) });
            } catch (err) {
                // GitHub being unreachable isn't something Claude can fix: stop.
                if (err instanceof GithubError && (err.status === 401 || err.status === 403 || !err.status)) throw err;
                results.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: err.message });
            }
        }
        messages.push({ role: "user", content: results });

        if (finished) {
            const files = { website: {}, backend: {} };
            for (const [k, text] of Object.entries(finished.changed)) {
                const i = k.indexOf(":");
                files[k.slice(0, i)][k.slice(i + 1)] = text;
            }
            return {
                ok: true,
                cause: finished.input.cause.trim(),
                fixSummary: finished.input.fix_summary.trim(),
                manualSteps: finished.input.manual_steps.trim(),
                files,
                baseShas,
                usage,
            };
        }
    }
    return { ok: false, usage, error: "The AI took too many steps without finishing." };
}

module.exports = { investigate, repoClients };
