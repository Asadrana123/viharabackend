// services/design/pageDiscovery.js
//
// Finds every page on the website so admins can redesign any of them, and
// works out which files the design agent may change for each.
//
//   1. Read src/App.js: every <Route path element={<Component/>}> → page
//      (layouts, admin and wrapper routes are skipped)
//   2. Follow each page's imports to collect the files it uses
//   3. A page may change only the files that no other page, layout or the app
//      shell also uses — so redesigning one page can never change another.
//
// Pages made by the design agent (src/components/Designed/<slug>/) and landing
// pages made from a mockup (src/components/Landing/pages/<slug>/) are listed too.
// The result is cached per commit of the live branch.
const path = require("path").posix;
const { parse } = require("@babel/parser");
const github = require("./githubService");
const { PAGE_LABELS, SAMPLE_PATHS, isExcludedPath, groupFor, NEW_PAGE, NEW_LANDING_PAGE } = require("../../config/designPages");

const RESOLVE_EXT = ["", ".js", ".jsx", "/index.js", "/index.jsx"];
const STYLE_EXT = [".css"];
// Elements that wrap a page (auth guards, providers) rather than being one.
const WRAPPERS = new Set([
  "ProtectAdminRoute",
  "ProtectSellerRoute",
  "ProtectRealtorRoute",
  "RealtorAuthProvider",
  "Suspense",
  "Navigate",
  "RouteErrorBoundary",
]);
// Pages may only change files in here (never shared utils, api, styles…).
const EDITABLE_ROOT = "src/components/";
const RECHECK_MS = 60 * 1000;

let cache = { sha: null, pages: null, checkedAt: 0 };
let inflight = null;

