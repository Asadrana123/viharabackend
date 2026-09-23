const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'response.json');

function extractImagesFromPostmanJson(file) {
  try {
    const rawContent = fs.readFileSync(file, 'utf8');
    
    let rawHtml = '';
    try {
      const jsonContent = JSON.parse(rawContent);
      rawHtml = jsonContent.data?.rawHtml || jsonContent.rawHtml || rawContent;
    } catch (e) {
      rawHtml = rawContent;
    }

    if (!rawHtml) {
      console.log("No rawHtml payload found!");
      return;
    }

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
              .map(p => p.url || p.caption || '')
              .map(url => {
                const match = url.match(/\b([a-f0-9]{32})\b/i);
                return match ? match[1] : null;
              })
              .filter(Boolean);
          }
        }
      } catch (err) {
        console.log("Failed parsing structured JSON, attempting key-based fallback...");
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
      hash => `https://photos.zillowstatic.com/fp/${hash}-cc_ft_1536.jpg`
    );

    const result = {
      totalFound: fullResolutionUrls.length,
      image: fullResolutionUrls[0] || null,
      otherImages: fullResolutionUrls.slice(1)
    };

    console.log("=== EXACT LISTING EXTRACTION RESULT ===");
    console.log(`Total Unique Listing Photos Found: ${result.totalFound}\n`);
    console.log("Primary Image (productModel.image):");
    console.log(result.image);
    console.log("\nGallery Images (productModel.otherImages):");
    console.log(result.otherImages.length);

    return result;

  } catch (err) {
    console.error("Error reading or parsing file:", err.message);
  }
}

extractImagesFromPostmanJson(filePath);