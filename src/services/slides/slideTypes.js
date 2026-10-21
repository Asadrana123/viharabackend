// services/slides/slideTypes.js
//
// Every kind of slide the agent can make. Each drawn type has one layout()
// that returns the elements to put on the slide (cards, badges, text...).
// The same layout is used to draw the slide AND to check that every text fits
// its box before anything is built, so the two can never disagree.
//
// Template types (cover, section, closing, bullets) fill the Vihara template's
// placeholders instead; they're checked with simple character limits.
const { ICON_SET } = require("../../config/slideIcons");
const { GRID, TYPE, fit } = require("./slideDesign");

const { margin: M, gap: G, contentTop: TOP, contentWidth: CW, contentHeight: CH } = GRID;

// Even columns across the content area.
const columns = (n, width = CW, x0 = M, gap = G) => {
  const w = (width - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (w + gap), w }));
};

// ── Drawn types ─────────────────────────────────────────────────────────────

const iconCards = (s) => {
  const ops = [];
  const n = s.items.length;
  if (n === 4) {
    // 2 × 2: wide cards with the icon beside the words, so headings stay on one line.
    const [L, R] = columns(2);
    const h = (CH - G) / 2;
    s.items.forEach((it, i) => {
      const { x, w } = i % 2 ? R : L;
      const y = TOP + Math.floor(i / 2) * (h + G);
      ops.push({ op: "shape", type: "ROUND_RECTANGLE", x, y, w, h, fill: "surface", outline: "border" });
      ops.push({ op: "badge", icon: it.icon, x: x + 0.3, y: y + (h - 0.72) / 2, d: 0.72 });
      ops.push({ op: "text", x: x + 1.2, y: y + 0.2, w: w - 1.4, h: 0.46, text: it.heading, size: TYPE.cardTitle, weight: 600, color: "heading", valign: "BOTTOM", label: `card ${i + 1} heading` });
      ops.push({ op: "text", x: x + 1.2, y: y + 0.66, w: w - 1.4, h: h - 0.8, text: it.text, size: TYPE.body, color: "text", lineSpacing: 105, label: `card ${i + 1} text` });
    });
    return ops;
  }
  columns(n).forEach(({ x, w }, i) => {
    const it = s.items[i];
    ops.push({ op: "shape", type: "ROUND_RECTANGLE", x, y: TOP, w, h: CH, fill: "surface", outline: "border" });
    ops.push({ op: "badge", icon: it.icon, x: x + 0.3, y: TOP + 0.35, d: 0.8 });
    ops.push({ op: "text", x: x + 0.2, y: TOP + 1.35, w: w - 0.4, h: 0.82, text: it.heading, size: 16, weight: 600, color: "heading", label: `card ${i + 1} heading` });
    ops.push({ op: "text", x: x + 0.2, y: TOP + 2.17, w: w - 0.4, h: CH - 2.3, text: it.text, size: 13, color: "text", lineSpacing: 110, label: `card ${i + 1} text` });
  });
  return ops;
};

const process = (s) => {
  const ops = [];
  const cols = columns(s.items.length, CW, M, 0.2);
  const d = 0.9;
  const cy = TOP + 0.25; // a little lower, so the block sits near the middle
  const first = cols[0].x + cols[0].w / 2;
  const last = cols[cols.length - 1].x + cols[cols.length - 1].w / 2;
  ops.push({ op: "shape", type: "RECTANGLE", x: first, y: cy + d / 2 - 0.02, w: last - first, h: 0.04, fill: "primarySoftStrong" });
  cols.forEach(({ x, w }, i) => {
    const it = s.items[i];
    const cx = x + w / 2;
    ops.push({ op: "badge", icon: it.icon, x: cx - d / 2, y: cy, d, fill: "primary", color: "white" });
    ops.push({ op: "text", x, y: cy + d + 0.2, w, h: 0.32, text: `STEP ${i + 1}`, size: TYPE.label, weight: 700, color: "primary", align: "CENTER" });
    ops.push({ op: "text", x, y: cy + d + 0.5, w, h: 0.66, text: it.heading, size: 14, weight: 600, color: "heading", align: "CENTER", label: `step ${i + 1} heading` });
    ops.push({ op: "text", x, y: cy + d + 1.16, w, h: GRID.contentBottom - (cy + d + 1.16), text: it.text, size: TYPE.small, color: "text", align: "CENTER", lineSpacing: 110, label: `step ${i + 1} text` });
  });
  return ops;
};

