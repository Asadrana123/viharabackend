// services/design/designChecks.js
//
// Checks the design agent's changes must pass before they're saved and a
// preview is built. Each returns a list of plain problems; the agent gets
// them back and fixes them itself.
//
//   1. Code is valid (JSX/JS parses)
//   2. Every import points at a file that exists or an installed package
//   3. No unused imports (the live build treats lint warnings as errors)
//   4. Only Brand Kit colours and fonts (old colours already in a file are tolerated);
//      for landing pages: only the colours, fonts and effects the Landing folder
//      already uses, so a page can be restructured but never re-themed
//   5. Code that loads or saves data is kept exactly as it was; for landing
//      pages: forms may change, but the save call, tracking, required
//      fields and consent wording stay (checkLandingDataActions)
const path = require("path").posix;
const { parse } = require("@babel/parser");

const CODE_EXT = /\.(jsx?|tsx?)$/;
const STYLE_EXT = /\.css$/;
const RESOLVE_EXT = ["", ".js", ".jsx", ".ts", ".tsx", ".css", "/index.js", "/index.jsx"];

// Colours always fine: pure white/black, and transparent black/white shadows & overlays.
const ALWAYS_OK_COLORS = new Set(["#fff", "#ffffff", "#000", "#000000", "transparent", "currentcolor", "inherit"]);
const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)/gi;
const SHADOW_RGBA = /^rgba\(\s*(0\s*,\s*0\s*,\s*0|255\s*,\s*255\s*,\s*255)\s*,\s*[\d.]+\s*\)$/i;
const FONT_DECL = /font-family\s*:\s*([^;}\n]+)/gi;
const FONT_JSX = /fontFamily\s*:\s*["'`]([^"'`]+)["'`]/g;
const OK_FONT_VALUE = /^(var\(--(brand-font-(display|heading|body)|v-font-(display|heading|body))\)|inherit|monospace|ui-monospace.*)$/i;

// Calls that load or save data, track analytics, or change app state/route. Redesigns must keep
// every one of them exactly (layout around them may change freely).
const DATA_CALLEE =
  /^(apiClient|axios|fetch|dispatch|navigate|useDispatch|useSelector|useQuery|useMutation|useMutationQuery|localStorage|sessionStorage|grecaptcha|trackEvent|fbq|gtag)\b|\.(mutate|mutateAsync|refetch)$|^(get|post|put|patch|delete|create|update|submit|send|save|fetch|load)[A-Z]\w*$/;
const DATA_IMPORT = /^[./]*(.*\/)?(api|services|features|store|context)\//;

const normalizeColor = (c) => c.toLowerCase().replace(/\s+/g, "");

function parseCode(file, text) {
  return parse(text, {
    sourceType: "module",
    plugins: ["jsx", "classProperties", "optionalChaining", "nullishCoalescingOperator", "dynamicImport"],
    errorRecovery: false,
  });
}

function checkSyntax(file, text) {
  if (CODE_EXT.test(file)) {
    try {
      parseCode(file, text);
    } catch (err) {
      return [`${file}: the code has a syntax error — ${err.message}`];
    }
  }
  if (STYLE_EXT.test(file)) {
    const stripped = text.replace(/\/\*[\s\S]*?\*\//g, "");
    const open = (stripped.match(/{/g) || []).length;
    const close = (stripped.match(/}/g) || []).length;
    if (open !== close) return [`${file}: the CSS has ${open} "{" but ${close} "}"`];
  }
  return [];
}

// Relative imports must resolve to a file in the repo (after this change).
function checkImports(file, text, fileExists, isKnownPackage) {
  if (!CODE_EXT.test(file)) {
    // CSS @import / url() to local files
    const problems = [];
    for (const m of text.matchAll(/(?:@import\s+["']|url\(\s*["']?)(\.{1,2}\/[^"')\s]+)/g)) {
      const target = path.normalize(path.join(path.dirname(file), m[1]));
      if (!fileExists(target)) problems.push(`${file}: "${m[1]}" doesn't exist`);
    }
    return problems;
  }
  let ast;
  try {
    ast = parseCode(file, text);
  } catch {
    return []; // reported by checkSyntax
  }
  const problems = [];
  for (const node of ast.program.body) {
    if (node.type !== "ImportDeclaration") continue;
    const source = node.source.value;
    if (!source.startsWith(".")) {
      // "@scope/pkg/sub" → "@scope/pkg", "pkg/sub" → "pkg"
      const pkg = source.split("/").slice(0, source.startsWith("@") ? 2 : 1).join("/");
      if (isKnownPackage && !isKnownPackage(pkg)) {
        problems.push(`${file}: "${pkg}" isn't installed on the site — use only existing packages`);
      }
      continue;
    }
    const base = path.normalize(path.join(path.dirname(file), source));
    if (!RESOLVE_EXT.some((ext) => fileExists(base + ext))) {
      problems.push(`${file}: imports "${source}", which doesn't exist`);
    }
  }
  return problems;
}

