// services/design/designAgentService.js
//
// The design agent: Claude reads a page's code from GitHub, rewrites how it
// looks to match the admin's request and the Brand Kit, and hands back the
// changed files plus a plain-language summary.
//
//   request ─▶ Claude ─▶ read_file / edit_file / write_file ─▶ (staged in memory)
//                     ─▶ finish ─▶ designChecks ─▶ problems? back to Claude
//                                               └▶ ok: return changed files
//
// Nothing is saved here. designJobService commits the result to a branch.
// Claude can read any file under src/ but write only the page's own files.
const path = require("path").posix;
const Anthropic = require("@anthropic-ai/sdk");
const github = require("./githubService");
const { runChecks } = require("./designChecks");

const MODEL = process.env.DESIGN_AGENT_MODEL || "claude-opus-5-5";
const EFFORT = process.env.DESIGN_AGENT_EFFORT || "high";
// Claude turns allowed for one round, and the most one round may cost.
const MAX_STEPS = 60;
const MAX_COST_USD = Number(process.env.DESIGN_AGENT_MAX_COST_USD) || 5;
// Opus 5.5 rates, $ per million tokens (cache writes are 1.25× input).
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };
const MAX_READ_CHARS = 150000;
const READABLE = /^(src\/|public\/index\.html$|package\.json$)/;

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set — the design agent is unavailable");
  }
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

const TOOLS = [
  {
    name: "list_files",
    description: "List every file under a folder of the website repo, e.g. \"src/components/ContactUs/\".",
    input_schema: {
      type: "object",
      properties: { folder: { type: "string" } },
      required: ["folder"],
      additionalProperties: false,
    },
  },
  {
    name: "read_file",
    description: "Read a file from the website repo (anything under src/, plus package.json and public/index.html). Shows your unsaved edits if you changed it.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "edit_file",
    description: "Replace one exact piece of text in a file you are allowed to change. old_text must appear exactly once. Prefer this for small and medium changes.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        old_text: { type: "string" },
        new_text: { type: "string" },
      },
      required: ["path", "old_text", "new_text"],
      additionalProperties: false,
    },
  },
  {
    name: "write_file",
    description: "Create a file, or replace a whole file, that you are allowed to change. Use for new files or full rewrites.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
  {
    name: "finish",
    description: "Call when the page is done. Your changes are checked automatically; if anything fails you get the problems back to fix. summary is shown to a non-technical admin.",
    input_schema: {
      type: "object",
      properties: { summary: { type: "string" } },
      required: ["summary"],
      additionalProperties: false,
    },
  },
].map((t) => ({ ...t, eager_input_streaming: true }));

function brandText(kit) {
  const colors = Object.entries(kit.colors)
    .map(([k, v]) => `  var(--brand-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)})  ${v}`)
    .join("\n");
  return `Colours (always use the variable, never the hex value):
${colors}
Fonts: headings var(--brand-font-heading) (${kit.fonts.heading}), body var(--brand-font-body) (${kit.fonts.body})
Corner roundness: var(--brand-radius) (${kit.radius}px)
White (#fff) and black, and rgba(0,0,0,x) shadows, are also fine.
Logo: ${kit.logo.src} — ${kit.logo.rules}

Messaging
Tagline: ${kit.messaging.tagline}
Tone of voice: ${kit.messaging.tone}
Words we like: ${kit.messaging.wordsToUse}
Words we avoid: ${kit.messaging.wordsToAvoid}`;
}

