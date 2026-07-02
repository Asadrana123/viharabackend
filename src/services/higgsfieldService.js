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
      max_tokens: 4000,
      system: `You are an expert HTML/CSS designer specializing in LinkedIn data graphics for real estate market content.

You generate complete, self-contained HTML pages rendered to 768x1024px PNG images using Puppeteer.

STRICT RULES:
1. Return ONLY raw HTML — no markdown, no backticks, no explanation, no preamble
2. The HTML must be exactly 768px wide and 1024px tall — no scrolling, no overflow
3. Use only a single <style> block — no external CSS files, no @import
4. Use only system fonts: Arial, Georgia, sans-serif — no Google Fonts
5. All content must fit within 768x1024px
6. Brand colors: primary blue #0c4bea, white #ffffff, dark navy #111827, gray #6b7280
7. Always include: top blue bar with pillar name + date, bottom blue bar with logo
8. Logo in bottom bar left: <img src="${VIHARA_LOGO_URL}" style="height:36px;" />
9. Design must match the visualType requested
10. Display ALL data points with their sources
11. Premium Bloomberg/WSJ aesthetic — clean, minimal, professional
12. Start your response directly with <!DOCTYPE html>`,

      messages: [
        {
          role: "user",
          content: `Generate a complete HTML graphic for this LinkedIn post.

POST DATA:
Topic: ${topic}
Pillar: ${pillar}
Visual Type: ${visualType}
Hook Line: ${hookLine || "N/A"}
Visual Brief: ${visualBrief}
Post Text (first 400 chars): ${postText ? postText.substring(0, 400) : "N/A"}

DATA POINTS:
${statsText || "No data points provided"}

DESIGN REQUIREMENTS:
- Canvas: exactly 768px wide, 1024px tall
- Top bar: solid #0c4bea, pillar name white uppercase left, date right
- Main content: white background, layout based on visualType:
    stat-card → large bold number in #0c4bea, label below, source citation
    bar-chart → CSS div bars with real percentage widths and labels
    line-chart → visual trend using CSS divs
    split-graphic → two column layout contrasting two stats
    carousel → 3-4 data point cards in a grid
- Bottom bar: solid #0c4bea, 72px tall
- Logo in bottom bar left: <img src="${VIHARA_LOGO_URL}" style="height:36px;" />
- "vihara.ai" text on bottom bar right in white
- Show ALL data points with sources
- Font: Arial or system sans-serif only
- Current date: ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}

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
      timeout: 60000,
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
  
  await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 60000 });
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

  // Convert buffer to base64 data URI — avoids stream timeout issues
  const base64 = imageBuffer.toString("base64");
  const dataUri = `data:image/png;base64,${base64}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: "vihara-content",
    resource_type: "image",
  });

  console.log("[Cloudinary] Upload complete:", result.secure_url);
  return result.secure_url;
}