const comparison = (s) => {
  const ops = [];
  const [L, R] = columns(2);
  const side = (col, data, good, name) => {
    ops.push({ op: "shape", type: "ROUND_RECTANGLE", x: col.x, y: TOP, w: col.w, h: CH, fill: good ? "primarySoft" : "surface", outline: good ? null : "border" });
    ops.push({ op: "badge", icon: good ? "check-circle" : "x-circle", x: col.x + 0.3, y: TOP + 0.28, d: 0.5, fill: good ? "primary" : "border", color: good ? "white" : "muted", scale: 0.6 });
    ops.push({ op: "text", x: col.x + 0.9, y: TOP + 0.26, w: col.w - 1.1, h: 0.54, text: data.label, size: 16, weight: 700, color: good ? "primary" : "heading", valign: "MIDDLE", label: `${name} label` });
    const rowH = (CH - 1.15) / Math.max(3, data.points.length);
    data.points.forEach((p, j) => {
      const y = TOP + 1.05 + j * rowH;
      ops.push({ op: "icon", name: good ? "check" : "minus", x: col.x + 0.38, y: y + 0.07, s: 0.26, color: good ? "primary" : "muted" });
      ops.push({ op: "text", x: col.x + 0.8, y, w: col.w - 1.0, h: rowH, text: p, size: TYPE.body, color: good ? "heading" : "text", lineSpacing: 105, label: `${name} point ${j + 1}` });
    });
  };
  side(L, s.left, false, "left");
  side(R, s.right, true, "right");
  return ops;
};

const stats = (s) => {
  const ops = [];
  const h = CH - 0.2;
  columns(s.items.length).forEach(({ x, w }, i) => {
    const it = s.items[i];
    ops.push({ op: "shape", type: "ROUND_RECTANGLE", x, y: TOP + 0.1, w, h, fill: "surface", outline: "border" });
    ops.push({ op: "badge", icon: it.icon, x: x + (w - 0.7) / 2, y: TOP + 0.4, d: 0.7 });
    ops.push({ op: "text", x: x + 0.1, y: TOP + 1.25, w: w - 0.2, h: 0.85, text: it.value, size: TYPE.stat, weight: 700, color: "primary", align: "CENTER", valign: "MIDDLE", label: `stat ${i + 1} value` });
    ops.push({ op: "text", x: x + 0.2, y: TOP + 2.15, w: w - 0.4, h: h - 2.15, text: it.text, size: TYPE.body, color: "text", align: "CENTER", lineSpacing: 110, label: `stat ${i + 1} label` });
  });
  return ops;
};

const timeline = (s) => {
  const ops = [];
  const cols = columns(s.items.length, CW, M, 0.15);
  const lineY = TOP + 1.2;
  ops.push({ op: "shape", type: "RECTANGLE", x: M, y: lineY - 0.02, w: CW, h: 0.04, fill: "primarySoftStrong" });
  cols.forEach(({ x, w }, i) => {
    const it = s.items[i];
    const cx = x + w / 2;
    ops.push({ op: "text", x, y: lineY - 0.8, w, h: 0.5, text: it.value, size: 15, weight: 700, color: "primary", align: "CENTER", valign: "BOTTOM", label: `milestone ${i + 1} date` });
    ops.push({ op: "shape", type: "ELLIPSE", x: cx - 0.16, y: lineY - 0.16, w: 0.32, h: 0.32, fill: "primary", outline: "white" });
    ops.push({ op: "text", x, y: lineY + 0.35, w, h: 0.66, text: it.heading, size: 13.5, weight: 600, color: "heading", align: "CENTER", label: `milestone ${i + 1} heading` });
    ops.push({ op: "text", x, y: lineY + 1.01, w, h: GRID.contentBottom - (lineY + 1.01), text: it.text, size: TYPE.small, color: "text", align: "CENTER", lineSpacing: 110, label: `milestone ${i + 1} text` });
  });
  return ops;
};

