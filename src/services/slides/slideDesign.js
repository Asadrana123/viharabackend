// services/slides/slideDesign.js
//
// The Vihara slide design system, in code: the grid, type sizes and colours
// every drawn slide uses, plus small builders for Google Slides API requests
// (text boxes, shapes, icons) and a text-fit estimate.
//
// Slide types (slideTypes.js) only place things on this grid with these
// helpers, so every slide shares the same margins, sizes and colours.
const { iconUrl } = require("../../config/slideIcons");

const EMU = 914400; // per inch
const emu = (inches) => Math.round(inches * EMU);

// 16:9 slide, 10in × 5.625in. Content sits under the template's title.
const GRID = {
  width: 10,
  height: 5.625,
  margin: 0.5,
  contentTop: 1.8,
  contentBottom: 5.05,
  gap: 0.3,
};
GRID.contentWidth = GRID.width - 2 * GRID.margin;
GRID.contentHeight = GRID.contentBottom - GRID.contentTop;

const FONT = process.env.SLIDES_FONT || "Poppins";

// Type scale (pt). Nothing on a slide is smaller than `small`.
const TYPE = {
  statement: 26,
  stat: 34,
  cardTitle: 15,
  body: 12.5,
  small: 11,
  label: 10,
};

// Colours come from the Brand Kit; these are only the fallbacks.
function palette(kitColors = {}) {
  const c = (k, d) => (kitColors[k] || d).toLowerCase();
  const primary = c("primary", "#0c4bea");
  return {
    primary,
    primaryMid: tint(primary, 0.45), // other bars in a chart
    primarySoftStrong: tint(primary, 0.75), // connector lines

    primaryDark: c("primaryHover", "#0a3cc0"),
    primarySoft: c("primarySoft", "#e8eefd"),
    heading: c("heading", "#111827"),
    text: c("text", "#374151"),
    muted: c("muted", "#6b7280"),
    surface: c("surface", "#ffffff"),
    border: c("border", "#e5e7eb"),
    white: "#ffffff",
  };
}

const rgb = (hex) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
};
const solid = (hex) => ({ solidFill: { color: { rgbColor: rgb(hex) } } });

