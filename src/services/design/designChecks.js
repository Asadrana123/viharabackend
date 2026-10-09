// services/design/designChecks.js
//
// Checks the design agent's changes must pass before they're saved and a
// preview is built. Each returns a list of plain problems; the agent gets
// them back and fixes them itself.
//
//   1. Code is valid (JSX/JS parses)
//   2. Every import points at a file that exists or an installed package
//   3. No unused imports (the live build treats lint warnings as errors)
//   4. Only Brand Kit colours and fonts (old colours already in a file are tolerated)
//   5. Code that loads or saves data is kept exactly as it was
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
const OK_FONT_VALUE = /^(var\(--brand-font-(heading|body)\)|inherit|monospace|ui-monospace.*)$/i;

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
  const brandFonts = [brandKit.fonts.heading, brandKit.fonts.body].map((f) => f.toLowerCase());
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
    problems.add(`${file}: font "${value}" isn't in the Brand Kit — use var(--brand-font-heading) or var(--brand-font-body)`);
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

/**
 * Runs every check on the changed files.
 * @param {Object<string,string>} changed   path → new content
 * @param {Object<string,string|null>} originals path → content before (null = new file)
 * @param {(p:string)=>boolean} fileExists  whether a path exists after the change
 * @param {(name:string)=>boolean} [isKnownPackage] whether an npm package is installed
 * @returns {string[]} problems (empty = all good)
 */
function runChecks({ changed, originals, fileExists, isKnownPackage, brandKit }) {
  const problems = [];
  for (const [file, text] of Object.entries(changed)) {
    const original = originals[file] ?? null;
    problems.push(
      ...checkSyntax(file, text),
      ...checkImports(file, text, fileExists, isKnownPackage),
      ...checkUnusedImports(file, text),
      ...checkBrand(file, text, original, brandKit),
      ...checkDataActions(file, text, original)
    );
  }
  return problems;
}

module.exports = { runChecks };
