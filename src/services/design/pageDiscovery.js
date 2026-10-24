// services/design/pageDiscovery.js
//
// Finds every page on the website (the Next.js app, vihara-next) so admins can
// redesign any of them, and works out which files the design agent may change
// for each.
//
//   1. Every app/**/page.tsx is a page; its address comes from its folders
//      (route groups like (marketing) dropped, [slug] → :slug). app/not-found.tsx
//      is the 404 page.
//   2. Follow each page's imports (relative and "@/…") to collect the files it uses.
//   3. A page may change only files under components/ that no other page,
//      layout or the app shell also uses — so redesigning one page can never
//      change another (a page and its /thank-you page count as one). Its "main" file is the first such component page.tsx
//      imports; new files go in that file's folder.
//
// Pages made by the design agent (/p/<slug>) and landing pages made from a
// mockup (/lp/<slug>) are ordinary routes, so they're found the same way.
// The result is cached per commit of the live branch.
const path = require("path").posix;
const { parse } = require("@babel/parser");
const github = require("./githubService");
const { PAGE_LABELS, SAMPLE_PATHS, isExcludedPath, groupFor } = require("../../config/designPages");

const RESOLVE_EXT = ["", ".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts", "/index.jsx", "/index.js"];
const STYLE_EXT = [".css"];
// Folders with code that pages import.
const CODE_ROOTS = /^(app|components|lib|context|hooks|types)\//;
// Pages may only change files in here (never shared lib, api, hooks…).
const EDITABLE_ROOT = "components/";
// Route files that wrap pages (shared by every page under them).
const SHELL_FILE = /^app\/(?:.*\/)?(layout|template|error|global-error|loading|default)\.(tsx|ts|jsx|js)$/;
const PAGE_FILE = /^app\/(?:(.*)\/)?page\.(tsx|ts|jsx|js)$/;
const RECHECK_MS = 60 * 1000;

let cache = { sha: null, pages: null, checkedAt: 0 };
let inflight = null;

const parseCode = (file, text) =>
  parse(text, {
    sourceType: "module",
    plugins: /\.ts$/.test(file) ? ["typescript"] : ["typescript", "jsx"],
    errorRecovery: true,
  });

// Runs `fn` over `items` with at most `limit` at once.
async function pool(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

function walk(node, visit) {
  if (!node || typeof node.type !== "string") return;
  if (visit(node) === false) return;
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end" || key === "leadingComments" || key === "trailingComments") continue;
    const child = node[key];
    if (Array.isArray(child)) child.forEach((c) => walk(c, visit));
    else if (child && typeof child.type === "string") walk(child, visit);
  }
}