// An imported name that never appears again in the file is a lint warning,
// which fails the production build.
function checkUnusedImports(file, text) {
  if (!CODE_EXT.test(file)) return [];
  let ast;
  try {
    ast = parseCode(file, text);
  } catch {
    return [];
  }
  const problems = [];
  for (const node of ast.program.body) {
    if (node.type !== "ImportDeclaration") continue;
    for (const spec of node.specifiers) {
      const name = spec.local.name;
      if (name === "React") continue; // classic JSX runtime
      const rest = text.slice(0, node.start) + text.slice(node.end);
      if (!new RegExp(`\\b${name.replace(/\$/g, "\\$")}\\b`).test(rest)) {
        problems.push(`${file}: "${name}" is imported but never used — remove it`);
      }
    }
  }
  return problems;
}

/**
 * @param {string} file
 * @param {string} text      new content
 * @param {string|null} original  content before this change (null for a new file)
 * @param {object} brandKit  merged Brand Kit (colors, fonts)
 */
function checkBrand(file, text, original, brandKit) {
  if (!CODE_EXT.test(file) && !STYLE_EXT.test(file)) return [];
  const brandColors = new Set(Object.values(brandKit.colors).map(normalizeColor));
  const brandFonts = [brandKit.fonts.display, brandKit.fonts.heading, brandKit.fonts.body].filter(Boolean).map((f) => f.toLowerCase());
  const existing = new Set((original || "").match(COLOR_LITERAL)?.map(normalizeColor) || []);
  const existingFonts = new Set(
    [...(original || "").matchAll(FONT_DECL), ...(original || "").matchAll(FONT_JSX)].map((m) => m[1].trim().toLowerCase())
  );

  const problems = new Set();
  for (const raw of text.match(COLOR_LITERAL) || []) {
    const c = normalizeColor(raw);
    if (ALWAYS_OK_COLORS.has(c) || brandColors.has(c) || existing.has(c) || SHADOW_RGBA.test(c)) continue;
    problems.add(`${file}: colour ${raw} isn't in the Brand Kit — use a var(--brand-...) colour instead`);
  }
  for (const m of [...text.matchAll(FONT_DECL), ...text.matchAll(FONT_JSX)]) {
    const value = m[1].trim().replace(/\s*!important$/, "");
    const lower = value.toLowerCase();
    if (OK_FONT_VALUE.test(value) || existingFonts.has(lower)) continue;
    const first = lower.split(",")[0].replace(/["']/g, "").trim();
    if (brandFonts.includes(first)) continue;
    problems.add(`${file}: font "${value}" isn't in the Brand Kit — use var(--brand-font-display), var(--brand-font-heading) or var(--brand-font-body)`);
  }
  const originalText = original || "";
  // Current theme only: no new gradients, keyframe animations or blur effects.
  const fresh = (re) => (text.match(re) || []).filter((m) => !originalText.includes(m));
  if (fresh(/(?:linear|radial|conic|repeating-linear|repeating-radial|repeating-conic)-gradient\([^;}\n]*/g).length) {
    problems.add(`${file}: gradients aren't part of the site's theme — use a plain Brand Kit background (or the Hero's photo overlay)`);
  }
  if (fresh(/@keyframes\s+[\w-]+/g).length) {
    problems.add(`${file}: don't add new animations — use the design system's Reveal (fade-in / fade-up)`);
  }
  if (fresh(/backdrop-filter\s*:[^;}\n]*|filter\s*:\s*blur\([^;}\n]*/g).length) {
    problems.add(`${file}: blur effects aren't part of the site's theme`);
  }

  // Only regular Inter in weights 400–700 is loaded on the site.
  if (/font-style\s*:\s*italic|fontStyle\s*:\s*["'`]italic/.test(text) && !/font-style\s*:\s*italic|fontStyle\s*:\s*["'`]italic/.test(originalText)) {
    problems.add(`${file}: italics aren't loaded on this site — use colour (e.g. .v-text-gold) or weight for emphasis instead`);
  }
  for (const m of text.matchAll(/font-weight\s*:\s*(\d{3})|fontWeight\s*:\s*["'`]?(\d{3})/g)) {
    const w = Number(m[1] || m[2]);
    if ((w < 400 || w > 700) && !originalText.includes(m[0])) {
      problems.add(`${file}: font weight ${w} isn't loaded — use 400, 500, 600 or 700`);
    }
  }
  return [...problems];
}

/**
 * The landing pages' look, read from every stylesheet in the Landing folder.
 * @param {string[]} cssTexts
 * @returns {{ colors: Set<string>, fonts: Set<string>, corpus: string }}
 */
function buildLandingTheme(cssTexts) {
  const corpus = cssTexts.join("\n");
  return {
    colors: new Set((corpus.match(COLOR_LITERAL) || []).map(normalizeColor)),
    fonts: new Set([...corpus.matchAll(FONT_DECL)].map((m) => m[1].trim().replace(/\s*!important$/, "").toLowerCase())),
    corpus,
  };
}

// Landing pages keep their own theme (--bl-, --ln-, --nc-… tokens): nothing
// the Landing folder doesn't already use — colours, fonts, gradients,
// animations, blur, italics, weights.
function checkLandingTheme(file, text, original, theme) {
  if (!CODE_EXT.test(file) && !STYLE_EXT.test(file)) return [];
  const known = `${theme.corpus}\n${original || ""}`;
  const problems = new Set();
  for (const raw of text.match(COLOR_LITERAL) || []) {
    const c = normalizeColor(raw);
    if (ALWAYS_OK_COLORS.has(c) || theme.colors.has(c) || SHADOW_RGBA.test(c) || (original || "").includes(raw)) continue;
    problems.add(`${file}: colour ${raw} isn't part of the landing theme — use the theme's colour variables (e.g. var(--bl-ink), var(--ln-blue))`);
  }
  for (const m of [...text.matchAll(FONT_DECL), ...text.matchAll(FONT_JSX)]) {
    const value = m[1].trim().replace(/\s*!important$/, "");
    if (/^inherit$/i.test(value) || theme.fonts.has(value.toLowerCase())) continue;
    problems.add(`${file}: font "${value}" isn't part of the landing theme — use the theme's font variable (e.g. var(--bl-font)) or inherit`);
  }
  const fresh = (re) => (text.match(re) || []).filter((m) => !known.includes(m));
  if (fresh(/(?:linear|radial|conic|repeating-linear|repeating-radial|repeating-conic)-gradient\([^;}\n]*/g).length) {
    problems.add(`${file}: that gradient isn't part of the landing theme — use one the theme already has, or a plain theme background`);
  }
  if (fresh(/@keyframes\s+[\w-]+/g).length) {
    problems.add(`${file}: don't add new animations — reuse the theme's existing ones`);
  }
  if (fresh(/backdrop-filter\s*:[^;}\n]*|filter\s*:\s*blur\([^;}\n]*/g).length) {
    problems.add(`${file}: that blur effect isn't part of the landing theme`);
  }
  const italic = /font-style\s*:\s*italic|fontStyle\s*:\s*["'`]italic/;
  if (italic.test(text) && !italic.test(known)) {
    problems.add(`${file}: italics aren't part of the landing theme`);
  }
  for (const m of text.matchAll(/font-weight\s*:\s*(\d{3})|fontWeight\s*:\s*["'`]?(\d{3})/g)) {
    const w = Number(m[1] || m[2]);
    if (!new RegExp(`font-weight\\s*:\\s*${w}\\b`).test(known) && !known.includes(m[0])) {
      problems.add(`${file}: font weight ${w} isn't used by the landing theme — use one it already uses`);
    }
  }
  return [...problems];
}

const squash = (s) => s.replace(/\s+/g, " ").trim();

// Visits every AST node (Babel nodes are plain objects).
function walk(node, visit) {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end") continue;
    const child = node[key];
    if (Array.isArray(child)) child.forEach((c) => walk(c, visit));
    else if (child && typeof child.type === "string") walk(child, visit);
  }
}

// The data/auth/state "actions" in a file: data imports, data calls, form submits.
function dataActions(text) {
  const ast = parseCode("", text);
  const actions = [];
  for (const node of ast.program.body) {
    if (node.type === "ImportDeclaration" && DATA_IMPORT.test(node.source.value)) {
      const names = node.specifiers.map((s) => s.local.name).sort().join(", ");
      actions.push(`import { ${names} } from "${node.source.value}"`);
    }
  }
  walk(ast.program, (node) => {
    if (node.type === "CallExpression") {
      const callee = text.slice(node.callee.start, node.callee.end);
      if (DATA_CALLEE.test(callee)) actions.push(squash(text.slice(node.start, node.end)));
    } else if (node.type === "JSXAttribute" && node.name?.name === "onSubmit" && node.value) {
      actions.push(`onSubmit=${squash(text.slice(node.value.start, node.value.end))}`);
    }
  });
  return actions;
}

// Every data action in the original must still be in the new version, unchanged.
function checkDataActions(file, text, original) {
  if (!original || !CODE_EXT.test(file)) return [];
  let before;
  let after;
  try {
    before = dataActions(original);
    after = dataActions(text);
  } catch {
    return []; // syntax problems are reported by checkSyntax
  }
  const remaining = new Map();
  after.forEach((a) => remaining.set(a, (remaining.get(a) || 0) + 1));
  const missing = [];
  for (const a of before) {
    if (remaining.get(a)) remaining.set(a, remaining.get(a) - 1);
    else missing.push(a);
  }
  return missing.slice(0, 10).map(
    (a) => `${file}: this loads or saves data and must be kept exactly as it was: ${a.slice(0, 200)}`
  );
}

// ── Landing page forms ──────────────────────────────────────────────────────
// On landing pages the designer may change a form freely (questions, order,
// steps, labels), so the payload it sends may change. What stays locked:
//   • the call that saves the lead, the conversion/tracking calls (by event
//     name) and the thank-you navigation
//   • the contact, consent and tracking fields the lead's backend needs
//   • the consent wording, exactly
// Loading data for display (get…, useQuery) may be dropped with its section.
const LOCKED_CALL = /^(register|submit|send|save|create|post|update)[A-Z]\w*$|^fire\w*(Conversion|Conversions)$|^(trackEvent|gtag|fbq|navigate)$/;
const LOCKED_KEY =
  /^(full_?name|fullName|first_?name|firstName|last_?name|lastName|email|phone|consent|consentText|consentTimestamp|sms_?consent\w*|smsConsent\w*|timezone|event_?id|eventId|attribution|first_touch|last_touch|fbp|fbc|page_url|pageUrl|submitted_at|tier|buy_box|honeypot)$/;
const CONSENT_WORDING_KEY = /consent_?text/i;
const NAME_KEY = /^(full_?name|fullName|first_?name|firstName)$/;

const propKey = (p) => (p.key?.type === "Identifier" ? p.key.name : p.key?.type === "StringLiteral" ? p.key.value : null);

// Locked call signatures and the lead payloads (objects with an email and a name or phone).
function formFacts(text) {
  const ast = parseCode("", text);
  const calls = new Set();
  const payloads = [];
  const objects = []; // every object with a few fields: where a changed payload is looked for
  const consts = {}; // const NAME = … → its value (for consent wording kept in a constant)
  let submits = 0;
  walk(ast.program, (node) => {
    if (node.type === "VariableDeclarator" && node.id.type === "Identifier" && node.init) {
      consts[node.id.name] = squash(text.slice(node.init.start, node.init.end));
    } else if (node.type === "CallExpression") {
      const callee = text.slice(node.callee.start, node.callee.end);
      if (!LOCKED_CALL.test(callee)) return;
      const first = node.arguments[0];
      // Tracking and navigation are locked per event name / address; saves by function.
      const withArg = /^(trackEvent|gtag|fbq|navigate)$/.test(callee) && first && /Literal$/.test(first.type);
      calls.add(withArg ? `${callee}(${squash(text.slice(first.start, first.end))})` : callee);
    } else if (node.type === "JSXAttribute" && node.name?.name === "onSubmit") {
      submits += 1;
    } else if (node.type === "ObjectExpression") {
      const props = node.properties.filter((p) => p.type === "ObjectProperty");
      const keys = props.map(propKey).filter(Boolean);
      const fields = () =>
        Object.fromEntries(props.filter((p) => propKey(p)).map((p) => [propKey(p), squash(text.slice(p.value.start, p.value.end))]));
      if (keys.length >= 3) objects.push(fields());
      if (keys.includes("email") && keys.some((k) => k === "phone" || NAME_KEY.test(k))) {
        payloads.push(fields());
      }
    }
  });
  return { calls, payloads, objects, consts, submits };
}

// The new payload that shares the most fields with an old one (the same form's).
const closestPayload = (payload, candidates) => {
  const keys = Object.keys(payload);
  let best = null;
  let bestShared = 0;
  for (const c of candidates) {
    const shared = keys.filter((k) => k in c).length;
    if (shared > bestShared) [best, bestShared] = [c, shared];
  }
  return best || {};
};

function checkLandingDataActions(file, text, original) {
  if (!CODE_EXT.test(file)) return [];
  let after;
  try {
    after = formFacts(text);
  } catch {
    return []; // syntax problems are reported by checkSyntax
  }
  // New landing pages: a form must send the contact and consent fields.
  if (!original) {
    if (!after.calls.has("submitLandingForm")) return [];
    const keys = new Set(after.payloads.flatMap((p) => Object.keys(p)));
    const missing = ["fullName", "email", "phone", "consent", "consentText", "eventId"].filter((k) => !keys.has(k));
    return missing.length ? [`${file}: the form's submitLandingForm payload must include ${missing.join(", ")}`] : [];
  }
  let before;
  try {
    before = formFacts(original);
  } catch {
    return [];
  }
  const problems = [];
  for (const call of before.calls) {
    if (!after.calls.has(call)) problems.push(`${file}: keep this call — it saves the lead or tracks a conversion: ${call.slice(0, 120)}`);
  }
  if (before.submits && !after.submits) problems.push(`${file}: the form must still have its onSubmit handler`);
  for (const payload of before.payloads) {
    const now = closestPayload(payload, after.objects);
    for (const [key, value] of Object.entries(payload)) {
      if (!LOCKED_KEY.test(key)) continue;
      if (!(key in now)) {
        problems.push(`${file}: the form must still send "${key}" — the lead's backend needs it`);
      } else if (CONSENT_WORDING_KEY.test(key)) {
        // Same expression, and if it names a constant here, the same constant text.
        const name = value.match(/^(?:\w+\s*\?\s*)?([A-Z][A-Z0-9_]*)(?:\s*:\s*\S+)?$/)?.[1];
        const changedConst = name && name in before.consts && before.consts[name] !== after.consts[name];
        if (now[key] !== value || changedConst) {
          problems.push(`${file}: keep the consent wording exactly as it was ("${key}: ${value.slice(0, 80)}")`);
        }
      }
    }
  }
  return [...new Set(problems)].slice(0, 10);
}

/**
 * Runs every check on the changed files.
 * @param {Object<string,string>} changed   path → new content
 * @param {Object<string,string|null>} originals path → content before (null = new file)
 * @param {(p:string)=>boolean} fileExists  whether a path exists after the change
 * @param {(name:string)=>boolean} [isKnownPackage] whether an npm package is installed
 * @param {object} [landingTheme]  from buildLandingTheme: check against it instead of the Brand Kit
 * @returns {string[]} problems (empty = all good)
 */
function runChecks({ changed, originals, fileExists, isKnownPackage, brandKit, landingTheme }) {
  const problems = [];
  for (const [file, text] of Object.entries(changed)) {
    const original = originals[file] ?? null;
    problems.push(
      ...checkSyntax(file, text),
      ...checkImports(file, text, fileExists, isKnownPackage),
      ...checkUnusedImports(file, text),
      ...(landingTheme ? checkLandingTheme(file, text, original, landingTheme) : checkBrand(file, text, original, brandKit)),
      ...(landingTheme ? checkLandingDataActions(file, text, original) : checkDataActions(file, text, original))
    );
  }
  return problems;
}

module.exports = { runChecks, buildLandingTheme };
