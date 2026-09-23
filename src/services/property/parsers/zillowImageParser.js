// services/property/parsers/zillowImageParser.js
//
// Extracts the listing's photo gallery from the Firecrawl RAW HTML scrape of a
// Zillow listing. Source: scripts/image-parser.js (file I/O and logging removed).
//
// Usage: extractZillowImages(firecrawlJson | rawHtmlString)
//   -> { totalFound, image, otherImages }   (image = first photo, 1536px)

const EMPTY_RESULT = Object.freeze({ totalFound: 0, image: null, otherImages: [] });

function getRawHtml(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  return payload.data?.rawHtml || payload.rawHtml || '';
}

function extractZillowImages(payload) {
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
        const cacheString = JSON.stringify(cache);

        // Locate responsivePhotos array or photo objects specific to this property listing
        const responsivePhotosMatch = cacheString.match(/"responsivePhotos"\s*:\s*(\[[^\]]+\])/);

        if (responsivePhotosMatch && responsivePhotosMatch[1]) {
          const photoObjects = JSON.parse(responsivePhotosMatch[1]);
          galleryHashes = photoObjects
            .map((p) => p.url || p.caption || '')
            .map((url) => {
              const match = url.match(/\b([a-f0-9]{32})\b/i);
              return match ? match[1] : null;
            })
            .filter(Boolean);
        }
      }
    } catch {
      // Structured JSON not parseable — fall through to the key-based fallback.
      galleryHashes = [];
    }
  }

  // Fallback: search for photos explicitly tied to "mixedSources" or "jpeg" photo arrays in the state
  if (galleryHashes.length === 0) {
    const photoArrayRegex = /"url"\s*:\s*"https:\/\/photos\.zillowstatic\.com\/fp\/([a-f0-9]{32})-/gi;
    let match;
    while ((match = photoArrayRegex.exec(unescapedHtml)) !== null) {
      galleryHashes.push(match[1]);
    }
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

module.exports = { extractZillowImages };
