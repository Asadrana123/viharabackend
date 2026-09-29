// services/marketing/creativeTemplates.js
//
// Builds the HTML for one ad image in the hybrid provider. The AI background
// (text-free photo) fills the canvas; this template puts every word on top in
// the designer's Vihara style, so text and numbers are always exact.
//
// Layout (matches buildBackgroundPrompt in creativePrompts.js):
//   1:1  - house on the right, white fade from the left, text column left.
//   9:16 - house in the upper part, white fade from the bottom, text below.
// The top-left corner stays clear for the logo Cloudinary places afterwards
// (LOGO_PLACEMENT in creativeConfig).

const { BRAND, CREATIVE_CONFIG, IMAGE_PROVIDERS } = require("../../config/marketing/creativeConfig");

const settings = CREATIVE_CONFIG.providers[IMAGE_PROVIDERS.HYBRID];
const C = BRAND.colors;

// "Starting bid: $180,000" -> { label: "Starting bid", value: "$180,000" }
const STAT_PATTERN = /^([^:$]{2,40}):\s*(\$.+)$/;
const DOLLAR_PATTERN = /(\$\s?[\d,]+(?:\.\d+)?)/g;

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Only allow the background as a data URI or an https URL inside the CSS.
function safeImageUrl(url) {
    if (typeof url !== "string") return "";
    return /^(data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+|https:\/\/[^\s"'()<>]+)$/i.test(url) ? url : "";
}

/**
 * Two-tone headline like the designer's ads: dollar amounts in Vihara blue;
 * with no dollar amount, the last word is blue.
 */
function headlineHtml(text) {
    const safe = escapeHtml(text);
    if (DOLLAR_PATTERN.test(text)) {
        DOLLAR_PATTERN.lastIndex = 0;
        return safe.replace(DOLLAR_PATTERN, '<span class="accent">$1</span>');
    }
    const words = safe.split(" ");
    if (words.length < 2) return safe;
    const last = words.pop();
    return `${words.join(" ")} <span class="accent">${last}</span>`;
}

// Starting size by length; the page script shrinks it further if needed.
function headlineSize(text, tall) {
    const n = String(text).length;
    const sizes = tall ? [112, 96, 80, 68, 56] : [96, 84, 72, 60, 50];
    if (n <= 18) return sizes[0];
    if (n <= 28) return sizes[1];
    if (n <= 42) return sizes[2];
    if (n <= 60) return sizes[3];
    return sizes[4];
}

/** secondary + supporting -> stat boxes ("Label: $value") and plain lines. */
function detailBlocks(texts) {
    const stats = [];
    const lines = [];
    [["secondaryHeadline", "sub"], ["supportingCopy", "meta"]].forEach(([role, kind]) => {
        const text = texts[role];
        if (!text) return;
        const m = String(text).match(STAT_PATTERN);
        if (m) stats.push({ label: m[1].trim(), value: m[2].trim() });
        else lines.push({ kind, text });
    });

    const linesHtml = lines.map((l) => `<p class="${l.kind}">${escapeHtml(l.text)}</p>`).join("");
    const statsHtml = stats.length
        ? `<div class="stats">${stats
              .map((s, i) => `<div class="stat${i === 1 ? " stat--blue" : ""}"><span class="stat-label">${escapeHtml(s.label)}</span><span class="stat-value">${escapeHtml(s.value)}</span></div>`)
              .join("")}</div>`
        : "";
    return linesHtml + statsHtml;
}

function ctaHtml(cta) {
    if (!cta) return "";
    return `<div class="cta"><span>${escapeHtml(cta)}</span><span class="cta-arrow" aria-hidden="true">&rarr;</span></div>`;
}

function styles({ width, height, tall, hasBackground, headlinePx }) {
    const fade = tall
        ? `linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0.88) 46%, rgba(255,255,255,0.97) 56%),
           radial-gradient(circle at 0 0, rgba(255,255,255,0.92) 0, rgba(255,255,255,0) 460px)`
        : `linear-gradient(90deg, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.92) 40%, rgba(255,255,255,0.45) 58%, rgba(255,255,255,0) 74%)`;

    // Content box: below the logo area, inside Meta's safe margins.
    const content = tall
        ? "left: 72px; right: 72px; top: 930px; bottom: 300px;"
        : "left: 64px; top: 200px; bottom: 64px; width: 600px;";

    return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
    body {
      position: relative;
      font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
      color: ${C.nearBlack};
      background: ${hasBackground ? C.white : C.offWhite};
      -webkit-font-smoothing: antialiased;
    }
    .bg { position: absolute; inset: 0; background-size: cover; background-position: center; }
    .fade { position: absolute; inset: 0; background: ${hasBackground ? fade : "none"}; }
    .shape {
      position: absolute; border-radius: 50%;
      width: ${tall ? 900 : 760}px; height: ${tall ? 900 : 760}px;
      right: -260px; top: ${tall ? 160 : -200}px;
      background: radial-gradient(circle, rgba(27,79,209,0.14) 0%, rgba(27,79,209,0) 70%);
    }
    .content {
      position: absolute; ${content}
      display: flex; flex-direction: column; justify-content: ${tall ? "flex-start" : "center"};
      gap: ${tall ? 32 : 28}px; overflow: hidden;
    }
    .headline {
      font-size: ${headlinePx}px; font-weight: 900; line-height: 1.02;
      letter-spacing: -0.035em; color: ${C.nearBlack}; overflow-wrap: break-word;
    }
    .accent { color: ${C.primaryBlue}; }
    .sub { font-size: ${tall ? 40 : 32}px; font-weight: 500; line-height: 1.25; color: #4b5563; }
    .meta {
      font-size: ${tall ? 26 : 21}px; font-weight: 600; letter-spacing: 0.08em;
      text-transform: uppercase; color: ${C.mutedGray};
    }
    .stats { display: flex; gap: 16px; }
    .stat {
      flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 6px;
      background: ${hasBackground ? "#eef2fb" : C.white}; border-radius: 16px;
      padding: ${tall ? "22px 26px" : "18px 22px"};
      box-shadow: ${hasBackground ? "none" : "0 6px 24px rgba(10,10,10,0.06)"};
    }
    .stat-label {
      font-size: ${tall ? 20 : 16}px; font-weight: 600; letter-spacing: 0.04em;
      text-transform: uppercase; color: ${C.mutedGray};
    }
    .stat--blue .stat-label { color: ${C.primaryBlue}; }
    .stat-value { font-size: ${tall ? 48 : 40}px; font-weight: 800; letter-spacing: -0.02em; color: ${C.nearBlack}; }
    .cta {
      align-self: flex-start; display: inline-flex; align-items: center; gap: 22px;
      background: ${C.primaryBlue}; color: ${C.white}; border-radius: 999px;
      padding: ${tall ? "26px 26px 26px 48px" : "20px 20px 20px 40px"};
      font-size: ${tall ? 36 : 30}px; font-weight: 600;
      box-shadow: 0 10px 30px rgba(27,79,209,0.28);
    }
    .cta-arrow {
      display: inline-flex; align-items: center; justify-content: center;
      width: ${tall ? 60 : 50}px; height: ${tall ? 60 : 50}px; border-radius: 50%;
      background: ${C.white}; color: ${C.primaryBlue}; font-size: ${tall ? 34 : 28}px; font-weight: 700;
    }`;
}

// Shrinks the headline (then the stat values) until everything fits the box.
const FIT_SCRIPT = `
window.__fit = function () {
  var box = document.querySelector('.content');
  var h = document.querySelector('.headline');
  if (!box || !h) return;
  var size = parseFloat(getComputedStyle(h).fontSize);
  while (box.scrollHeight > box.clientHeight + 1 && size > 36) {
    size -= 4;
    h.style.fontSize = size + 'px';
  }
  var values = document.querySelectorAll('.stat-value');
  var v = values.length ? parseFloat(getComputedStyle(values[0]).fontSize) : 0;
  while (box.scrollHeight > box.clientHeight + 1 && v > 24) {
    v -= 2;
    values.forEach(function (el) { el.style.fontSize = v + 'px'; });
  }
};`;

/**
 * @param {object} spec              creativePlanner spec (texts, format, size)
 * @param {string|null} backgroundUrl  AI background (data URI or https URL), null = graphic card
 * @returns {string} full HTML document
 */
function buildAdHtml(spec, backgroundUrl) {
    const { width, height } = spec.size.final;
    const tall = spec.format === "9:16";
    const bg = safeImageUrl(backgroundUrl);
    const texts = spec.texts || {};

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="${escapeHtml(settings.fontsCssUrl)}">
<style>${styles({ width, height, tall, hasBackground: Boolean(bg), headlinePx: headlineSize(texts.headline || "", tall) })}</style>
</head>
<body>
  ${bg ? `<div class="bg" style="background-image: url('${bg}')"></div>` : '<div class="shape"></div>'}
  <div class="fade"></div>
  <main class="content">
    ${texts.headline ? `<h1 class="headline">${headlineHtml(texts.headline)}</h1>` : ""}
    ${detailBlocks(texts)}
    ${ctaHtml(texts.cta)}
  </main>
  <script>${FIT_SCRIPT}</script>
</body>
</html>`;
}

module.exports = { buildAdHtml, escapeHtml, safeImageUrl };