const iconList = (s) => {
  const ops = [];
  const n = s.items.length;
  const rowH = CH / n;
  const d = Math.min(0.62, rowH - 0.12);
  s.items.forEach((it, i) => {
    const y = TOP + i * rowH;
    ops.push({ op: "badge", icon: it.icon, x: M, y: y + (rowH - d) / 2, d });
    ops.push({
      op: "text",
      x: M + d + 0.25,
      y,
      w: CW - d - 0.25,
      h: rowH,
      runs: [
        { text: it.heading, size: 14.5, weight: 600, color: "heading" },
        { text: it.text, size: TYPE.body, color: "text" },
      ],
      valign: "MIDDLE",
      lineSpacing: 105,
      label: `row ${i + 1}`,
    });
  });
  return ops;
};

const keyMessage = (s) => {
  const ops = [];
  ops.push({ op: "shape", type: "ROUND_RECTANGLE", x: M, y: TOP, w: CW, h: CH, fill: "primarySoft" });
  ops.push({ op: "badge", icon: s.icon, x: M + 0.5, y: TOP + (CH - 1.5) / 2, d: 1.5, fill: "primary", color: "white" });
  ops.push({ op: "text", x: M + 2.35, y: TOP + 0.35, w: CW - 2.75, h: 1.75, text: s.statement, size: TYPE.statement, weight: 700, color: "heading", valign: "BOTTOM", lineSpacing: 100, label: "statement" });
  ops.push({ op: "text", x: M + 2.35, y: TOP + 2.2, w: CW - 2.75, h: CH - 2.5, text: s.text, size: 14, color: "text", lineSpacing: 110, label: "supporting text" });
  return ops;
};

const chart = (s) => {
  const ops = [];
  const values = s.items.map((it) => parseNumber(it.value));
  const max = Math.max(...values, 0) || 1;
  const areaW = 5.75;
  const labelW = 1.6;
  const valueW = 0.95;
  const barMax = areaW - labelW - valueW - 0.1;
  const rowH = Math.min(0.62, CH / s.items.length);
  const y0 = TOP + (CH - rowH * s.items.length) / 2;
  s.items.forEach((it, i) => {
    const y = y0 + i * rowH;
    const top = values[i] === max;
    const bw = Math.max(0.08, (values[i] / max) * barMax);
    ops.push({ op: "text", x: M, y, w: labelW, h: rowH, text: it.heading, size: TYPE.small, weight: 600, color: "heading", align: "END", valign: "MIDDLE", label: `bar ${i + 1} label` });
    ops.push({ op: "shape", type: "RECTANGLE", x: M + labelW + 0.1, y: y + rowH * 0.2, w: bw, h: rowH * 0.6, fill: top ? "primary" : "primaryMid" });
    ops.push({ op: "text", x: M + labelW + 0.15 + bw, y, w: valueW, h: rowH, text: `${it.value}${s.unit || ""}`, size: TYPE.small, weight: 700, color: top ? "primary" : "text", valign: "MIDDLE", label: `bar ${i + 1} value` });
  });
  const ix = M + areaW + 0.35;
  const iw = M + CW - ix;
  ops.push({ op: "shape", type: "ROUND_RECTANGLE", x: ix, y: TOP, w: iw, h: CH, fill: "primarySoft" });
  ops.push({ op: "badge", icon: "lightbulb", x: ix + 0.3, y: TOP + 0.3, d: 0.6, fill: "primary", color: "white" });
  ops.push({ op: "text", x: ix + 0.2, y: TOP + 1.1, w: iw - 0.4, h: CH - 1.3, text: s.text, size: 14, weight: 600, color: "heading", lineSpacing: 110, label: "insight" });
  return ops;
};