function systemPrompt({ kit, page, editable }) {
  return `You are the design agent for vihara.ai, a real estate auction website (React 18, Create React App, plain CSS files). An admin who is not technical asks you to design or redesign a page. You change how the page looks and reads; you never change what it does.

# Brand Kit — every page must follow it
${brandText(kit)}

# The page
${page.label} — shown at ${page.path}
You may change only these files (folders end in "/"; you may also add new files inside them):
${editable.map((e) => `- ${e}`).join("\n")}
You can read any other file under src/ to understand shared components, but you cannot change them.

# Rules
- Keep everything that loads or saves data, tracks analytics, logs in, submits forms or navigates exactly as it is: API/service calls, hooks like useSelector/useDispatch/useQuery, trackEvent, onSubmit handlers, form field names and validation. Move it around the layout if needed, but do not alter or remove it. The checker rejects your work if any of it changes.
- Keep SEO: leave <Helmet> titles and meta tags in place (you may improve the wording).
- Use only the Brand Kit colours and fonts via the CSS variables. No new colours or fonts. Existing old colours you don't touch are tolerated, but prefer replacing them with brand variables in what you redesign.
- CSS files are global on this site. Give every new class name a prefix unique to this page (for example "contact-" for Contact Us) so nothing else on the site changes.
- Only use packages already in package.json. No new dependencies.
- Make it responsive (works from 360px phones to wide desktops) and accessible (real headings, alt text on images, labels on inputs, good contrast).
- Remove imports you no longer use: unused imports break the live build.
- The site header and footer are added around the page automatically; don't add your own.
- Write real, on-brand copy in the Brand Kit tone. Never invent facts, numbers, prices, addresses or testimonials — keep the page's existing facts, or use clearly generic wording.

# How to work
1. Read the page's files (list_files on its folder, then read_file).
2. Make the changes with edit_file (small/medium changes) or write_file (new files or full rewrites).
3. Call finish with a short summary for the admin: 2–5 lines starting with "- ", in plain everyday words (no code, file names or jargon), describing what they will see differently.
If the checker reports problems, fix them and call finish again.`;
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

const isString = (v) => typeof v === "string";

/**
 * Runs one round of the design agent.
 * @param {object} opts
 * @param {string} opts.ref            branch to read from
 * @param {object} opts.page           { label, path }
 * @param {string[]} opts.editable     files / folders ("…/") the agent may change
 * @param {object} opts.kit            current Brand Kit
 * @param {string} opts.instruction    what the admin asked for this round
 * @param {Array<{instruction, summary}>} opts.history earlier rounds on this request
 * @param {string[]} [opts.mustCreate] files that must exist at the end (new pages)
 * @param {(msg: string) => void} [opts.log]
 * @returns {Promise<{ok: true, files, summary, usage} | {ok: false, error, usage}>}
 */
async function runDesignRound({ ref, page, editable, kit, instruction, history = [], mustCreate = [], log = () => {} }) {
  const anthropic = getClient();
  const repoFiles = new Set(await github.listFiles(ref));
  const pkg = JSON.parse((await github.readFile("package.json", ref)) || "{}");
  const packages = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})]);

  const staged = {}; // path → new content
  const originals = {}; // path → content before (null = new file)

  const canWrite = (p) => editable.some((e) => (e.endsWith("/") ? p.startsWith(e) : p === e));
  const fileExists = (p) => p in staged || repoFiles.has(p);
  const currentText = async (p) => {
    if (p in staged) return staged[p];
    if (!(p in originals)) originals[p] = repoFiles.has(p) ? await github.readFile(p, ref) : null;
    return originals[p];
  };
  const cleanPath = (p) => path.normalize(String(p).replace(/^\/+/, ""));

  const tools = {
    async list_files({ folder }) {
      const prefix = cleanPath(folder).replace(/\/?$/, "/");
      const inRepo = [...repoFiles].filter((p) => p.startsWith(prefix));
      const added = Object.keys(staged).filter((p) => p.startsWith(prefix) && !repoFiles.has(p));
      const all = [...inRepo, ...added].sort();
      if (!all.length) return `No files under ${prefix}`;
      return all.slice(0, 400).join("\n") + (all.length > 400 ? `\n…and ${all.length - 400} more` : "");
    },
    async read_file({ path: p }) {
      p = cleanPath(p);
      if (!READABLE.test(p)) throw new Error("You can only read files under src/, package.json and public/index.html");
      const text = await currentText(p);
      if (text === null || text === undefined) throw new Error(`${p} doesn't exist`);
      if (text.length > MAX_READ_CHARS) return `${text.slice(0, MAX_READ_CHARS)}\n…(cut off: file is ${text.length} characters)`;
      return text;
    },
    async edit_file({ path: p, old_text: oldText, new_text: newText }) {
      p = cleanPath(p);
      if (!canWrite(p)) throw new Error(`You're not allowed to change ${p}. You may change: ${editable.join(", ")}`);
      const text = await currentText(p);
      if (text === null) throw new Error(`${p} doesn't exist — use write_file to create it`);
      const count = text.split(oldText).length - 1;
      if (count === 0) throw new Error("old_text was not found. Read the file again and copy the text exactly.");
      if (count > 1) throw new Error(`old_text appears ${count} times. Include more surrounding text so it's unique.`);
      staged[p] = text.replace(oldText, () => newText);
      return `Edited ${p}`;
    },
    async write_file({ path: p, content }) {
      p = cleanPath(p);
      if (!canWrite(p)) throw new Error(`You're not allowed to change ${p}. You may change: ${editable.join(", ")}`);
      if (!/\.(jsx?|css|json|svg)$/.test(p)) throw new Error("Only .js, .jsx, .css, .json and .svg files can be written");
      await currentText(p); // remember the original before overwriting
      staged[p] = content;
      return `Wrote ${p}`;
    },
  };

  const finish = () => {
    const changed = Object.fromEntries(Object.entries(staged).filter(([p, t]) => t !== originals[p]));
    const problems = [];
    if (!Object.keys(changed).length) problems.push("You haven't changed anything yet.");
    for (const f of mustCreate) if (!fileExists(f)) problems.push(`${f} must exist — create it.`);
    problems.push(
      ...runChecks({ changed, originals, fileExists, isKnownPackage: (n) => packages.has(n), brandKit: kit })
    );
    return { changed, problems };
  };

  const historyText = history.length
    ? `Earlier rounds on this request (already applied to the files you'll read):\n${history
        .map((h, i) => `${i + 1}. Admin asked: ${h.instruction}\n   You did: ${h.summary || "(no summary)"}`)
        .join("\n")}\n\n`
    : "";
  const messages = [
    {
      role: "user",
      content: `${historyText}The admin's request${history.length ? " now" : ""}:\n${instruction}`,
    },
  ];
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 };
  const system = systemPrompt({ kit, page, editable });

  for (let step = 0; step < MAX_STEPS; step++) {
    if (usage.costUsd > MAX_COST_USD) {
      return { ok: false, usage, error: `Stopped: this change hit the $${MAX_COST_USD} cost limit for one round. Try asking for a smaller change.` };
    }
    const response = await anthropic.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 64000,
        betas: ["server-side-fallback-2026-07-01"],
        // If this model declines a request, the API retries it on a fallback model.
        fallbacks: "default",
        output_config: { effort: EFFORT },
        cache_control: { type: "ephemeral" },
        system,
        tools: TOOLS,
        messages,
      })
      .finalMessage();
    addUsage(usage, response.usage);
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "refusal") {
      return { ok: false, usage, error: "The AI declined this request. Try rewording it." };
    }
    if (response.stop_reason === "pause_turn") continue;

    const toolUses = response.content.filter((b) => b.type === "tool_use");
    if (!toolUses.length) {
      // Claude replied without a tool: nudge it to keep working or finish.
      messages.push({ role: "user", content: "Continue: make the changes with the tools, then call finish." });
      continue;
    }

    const results = [];
    let finished = null;
    for (const block of toolUses) {
      const input = block.input || {};
      // Inputs stream in as they're written, so a cut-off response can leave them incomplete.
      if (response.stop_reason === "max_tokens") {
        results.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: "Your response was cut off before this finished. Make smaller edits (use edit_file, or split large files)." });
        continue;
      }
      const schema = TOOLS.find((t) => t.name === block.name)?.input_schema;
      const valid = schema && schema.required.every((k) => isString(input[k]));
      if (!valid) {
        results.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: `Invalid input for ${block.name}` });
        continue;
      }
      if (block.name === "finish") {
        const { changed, problems } = finish();
        if (problems.length) {
          log(`checks found ${problems.length} problem(s)`);
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: `Not finished — fix these and call finish again:\n${problems.map((p) => `- ${p}`).join("\n")}`,
          });
        } else {
          finished = { changed, summary: input.summary.trim() };
          results.push({ type: "tool_result", tool_use_id: block.id, content: "Done." });
        }
        continue;
      }
      try {
        const out = await tools[block.name](input);
        if (block.name !== "read_file" && block.name !== "list_files") log(out);
        results.push({ type: "tool_result", tool_use_id: block.id, content: out });
      } catch (err) {
        // GitHub being unreachable isn't something Claude can fix: stop the round.
        if (err instanceof github.GithubError) throw err;
        results.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: err.message });
      }
    }
    messages.push({ role: "user", content: results });

    if (finished) return { ok: true, files: finished.changed, summary: finished.summary, usage };
  }

  return { ok: false, usage, error: "The AI took too many steps without finishing. Try asking for a smaller change." };
}

module.exports = { runDesignRound };