// In-repo import targets of a file: static imports, re-exports and import("...").
// Type-only imports don't make a file part of the page.
function importSources(file, text) {
  const sources = [];
  let ast;
  try {
    ast = parseCode(file, text);
  } catch {
    return sources;
  }
  walk(ast.program, (node) => {
    if ((node.type === "ImportDeclaration" || node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") && node.source) {
      if (node.importKind !== "type" && node.exportKind !== "type") sources.push(node.source.value);
    } else if (node.type === "CallExpression" && node.callee.type === "Import" && node.arguments[0]?.type === "StringLiteral") {
      sources.push(node.arguments[0].value);
    }
  });
  return sources.filter((s) => s.startsWith(".") || s.startsWith("@/"));
}

// "@/components/x" → "components/x" (tsconfig paths: "@/*" → "./*").
function resolver(fileSet) {
  return (from, source) => {
    const base = source.startsWith("@/")
      ? path.normalize(source.slice(2))
      : path.normalize(path.join(path.dirname(from), source));
    for (const ext of [...RESOLVE_EXT, ...STYLE_EXT]) if (fileSet.has(base + ext)) return base + ext;
    return null;
  };
}

/** app/(marketing)/auction/[slug]/page.tsx → "/auction/:slug" */
function routePathOf(dir) {
  const parts = (dir || "")
    .split("/")
    .filter(Boolean)
    .filter((seg) => !/^\(.*\)$/.test(seg)) // route groups
    .map((seg) => {
      const catchAll = seg.match(/^\[\[?\.\.\.(\w+)\]\]?$/);
      if (catchAll) return `:${catchAll[1]}*`;
      const dyn = seg.match(/^\[(\w+)\]$/);
      return dyn ? `:${dyn[1]}` : seg;
    });
  return `/${parts.join("/")}`;
}

// Parallel (@x) and private (_x) folders aren't addresses.
const isRoutable = (dir) => !(dir || "").split("/").some((seg) => seg.startsWith("@") || seg.startsWith("_"));

const titleCase = (s) =>
  s
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

function labelFor(routePath) {
  if (PAGE_LABELS[routePath]) return PAGE_LABELS[routePath];
  if (routePath === "/") return "Home page";
  const parts = routePath.split("/").filter(Boolean).map((p) => (p.startsWith(":") ? `[${p.slice(1).replace(/\*$/, "")}]` : titleCase(p)));
  return parts.join(" › ");
}

const previewPathFor = (routePath) => {
  if (SAMPLE_PATHS[routePath]) return SAMPLE_PATHS[routePath];
  if (routePath === "*") return "/this-page-does-not-exist";
  return routePath.replace(/:([a-zA-Z]+)\*?/g, "example");
};

async function scan(sha) {
  const tree = await github.listTree(sha);
  const fileSet = new Set(tree.map((e) => e.path));
  const resolve = resolver(fileSet);
  const code = tree.filter(
    (e) => CODE_ROOTS.test(e.path) && /\.(tsx?|jsx?)$/.test(e.path) && !/\.d\.ts$/.test(e.path) && !/\.test\.(tsx?|jsx?)$/.test(e.path)
  );

  const text = new Map();
  await pool(code, 8, async (e) => text.set(e.path, await github.readBlob(e.sha)));

  // Import graph (only files in the repo).
  const imports = new Map();
  for (const [file, src] of text) {
    imports.set(file, importSources(file, src).map((s) => resolve(file, s)).filter(Boolean));
  }
  const closure = (start) => {
    const seen = new Set();
    const stack = [start];
    while (stack.length) {
      const f = stack.pop();
      if (seen.has(f)) continue;
      seen.add(f);
      (imports.get(f) || []).forEach((g) => stack.push(g));
    }
    return seen;
  };

  // Owners: every page, every layout / error / loading file, and middleware.
  const owners = new Map(); // file → Set(owner id)
  const own = (ownerId, files) => files.forEach((f) => (owners.get(f) || owners.set(f, new Set()).get(f)).add(ownerId));

  for (const file of text.keys()) {
    if (SHELL_FILE.test(file)) own(file, closure(file));
  }
  ["middleware.ts", "middleware.js"].forEach((f) => text.has(f) && own(f, closure(f)));

  const pagesByFile = new Map(); // route file → address
  for (const file of text.keys()) {
    const m = file.match(PAGE_FILE);
    if (!m || !isRoutable(m[1])) continue;
    pagesByFile.set(file, routePathOf(m[1]));
  }
  ["app/not-found.tsx", "app/not-found.jsx"].forEach((f) => text.has(f) && pagesByFile.set(f, "*"));
  // A page and its thank-you page are one funnel (the thank-you page reads a
  // constant from the page), so files only they use belong to both.
  const familyOf = (routePath) => routePath.replace(/\/thank-you$/, "");
  pagesByFile.forEach((routePath, file) => own(`page:${familyOf(routePath)}`, closure(file)));

  const pages = [];
  for (const [file, routePath] of pagesByFile) {
    if (isExcludedPath(routePath)) continue;
    // Its files (code and imported CSS) that nothing else uses.
    const editable = [...closure(file)].filter((f) => f.startsWith(EDITABLE_ROOT) && owners.get(f)?.size === 1).sort();
    // The component the route renders: the first page-only component it imports.
    const main = (imports.get(file) || []).find((f) => editable.includes(f) && /\.(tsx|jsx)$/.test(f));
    if (!main) continue; // everything it shows is shared: can't be redesigned safely
    pages.push({
      key: routePath,
      label: labelFor(routePath),
      path: routePath,
      allPaths: [routePath],
      previewPath: previewPathFor(routePath),
      group: groupFor(routePath),
      route: file,
      file: main,
      editable,
      newFilesIn: `${path.dirname(main)}/`,
    });
  }
  pages.sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
  return pages;
}

/**
 * Every redesignable page at the live branch's current commit.
 * Cached; rescans only when the live branch has a new commit.
 */
async function discoverPages() {
  if (cache.pages && Date.now() - cache.checkedAt < RECHECK_MS) return cache.pages;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const sha = await github.branchSha(github.baseBranch());
      if (sha !== cache.sha || !cache.pages) {
        const started = Date.now();
        const pages = await scan(sha);
        console.log(`[design] found ${pages.length} redesignable pages at ${sha.slice(0, 7)} in ${Date.now() - started}ms`);
        cache = { sha, pages, checkedAt: Date.now() };
      } else {
        cache.checkedAt = Date.now();
      }
      return cache.pages;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

async function findPage(key) {
  return (await discoverPages()).find((p) => p.key === key) || null;
}

module.exports = { discoverPages, findPage, routePathOf, scan };