const explainer = (s) => {
  const ops = [];
  const lw = 4.4;
  ops.push({ op: "text", x: M, y: TOP, w: lw, h: CH, text: s.body, size: 14, color: "text", lineSpacing: 115, label: "body" });
  const px = M + lw + 0.3;
  const pw = M + CW - px;
  ops.push({ op: "shape", type: "ROUND_RECTANGLE", x: px, y: TOP, w: pw, h: CH, fill: "primarySoft" });
  ops.push({ op: "badge", icon: s.icon, x: px + (pw - 1.0) / 2, y: TOP + 0.45, d: 1.0, fill: "primary", color: "white" });
  ops.push({ op: "text", x: px + 0.3, y: TOP + 1.65, w: pw - 0.6, h: CH - 1.9, text: s.callout, size: 19, weight: 700, color: "primary", align: "CENTER", label: "callout" });
  return ops;
};

function parseNumber(v) {
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

// ── Catalogue ───────────────────────────────────────────────────────────────
// `use` and the field notes are what Claude reads when choosing a type.
// items: { min, max, fields } — the item fields each type reads.

const TYPES = {
  cover: {
    template: "VIHARA_TITLE",
    use: "First slide only.",
    limits: { title: 50, subtitle: 120 },
    overlay: (s) => [
      { op: "text", x: M, y: 1.35, w: 5.9, h: 2.05, text: s.title, size: 40, weight: 700, color: "heading", valign: "BOTTOM", lineSpacing: 100, label: "title" },
      { op: "text", x: M, y: 3.5, w: 5.6, h: 0.95, text: s.subtitle, size: 16, color: "muted", lineSpacing: 110, label: "subtitle" },
    ],
  },
  section: {
    template: "VIHARA_SECTION",
    use: "Opens a part of the deck (decks of 8+ slides). number is two digits; optional icon shown large on the right.",
    limits: { number: 2, title: 50 },
    optionalIcon: true,
    // Drawn on top of the template's blue background, so the title can make room for the icon.
    overlay: (s) => {
      const w = s.icon ? 5.9 : CW;
      return [
        { op: "text", x: M, y: 1.45, w: 3, h: 1.15, text: s.number, size: 60, weight: 700, color: "primarySoft", valign: "BOTTOM", label: "number" },
        { op: "text", x: M, y: 2.7, w, h: 1.8, text: s.title, size: 36, weight: 700, color: "white", lineSpacing: 100, label: "title" },
        ...(s.icon ? [{ op: "badge", icon: s.icon, x: 6.85, y: 1.55, d: 2.4, fill: "primaryDark", color: "white", scale: 0.48 }] : []),
      ];
    },
  },
  closing: {
    template: "VIHARA_CLOSING",
    use: "Last slide only: thank-you or call to action.",
    limits: { title: 50, subtitle: 120 },
    overlay: (s) => [
      { op: "text", x: M, y: 1.45, w: CW, h: 1.9, text: s.title, size: 40, weight: 700, color: "white", valign: "BOTTOM", lineSpacing: 100, label: "title" },
      { op: "text", x: M, y: 3.45, w: 7.5, h: 0.95, text: s.subtitle, size: 16, color: "primarySoft", lineSpacing: 110, label: "subtitle" },
    ],
  },
  bullets: {
    template: "VIHARA_CONTENT",
    use: "Plain bullet points. Last resort: only when nothing visual fits.",
    limits: { title: 42 },
    bullets: { min: 2, max: 5, chars: 110 },
  },

  icon_cards: { layout: iconCards, use: "2-4 parallel ideas (features, benefits, pillars), each with an icon.", items: { min: 2, max: 4, fields: ["icon", "heading", "text"] } },
  process: { layout: process, use: "3-5 steps in order (how it works, onboarding, a workflow).", items: { min: 3, max: 5, fields: ["icon", "heading", "text"] } },
  comparison: { layout: comparison, use: "Two sides: before vs after, old way vs Vihara, problem vs solution. left is the worse side, right the better side.", sides: { min: 2, max: 4 } },
  stats: { layout: stats, use: "2-4 real numbers from the notes, each with an icon. value is the number with its unit (e.g. \"3x\", \"48h\", \"$2M\").", items: { min: 2, max: 4, fields: ["icon", "value", "text"] } },
  timeline: { layout: timeline, use: "3-6 dated milestones or a roadmap. value is the date or phase (e.g. \"Q1 2026\", \"Week 1\").", items: { min: 3, max: 6, fields: ["value", "heading", "text"] } },
  icon_list: { layout: iconList, use: "3-5 points that each need a sentence, shown as rows with icons. heading ≤ 40 chars, text ≤ 100 chars.", items: { min: 3, max: 5, fields: ["icon", "heading", "text"] } },
  key_message: { layout: keyMessage, use: "One big statement the audience must remember, plus a supporting line. Use for the core idea, a mission, or a strong claim from the notes.", needsIcon: true, fields: ["statement", "text"] },
  chart: { layout: chart, use: "2-6 numbers from the notes compared as bars. value is a plain number; unit (optional) is added after each value; text is the one-line takeaway.", items: { min: 2, max: 6, fields: ["heading", "value"] }, fields: ["text"] },
  explainer: { layout: explainer, use: "One idea explained in a short paragraph (body), with the key line (callout) and an icon in the panel beside it.", needsIcon: true, fields: ["body", "callout"] },
};

const TYPE_NAMES = Object.keys(TYPES);
const DRAWN_NEEDS_TITLE = (t) => !TYPES[t].template;

// Everything wrong with one slide, as instructions Claude can act on.
function slideProblems(s, at) {
  const t = TYPES[s.type];
  if (!t) return [`${at}: unknown type "${s.type}".`];
  const problems = [];
  const need = (cond, msg) => !cond && problems.push(`${at}: ${msg}`);
  const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;

  if (t.limits) {
    for (const [f, max] of Object.entries(t.limits)) {
      const v = (s[f] || "").trim();
      need(v, `${f} is empty.`);
      if (v.length > max) problems.push(`${at}: ${f} is ${v.length} chars, max ${max}: "${v}"`);
    }
  }
  if (t.bullets) {
    const b = s.bullets || [];
    need(b.length >= t.bullets.min && b.length <= t.bullets.max, `needs ${t.bullets.min}-${t.bullets.max} bullets, has ${b.length}.`);
    b.forEach((x, j) => {
      if (x.length > t.bullets.chars) problems.push(`${at}: bullet ${j + 1} is ${x.length} chars, max ${t.bullets.chars}.`);
      if (/^\s*(\d+[.)]|[-•*–])\s/.test(x)) problems.push(`${at}: bullet ${j + 1} starts with a number or symbol; the slide adds bullet marks itself.`);
    });
  }
  if (DRAWN_NEEDS_TITLE(s.type)) {
    const title = (s.title || "").trim();
    need(title, "title is empty.");
    if (title.length > 42) problems.push(`${at}: title is ${title.length} chars, max 42: "${title}"`);
  }
  const iconOk = (name, where) => {
    if (!nonEmpty(name)) problems.push(`${at}: ${where} needs an icon.`);
    else if (!ICON_SET.has(name)) problems.push(`${at}: ${where} icon "${name}" is not in the icon list.`);
  };
  if (t.needsIcon) iconOk(s.icon, "the slide");
  if (t.optionalIcon && nonEmpty(s.icon) && !ICON_SET.has(s.icon)) problems.push(`${at}: icon "${s.icon}" is not in the icon list.`);
  for (const f of t.fields || []) need(nonEmpty(s[f]), `${f} is empty.`);

  if (t.items) {
    const items = s.items || [];
    need(items.length >= t.items.min && items.length <= t.items.max, `needs ${t.items.min}-${t.items.max} items, has ${items.length}.`);
    items.forEach((it, j) => {
      for (const f of t.items.fields) {
        if (f === "icon") iconOk(it.icon, `item ${j + 1}`);
        else need(nonEmpty(it[f]), `item ${j + 1} ${f} is empty.`);
      }
    });
    if (s.type === "chart") items.forEach((it, j) => need(Number.isFinite(parseNumber(it.value)) && !/[a-z%$]/i.test(it.value), `item ${j + 1} value must be a plain number like "42" or "1.5" (put "%" etc. in unit): "${it.value}"`));
  }
  if (t.sides) {
    for (const name of ["left", "right"]) {
      const side = s[name] || {};
      need(nonEmpty(side.label), `${name}.label is empty.`);
      const n = (side.points || []).length;
      need(n >= t.sides.min && n <= t.sides.max, `${name} needs ${t.sides.min}-${t.sides.max} points, has ${n}.`);
    }
  }
  const layout = t.layout || t.overlay;
  if (problems.length || !layout) return problems;

  // Every text must fit its box at the design's sizes.
  for (const o of layout(s)) {
    if (o.op !== "text" || !o.label) continue;
    if (o.runs) {
      const used = o.runs.reduce((sum, r) => sum + fit(r.text, o.w, 99, r.size, r.weight || 400, o.lineSpacing).lines * r.size * 1.5 * ((o.lineSpacing || 100) / 100), 0) / 72;
      if (used > o.h - 0.1) problems.push(`${at}: ${o.label} is too long for its row. Shorten the heading or text.`);
      continue;
    }
    const f = fit(o.text, o.w, o.h, o.size, o.weight || 400, o.lineSpacing || 100);
    if (!f.ok) problems.push(`${at}: ${o.label} is too long (needs ${f.lines} lines, room for ${f.maxLines}). Cut it to about ${f.maxChars} characters: "${o.text}"`);
  }
  return problems;
}