// Mixes a colour toward white (amount 0–1), for lighter bars and dots.
function tint(hex, amount) {
  const n = parseInt(hex.replace("#", ""), 16);
  const ch = (shift) => Math.round(((n >> shift) & 255) + (255 - ((n >> shift) & 255)) * amount);
  return `#${[ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const box = (page, x, y, w, h) => ({
  pageObjectId: page,
  size: { width: { magnitude: emu(w), unit: "EMU" }, height: { magnitude: emu(h), unit: "EMU" } },
  transform: { scaleX: 1, scaleY: 1, translateX: emu(x), translateY: emu(y), unit: "EMU" },
});

/**
 * Collects the API requests for one slide. Every element gets a unique id
 * (`<slideId>_<n>`), and is drawn in the order it's added (later = on top).
 */
class Canvas {
  constructor(slideId, colors) {
    this.slideId = slideId;
    this.c = colors;
    this.requests = [];
    this.n = 0;
  }

  id() {
    this.n += 1;
    return `${this.slideId}_e${this.n}`;
  }

  // Filled shape: "ROUND_RECTANGLE", "RECTANGLE" or "ELLIPSE". Returns its id.
  shape(type, x, y, w, h, { fill, outline } = {}) {
    const objectId = this.id();
    this.requests.push({ createShape: { objectId, shapeType: type, elementProperties: box(this.slideId, x, y, w, h) } });
    const props = { outline: outline ? { outlineFill: solid(outline), weight: { magnitude: 0.75, unit: "PT" } } : { propertyState: "NOT_RENDERED" } };
    if (fill) props.shapeBackgroundFill = solid(fill);
    else props.shapeBackgroundFill = { propertyState: "NOT_RENDERED" };
    this.requests.push({
      updateShapeProperties: { objectId, shapeProperties: props, fields: "shapeBackgroundFill,outline" },
    });
    return objectId;
  }

  /**
   * Text box. `runs` is a string or [{ text, size, weight, color }] (one paragraph each).
   * Options: size, weight (400|600|700), color, align (START|CENTER|END),
   * valign (TOP|MIDDLE|BOTTOM), lineSpacing (%), spaceBelow (pt), into (existing shape id).
   */
  text(x, y, w, h, runs, opts = {}) {
    const { size = TYPE.body, weight = 400, color = this.c.text, align = "START", valign = "TOP", lineSpacing = 100, spaceBelow = 0, into } = opts;
    const objectId = into || this.id();
    if (!into) this.requests.push({ createShape: { objectId, shapeType: "TEXT_BOX", elementProperties: box(this.slideId, x, y, w, h) } });

    const paras = (Array.isArray(runs) ? runs : [{ text: runs }]).filter((r) => r.text);
    const full = paras.map((r) => r.text).join("\n");
    if (!full) return objectId;
    this.requests.push({ insertText: { objectId, text: full, insertionIndex: 0 } });

    let start = 0;
    for (const r of paras) {
      const end = start + r.text.length;
      this.requests.push({
        updateTextStyle: {
          objectId,
          textRange: { type: "FIXED_RANGE", startIndex: start, endIndex: end },
          style: {
            weightedFontFamily: { fontFamily: FONT, weight: r.weight || weight },
            fontSize: { magnitude: r.size || size, unit: "PT" },
            foregroundColor: { opaqueColor: { rgbColor: rgb(r.color || color) } },
          },
          fields: "weightedFontFamily,fontSize,foregroundColor",
        },
      });
      start = end + 1; // the "\n"
    }
    this.requests.push({
      updateParagraphStyle: {
        objectId,
        textRange: { type: "ALL" },
        style: { alignment: align, lineSpacing, spaceBelow: { magnitude: spaceBelow, unit: "PT" } },
        fields: "alignment,lineSpacing,spaceBelow",
      },
    });
    this.requests.push({ updateShapeProperties: { objectId, shapeProperties: { contentAlignment: valign }, fields: "contentAlignment" } });
    return objectId;
  }

  // Phosphor icon (config/slideIcons) in one colour, as a square image.
  icon(name, x, y, sizeIn, color) {
    const objectId = this.id();
    this.requests.push({ createImage: { objectId, url: iconUrl(name, color), elementProperties: box(this.slideId, x, y, sizeIn, sizeIn) } });
    return objectId;
  }

  // An icon centred in a filled circle: the slides' visual motif.
  iconBadge(name, x, y, d, { fill = this.c.primarySoft, color = this.c.primary, scale = 0.52 } = {}) {
    this.shape("ELLIPSE", x, y, d, d, { fill });
    const s = d * scale;
    if (name) this.icon(name, x + (d - s) / 2, y + (d - s) / 2, s, color);
  }
}

// ── Text fit ────────────────────────────────────────────────────────────────
// Google Slides can't shrink text to fit through the API, so we check before
// building. Poppins is a wide font; these widths are deliberately generous.
const INSET = 0.1; // Slides' default padding inside a text box, per side (in)
const LINE_HEIGHT = 1.5; // Poppins line height at 100% spacing, in ems

function countLines(text, widthIn, sizePt, weight = 400) {
  // Average Poppins character width in ems, measured on rendered slides (with a little slack).
  const charW = sizePt * (weight >= 600 ? 0.58 : 0.51);
  const perLine = Math.max(1, Math.floor(((widthIn - 2 * INSET) * 72) / charW));
  let lines = 0;
  for (const para of String(text).split("\n")) {
    let len = 0;
    lines += 1;
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (len === 0) len = word.length;
      else if (len + 1 + word.length <= perLine) len += 1 + word.length;
      else {
        lines += 1;
        len = word.length;
      }
      while (len > perLine) {
        lines += 1;
        len -= perLine;
      }
    }
  }
  return { lines, perLine };
}

// { ok, lines, maxLines, maxChars } for text in a box of this size.
function fit(text, widthIn, heightIn, sizePt, weight = 400, lineSpacing = 100) {
  const { lines, perLine } = countLines(text, widthIn, sizePt, weight);
  const lineIn = (sizePt * LINE_HEIGHT * (lineSpacing / 100)) / 72;
  const maxLines = Math.max(1, Math.floor((heightIn - 2 * 0.05) / lineIn));
  return { ok: lines <= maxLines, lines, maxLines, maxChars: Math.floor(perLine * maxLines * 0.9) };
}

module.exports = { GRID, TYPE, FONT, palette, tint, Canvas, fit, emu };
