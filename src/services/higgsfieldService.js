const puppeteer = require("puppeteer");
const axios = require("axios");

const VIHARA_LOGO_URL = "https://res.cloudinary.com/my1chatapp/image/upload/v1780930235/viharanewlogo_qoipzb.png";

exports.generateLinkedInGraphic = async (visualBrief, pillar, dataPoints = [], postText = "", hookLine = "", visualType = "stat-card", topic = "") => {

  const html = await claudeGenerateHTML({
    visualBrief, pillar, dataPoints, postText, hookLine, visualType, topic,
  });

  console.log("=== CLAUDE HTML GENERATED (first 300 chars) ===");
  console.log(html.substring(0, 300));
  console.log("================================================");

  const imageBuffer = await renderToImage(html);
  const imageUrl = await uploadToCloudinary(imageBuffer);
  return imageUrl;
};

async function claudeGenerateHTML({ visualBrief, pillar, dataPoints, postText, hookLine, visualType, topic }) {

  const statsText = dataPoints
    .filter((d) => d.stat)
    .map((d) => `• ${d.stat} — Source: ${d.source}${d.date ? ", " + d.date : ""}`)
    .join("\n");

  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-sonnet-4-5",
      max_tokens: 6000,
      system: `You are a senior editorial designer producing scroll-stopping LinkedIn data graphics for a US real estate auction platform. Your work sits between The Economist, Bloomberg Businessweek, and a modern fintech brand deck.

You output complete, self-contained HTML pages rendered to 768x1024px PNG via Puppeteer.

=== NON-NEGOTIABLE OUTPUT RULES ===
1. Return ONLY raw HTML. No markdown, no backticks, no explanation. Start with <!DOCTYPE html>.
2. Canvas is EXACTLY 768px wide and 1024px tall. body { margin:0; width:768px; height:1024px; overflow:hidden; }
3. One single <style> block. No external CSS, no @import, no Google Fonts, no JS.
4. Fonts: -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif. For the hero number use font-weight 900 with letter-spacing:-0.04em.
5. Never let content overflow. Nothing may be clipped. Never use emoji.

=== THE PROBLEM YOU ARE SOLVING ===
Flat white graphics with centered text and small grey boxes do not stop the scroll. They read like a school report. Your job is TENSION and HIERARCHY: one number should dominate the frame so hard that a person scrolling at speed stops on it.

=== MANDATORY DESIGN SYSTEM ===

CANVAS
- Deep navy base: background: radial-gradient(120% 90% at 50% 0%, #14224a 0%, #0a1230 45%, #060b1f 100%);
- Overlay a subtle grid using a second layer: repeating-linear-gradient in rgba(255,255,255,0.035), 32px pitch, both axes. It must be barely visible — texture, not decoration.
- Add ONE soft accent glow behind the hero stat: radial-gradient(circle, rgba(12,75,234,0.45) 0%, transparent 65%), width ~600px, height ~600px, filter: blur(40px), position absolute, z-index 0. Content sits at z-index 1.

COLOR
- Electric blue #2563ff and #0c4bea (accents, glow, rules)
- White #ffffff (hero number, headline)
- Muted #93a3c9 (labels, body)
- Faint #5b6b96 (source citations)
- Positive trend: #22d39a. Negative trend: #ff5470. USE THESE — a falling stat must be red, a rising stat green. Never render every number in the same blue.

LAYOUT — top to bottom, this exact rhythm:
1. TOP BAR (h:64px): solid #0c4bea. Pillar name in white, uppercase, 13px, letter-spacing:0.18em, weight 700, padding-left 40px. Date on the right, rgba(255,255,255,0.75), 13px.
2. HERO BLOCK (~380px): the reason the graphic exists.
   - Eyebrow: 12px uppercase, letter-spacing:0.22em, color #2563ff, weight 700 (e.g. "ATTOM DATA · DECEMBER 2025")
   - THE NUMBER: font-size between 170px and 220px, weight 900, line-height:0.82, color #ffffff. If the stat is a percentage or change, put the % or +/- sign in a smaller span (0.42em) coloured #2563ff (or green/red per direction) sitting at the top of the digits.
   - Headline under it: 34px, weight 800, white, line-height:1.1, max 5 words, uppercase optional.
   - Sub-line: 15px, #93a3c9, max 2 lines. Says what changed vs what.
   - A 64px wide, 4px tall #2563ff rule under the sub-line as a full stop.
3. PULL QUOTE STRIP (~110px): the single most striking sentence from the brief/hook. Background rgba(37,99,255,0.12), left border 4px solid #2563ff, NOT centered — left-aligned, padding 22px 28px, 17px white text, weight 600, line-height:1.45. Pull the biggest raw number inside it into a <b> coloured #2563ff.
4. DATA GRID (~250px): 2x2 (or 1x3 / 2x1 to match the real count — never invent or pad data).
   - Each cell: background rgba(255,255,255,0.045), border:1px solid rgba(255,255,255,0.09), border-radius:14px, TOP border-left 3px solid in that stat's direction colour, padding 20px.
   - Value: 40px weight 800, coloured by direction (green up / red down / white neutral).
   - Label: 12px, #93a3c9, uppercase, letter-spacing:0.08em.
   - Source: 10px, #5b6b96, italic. Every cell MUST carry its named source.
5. BOTTOM BAR (h:72px): solid #0c4bea. Logo left: <img src="${VIHARA_LOGO_URL}" style="height:34px;" />. "vihara.ai" right, white, 15px, weight 700.

=== CRAFT RULES ===
- Left-align the hero block content, do not centre everything. Asymmetry reads as designed; centring reads as default.
- Generous outer padding: 40px left/right.
- One idea dominates. The hero number must be at least 4x the size of any other number on the canvas.
- Whitespace between blocks: 24-32px. Never cram.
- Use flexbox column on a 768x1024 wrapper so blocks distribute cleanly and nothing overflows.
- Show EVERY data point passed to you, with its real source. Never fabricate a stat, source, or date.
- Match the requested visualType, but the design system above still applies.

=== visualType TREATMENTS ===
- stat-card → hero block as specified above.
- bar-chart → replace the data grid with horizontal bars: track rgba(255,255,255,0.07), fill linear-gradient(90deg,#0c4bea,#2563ff), height 34px, radius 6px, real proportional widths, value labelled at the bar end in white weight 800, category label above in #93a3c9.
- line-chart → build the trend with an inline <svg> polyline (stroke #2563ff, width 3, round caps), circles at each vertex, an area fill below at rgba(37,99,255,0.18), and axis labels in #5b6b96 10px.
- split-graphic → hero block splits into two vertical halves divided by a 1px rgba(255,255,255,0.12) rule; left stat green, right stat red, each with its own label + source. Hero number size drops to 110px.
- carousel → data grid becomes 3-4 numbered cards (01 / 02 / 03 in #2563ff, 11px, weight 800) stacked, hero block shrinks to headline + eyebrow only.
- video-walkthrough / avatar-video / stat-video / marketing-video → render the stat-card treatment (this is a static thumbnail frame).`,

      messages: [
        {
          role: "user",
          content: `Generate the complete HTML graphic for this LinkedIn post.

POST DATA
Topic: ${topic}
Pillar: ${pillar}
Visual Type: ${visualType}
Hook Line: ${hookLine || "N/A"}
Visual Brief: ${visualBrief}
Post Text (first 400 chars): ${postText ? postText.substring(0, 400) : "N/A"}

DATA POINTS (use all of them, with their real sources — do not invent any)
${statsText || "No data points provided"}

Current date: ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}

Decide which single data point is the most arresting and make THAT the hero number. Everything else supports it. Colour each stat by its real direction (up = #22d39a, down = #ff5470).

Return ONLY the complete HTML, starting with <!DOCTYPE html>:`,
        },
      ],
    },
    {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      timeout: 90000,
    }
  ).catch((err) => {
    console.error("[Anthropic ERROR] Status:", err.response?.status);
    console.error("[Anthropic ERROR] Body:", JSON.stringify(err.response?.data, null, 2));
    throw err;
  });

  let html = response.data.content[0].text.trim();
  html = html.replace(/^```html\n?/, "").replace(/^```\n?/, "").replace(/\n?```$/, "").trim();
  return html;
}

// ── Puppeteer renders HTML to PNG — Windows compatible ────────────────────────
async function renderToImage(html) {
  console.log("[Puppeteer] Launching browser...");
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  console.log("[Puppeteer] Browser launched.");

  const page = await browser.newPage();
  await page.setViewport({ width: 768, height: 1024, deviceScaleFactor: 2 });
  console.log("[Puppeteer] Viewport set. Setting content...");

  await page.setContent(html, { waitUntil: "networkidle0", timeout: 90000 });
  console.log("[Puppeteer] Content set. Waiting 1s...");

  await new Promise(r => setTimeout(r, 1000));
  console.log("[Puppeteer] Taking screenshot...");

  const imageBuffer = await page.screenshot({
    type: "png",
    fullPage: false,
    clip: { x: 0, y: 0, width: 768, height: 1024 },
  });
  console.log("[Puppeteer] Screenshot taken. Closing browser...");

  await browser.close();
  console.log("[Puppeteer] Browser closed. Returning buffer.");
  return imageBuffer;
}

// ── Upload to Cloudinary ──────────────────────────────────────────────────────
async function uploadToCloudinary(imageBuffer) {
  console.log("[Cloudinary] Uploading image, buffer size:", imageBuffer.length);
  const cloudinary = require("cloudinary").v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  const base64 = imageBuffer.toString("base64");
  const dataUri = `data:image/png;base64,${base64}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: "vihara-content",
    resource_type: "image",
  });

  console.log("[Cloudinary] Upload complete:", result.secure_url);
  return result.secure_url;
}