const parseCode = (text) =>
  parse(text, {
    sourceType: "module",
    plugins: ["jsx", "classProperties", "optionalChaining", "nullishCoalescingOperator", "dynamicImport"],
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

// Relative import targets of a file: static imports, re-exports and import("...").
function importSources(text) {
  const sources = [];
  let ast;
  try {
    ast = parseCode(text);
  } catch {
    return sources;
  }
  walk(ast.program, (node) => {
    if ((node.type === "ImportDeclaration" || node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") && node.source) {
      sources.push(node.source.value);
    } else if (node.type === "CallExpression" && node.callee.type === "Import" && node.arguments[0]?.type === "StringLiteral") {
      sources.push(node.arguments[0].value);
    }
  });
  return sources.filter((s) => s.startsWith("."));
}

function resolver(fileSet) {
  return (from, source) => {
    const base = path.normalize(path.join(path.dirname(from), source));
    for (const ext of [...RESOLVE_EXT, ...STYLE_EXT]) if (fileSet.has(base + ext)) return base + ext;
    return null;
  };
}

const jsxName = (n) => (n.type === "JSXIdentifier" ? n.name : n.type === "JSXMemberExpression" ? `${jsxName(n.object)}.${n.property.name}` : "");

const attr = (el, name) => el.openingElement.attributes.find((a) => a.type === "JSXAttribute" && a.name?.name === name);

const attrString = (a) => {
  if (!a?.value) return null;
  if (a.value.type === "StringLiteral") return a.value.value;
  if (a.value.type === "JSXExpressionContainer" && a.value.expression.type === "StringLiteral") return a.value.expression.value;
  return null;
};

/**
 * Reads App.js: which component each name refers to, and every route.
 * @returns {{ components: Map<string,string>, routes: Array<{path, component, layout: boolean}> }}
 */
function readRoutes(appText) {
  const ast = parseCode(appText);
  const components = new Map(); // local name → import source
  walk(ast.program, (node) => {
    if (node.type === "ImportDeclaration") {
      node.specifiers.forEach((s) => s.type === "ImportDefaultSpecifier" && components.set(s.local.name, node.source.value));
    }
    // const X = lazy(() => import("./components/X")) / lazyWithRetry(...)
    if (node.type === "VariableDeclarator" && node.id.type === "Identifier" && node.init?.type === "CallExpression") {
      walk(node.init, (inner) => {
        if (inner.type === "CallExpression" && inner.callee.type === "Import" && inner.arguments[0]?.type === "StringLiteral") {
          components.set(node.id.name, inner.arguments[0].value);
        }
      });
    }
  });

  // The innermost known, non-wrapper component in a route's element.
  const pickComponent = (expr) => {
    const names = [];
    walk(expr, (n) => {
      if (n.type === "JSXElement") names.push(jsxName(n.openingElement.name));
    });
    return names.filter((n) => components.has(n) && !WRAPPERS.has(n)).pop() || null;
  };

  const routes = [];
  const visitRoute = (el, parentPath) => {
    const own = attrString(attr(el, "path"));
    const isIndex = Boolean(attr(el, "index"));
    let full = parentPath;
    if (own) full = own.startsWith("/") ? own : `${parentPath.replace(/\/$/, "")}/${own}`;
    if (isIndex) full = parentPath || "/";
    const children = el.children.filter((c) => c.type === "JSXElement" && jsxName(c.openingElement.name) === "Route");
    const element = attr(el, "element")?.value?.expression;
    const component = element ? pickComponent(element) : null;
    if (component) routes.push({ path: full || "/", component, layout: children.length > 0 });
    children.forEach((c) => visitRoute(c, full));
  };
  walk(ast.program, (node) => {
    if (node.type === "JSXElement" && jsxName(node.openingElement.name) === "Route") {
      visitRoute(node, "");
      return false; // visitRoute handles nested routes
    }
    return true;
  });
  return { components, routes };
}

const titleCase = (s) =>
  s
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

function labelFor(routePath) {
  if (PAGE_LABELS[routePath]) return PAGE_LABELS[routePath];
  if (routePath === "/") return "Home page";
  const parts = routePath.split("/").filter(Boolean).map((p) => (p.startsWith(":") ? `[${p.slice(1)}]` : titleCase(p)));
  return parts.join(" › ");
}

const previewPathFor = (routePath) => {
  if (SAMPLE_PATHS[routePath]) return SAMPLE_PATHS[routePath];
  if (routePath === "*") return "/this-page-does-not-exist";
  return routePath.replace(/:([a-zA-Z]+)/g, "example");
};

async function scan(sha) {
  const tree = await github.listTree(sha);
  const fileSet = new Set(tree.map((e) => e.path));
  const resolve = resolver(fileSet);
  const code = tree.filter((e) => e.path.startsWith("src/") && /\.jsx?$/.test(e.path) && !/\.test\.jsx?$/.test(e.path));

  const text = new Map();
  await pool(code, 8, async (e) => text.set(e.path, await github.readBlob(e.sha)));

  // Import graph (only files in the repo).
  const imports = new Map();
  for (const [file, src] of text) {
    imports.set(file, importSources(src).map((s) => resolve(file, s)).filter(Boolean));
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

  const appFile = "src/App.js";
  const { components, routes } = readRoutes(text.get(appFile) || "");

  // Owners: every routed component (pages, layouts, admin) and the app shell.
  const owners = new Map(); // file → Set(owner id)
  const own = (ownerId, files) => files.forEach((f) => (owners.get(f) || owners.set(f, new Set()).get(f)).add(ownerId));

  // The app shell: App.js / index.js and what they import directly, but not the
  // lazily-loaded pages (those are separate owners).
  const routeFiles = new Set();
  const pagesByFile = new Map();
  for (const r of routes) {
    const file = resolve(appFile, components.get(r.component));
    if (!file) continue;
    routeFiles.add(file);
    if (r.layout) continue;
    if (!pagesByFile.has(file)) pagesByFile.set(file, []);
    pagesByFile.get(file).push(r.path);
  }
  // App.js lazily imports every page; for ownership it only "uses" its static imports.
  imports.set(appFile, (imports.get(appFile) || []).filter((f) => !routeFiles.has(f)));
  const shellImports = ["src/index.js", appFile].flatMap((f) => {
    const src = text.get(f) || "";
    let ast;
    try {
      ast = parseCode(src);
    } catch {
      return [];
    }
    return ast.program.body
      .filter((n) => n.type === "ImportDeclaration" && n.source.value.startsWith("."))
      .map((n) => resolve(f, n.source.value))
      .filter((p) => p && !routeFiles.has(p));
  });
  shellImports.forEach((f) => own("shell", closure(f)));
  routeFiles.forEach((f) => own(f, closure(f)));

  // Agent-made pages under Designed/<slug>/index.jsx are pages of their own.
  const designed = tree
    .map((e) => e.path.match(/^src\/components\/Designed\/([a-z0-9-]{3,50})\/index\.jsx$/))
    .filter(Boolean);
  designed.forEach((m) => {
    pagesByFile.set(m[0], [NEW_PAGE.path(m[1])]);
    own(m[0], closure(m[0]));
  });
  const landing = tree
    .map((e) => e.path.match(/^src\/components\/Landing\/pages\/([a-z0-9-]{3,50})\/index\.jsx$/))
    .filter(Boolean);
  landing.forEach((m) => {
    pagesByFile.set(m[0], [NEW_LANDING_PAGE.path(m[1])]);
    own(m[0], closure(m[0]));
  });

  const pages = [];
  for (const [file, paths] of pagesByFile) {
    const visible = paths.filter((p) => !isExcludedPath(p));
    if (!visible.length) continue;
    // Its files (code and imported CSS) that nothing else uses.
    const editable = [...closure(file)].filter((f) => f.startsWith(EDITABLE_ROOT) && owners.get(f)?.size === 1).sort();
    if (!editable.includes(file)) continue; // the page file itself is shared: can't be redesigned safely
    const primary = visible[0];
    pages.push({
      key: primary,
      label: labelFor(primary),
      path: primary,
      allPaths: visible,
      previewPath: previewPathFor(primary),
      group: groupFor(primary),
      file,
      editable,
      newFilesIn: `${path.dirname(file)}/`,
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

module.exports = { discoverPages, findPage, readRoutes };