// Which plan field each text box shows, for the limits Claude is given.
const LABEL_FIELD = {
  "card heading": "items[].heading", "card text": "items[].text",
  "step heading": "items[].heading", "step text": "items[].text",
  "stat value": "items[].value", "stat label": "items[].text",
  "milestone date": "items[].value", "milestone heading": "items[].heading", "milestone text": "items[].text",
  "bar label": "items[].heading", "bar value": "items[].value (with unit)",
  "left label": "left.label", "left point": "left.points[]", "right label": "right.label", "right point": "right.points[]",
  subtitle: "subtitle", statement: "statement", "supporting text": "text", insight: "text", body: "body", callout: "callout", number: "number", title: "title",
};

// Rough character limits per field for a drawn type, worked out from its own
// layout: { field: { itemCount: maxChars } }. Given to Claude so most slides
// fit first time; slideProblems() still checks every slide exactly.
function fieldLimits(name) {
  const t = TYPES[name];
  const layout = t.layout || t.overlay;
  if (!layout) return null;
  const range = t.items || t.sides;
  const counts = range ? Array.from({ length: range.max - range.min + 1 }, (_, k) => range.min + k) : [1];
  const limits = {};
  for (const n of counts) {
    const dummy = {
      title: "x", subtitle: "x", number: "01", icon: "house", statement: "x", text: "x", body: "x", callout: "x", unit: "",
      items: Array.from({ length: n }, () => ({ icon: "house", heading: "x", text: "x", value: "1" })),
      left: { label: "x", points: Array(n).fill("x") },
      right: { label: "x", points: Array(n).fill("x") },
    };
    for (const o of layout(dummy)) {
      if (o.op !== "text" || !o.label || o.runs) continue;
      const field = LABEL_FIELD[o.label.replace(/ \d+/g, "")];
      if (!field) continue;
      const max = fit("", o.w, o.h, o.size, o.weight || 400, o.lineSpacing || 100).maxChars;
      limits[field] = limits[field] || {};
      limits[field][n] = Math.min(limits[field][n] ?? Infinity, max);
    }
  }
  return limits;
}

// "heading ≤ 18" or, when it depends on the item count, "heading ≤ 18 (3 items) / 14 (4) / 10 (5)".
function describeLimits(name) {
  const limits = fieldLimits(name);
  if (!limits) return "";
  return Object.entries(limits)
    .map(([field, byCount]) => {
      const entries = Object.entries(byCount);
      const values = [...new Set(entries.map(([, v]) => v))];
      if (values.length === 1) return `${field} ≤ ${values[0]}`;
      const unit = TYPES[name].sides ? "points" : "items";
      return `${field} ≤ ${entries.map(([n, v], k) => (k === 0 ? `${v} (${n} ${unit})` : `${v} (${n})`)).join(" / ")}`;
    })
    .join("; ");
}

module.exports = { TYPES, TYPE_NAMES, slideProblems, describeLimits };
