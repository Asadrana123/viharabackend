// services/property/parsers/marketDataImageParser.js
//
// Extracts the listing's photo gallery from the Firecrawl RAW HTML scrape of a
// Market data listing. Source: scripts/image-parser.js (file I/O and logging removed).
//
// Usage: extractMarketDataImages(firecrawlJson | rawHtmlString)
//   -> { totalFound, image, otherImages }   (image = first photo, 1536px)

const EMPTY_RESULT = Object.freeze({ totalFound: 0, image: null, otherImages: [] });

function getRawHtml(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  return payload.data?.rawHtml || payload.rawHtml || '';
}

// Returns the full JSON array that follows `"responsivePhotos":` in text,
// matching brackets (the photo objects contain nested arrays), or null.
function sliceResponsivePhotos(text) {
  const keyIndex = text.indexOf('"responsivePhotos"');
  if (keyIndex === -1) return null;
  const start = text.indexOf('[', keyIndex);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '[') depth++;
    else if (ch === ']' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

// Listing photo hashes only — never the agent/broker headshots elsewhere on the page.
function hashesFromPhotosText(photosText) {
  const hashes = [];
  const hashRegex = /photos\.zillowstatic\.com\/fp\/([a-f0-9]{32})-/gi;
  let match;
  while ((match = hashRegex.exec(photosText)) !== null) hashes.push(match[1]);
  return hashes;
}

function extractMarketDataImages(payload) {
  const rawHtml = getRawHtml(payload);
  if (!rawHtml) return { ...EMPTY_RESULT };

  // Unescape HTML quotes and backslashes
  const unescapedHtml = rawHtml
    .split('\\"').join('"')
    .split('\\/').join('/')
    .split('\\\\').join('\\');

  // 1. Target the exact __NEXT_DATA__ JSON script
  const nextDataMatch = unescapedHtml.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);

  let galleryHashes = [];

  if (nextDataMatch && nextDataMatch[1]) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const cache = nextData?.props?.pageProps?.componentProps?.gdpClientCache;

      if (cache) {
        // The cache is often itself a JSON string — read it as text either way.
        const cacheString = typeof cache === 'string' ? cache : JSON.stringify(cache);
        const photosText = sliceResponsivePhotos(cacheString);
        if (photosText) galleryHashes = hashesFromPhotosText(photosText);
      }
    } catch {
      // Structured JSON not parseable — fall through to the page-text fallback.
      galleryHashes = [];
    }
  }

  // Fallback: the responsivePhotos array straight from the page text. Never
  // scan the whole page — that picks up agent/broker headshots too.
  if (galleryHashes.length === 0) {
    const photosText = sliceResponsivePhotos(unescapedHtml);
    if (photosText) galleryHashes = hashesFromPhotosText(photosText);
  }

  // Deduplicate maintaining strict page order
  const uniqueHashes = [...new Set(galleryHashes)];

  // Build 1536px HD URLs
  const fullResolutionUrls = uniqueHashes.map(
    (hash) => `https://photos.zillowstatic.com/fp/${hash}-cc_ft_1536.jpg`
  );

  return {
    totalFound: fullResolutionUrls.length,
    image: fullResolutionUrls[0] || null,
    otherImages: fullResolutionUrls.slice(1),
  };
}

module.exports = { extractMarketDataImages };
