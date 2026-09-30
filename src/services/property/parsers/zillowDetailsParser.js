// services/property/parsers/zillowDetailsParser.js
//
// Parses the Firecrawl MARKDOWN scrape of a Zillow listing into structured
// property data. Source: scripts/property-details-parser.js (file I/O removed).
//
// Usage: processZillowResponse(firecrawlJson) -> { price, address, specs, ... }

const parseNumber = (regex, text) => {
  if (!text) return null;
  const match = text.match(regex);
  return match ? parseFloat(match[1].replace(/,/g, '')) : null;
};

const parseString = (regex, text) => {
  if (!text) return null;
  const match = text.match(regex);
  return match ? match[1].trim() : null;
};

const toLines = (text) =>
  String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Text of one "## Heading" section, up to the next "## " heading ('' if absent). */
function sectionOf(text, heading) {
  const start = text.indexOf(`\n${heading}\n`);
  if (start === -1) return '';
  const rest = text.slice(start + heading.length + 2);
  const next = rest.search(/\n##\s/);
  return next === -1 ? rest : rest.slice(0, next);
}

/** Bullet list under a "###### Name" sub-heading: "###### Heating\n\n- Central Forced Air" -> ["Central Forced Air"] */
function listUnderSubheading(text, name) {
  const re = new RegExp(`######\\s*${escapeRegex(name)}\\s*\\n+((?:-\\s*[^\\n]+\\n?)+)`, 'i');
  const m = text.match(re);
  if (!m) return [];
  return m[1].split('\n').map((l) => l.replace(/^-\s*/, '').trim()).filter(Boolean);
}

/** Pipe-table rows of a section as cell arrays (header and separator rows skipped). */
function tableRows(section) {
  return toLines(section)
    .filter((l) => l.startsWith('|') && !/^\|\s*-{3}/.test(l))
    .map((l) => l.split('|').map((c) => c.trim()).filter((c, i, arr) => !(c === '' && (i === 0 || i === arr.length - 1))));
}

function extractFromMarkdown(rawMarkdown) {
  // Firecrawl escapes dashes ("\-\-" for an empty tax cell); unescape once.
  const markdownText = String(rawMarkdown || '').replace(/\\-/g, '-');
  // ============================================
  // 1. ADDRESS
  // ============================================
  let street = null, city = null, state = null, zipCode = null, fullAddress = null;
  const addressMatch = markdownText.match(/#\s*(\d+[^,\n]+),\s*([^,\n]+),\s*([A-Z]{2})\s*(\d{5})/);

  if (addressMatch) {
    street = addressMatch[1].trim();
    city = addressMatch[2].trim();
    state = addressMatch[3].trim();
    zipCode = addressMatch[4].trim();
    fullAddress = `${street}, ${city}, ${state} ${zipCode}`;
  } else {
    const fallbackMatch = markdownText.match(/(\d+\s+[\w\s]+),\s*([\w\s]+),\s*([A-Z]{2})\s*(\d{5})/);
    if (fallbackMatch) {
      street = fallbackMatch[1].trim();
      city = fallbackMatch[2].trim();
      state = fallbackMatch[3].trim();
      zipCode = fallbackMatch[4].trim();
      fullAddress = `${street}, ${city}, ${state} ${zipCode}`;
    }
  }

  // ============================================
  // 2. DESCRIPTION ("What's special")
  // ============================================
  // Ends at the expand button ("Show more", or "Hide" once expanded), stats or next heading.
  const descMatch = markdownText.match(/## What's special\n\n(.*?)(?=\n\n(?:Show more|Hide)\b|\n\n\*\*|\n\n##)/s);
  const description = descMatch ? descMatch[1].trim() : null;

  // ============================================
  // 3. FACTS & FEATURES (heating, cooling, parking, construction, utilities)
  // ============================================
  let heating = parseString(/- Heating features:\s*([^\n]+)/i, markdownText) ||
                parseString(/Heating:\s*([^\n]+)/i, markdownText) ||
                (/\*\s*Central Forced Air/i.test(markdownText) ? 'Central Forced Air' : null);
  let cooling = parseString(/- Cooling features:\s*([^\n]+)/i, markdownText) ||
                parseString(/Cooling:\s*([^\n]+)/i, markdownText);

  // Current Zillow layout: "###### Heating\n\n- Central Forced Air"
  const factsSection = sectionOf(markdownText, '## Facts & features') || markdownText;
  if (!heating) heating = listUnderSubheading(factsSection, 'Heating').join(', ') || null;
  if (!cooling) cooling = listUnderSubheading(factsSection, 'Cooling').join(', ') || null;
  const homeType = parseString(/- Home type:\s*([^\n]+)/i, markdownText);

  if (heating) heating = String(heating).replace(/[\r\n]+/g, ' ').trim();
  if (cooling) cooling = String(cooling).replace(/[\r\n]+/g, ' ').trim();

  const fireplaceCount = parseNumber(/Number of fireplaces:\s*(\d+)/i, markdownText);
  const fireplaceFeatures = parseString(/Fireplace features:\s*([^\n]+)/i, markdownText);
  const stories = parseNumber(/\*\s*Stories:\s*(\d+)/i, markdownText) ||
                   parseNumber(/Stories:\s*(\d+)/i, markdownText);
  const garageSpaces = parseNumber(/Attached garage spaces:\s*(\d+)/i, markdownText);
  const totalParkingSpaces = parseNumber(/Total spaces:\s*(\d+)/i, markdownText);
  const foundation = parseString(/Foundation:\s*([^\n]+)/i, markdownText);
  const roof = parseString(/Roof:\s*([^\n]+)/i, markdownText);
  const zoning = parseString(/Zoning:\s*([^\n]+)/i, markdownText);
  const sewer = parseString(/Sewer:\s*([^\n]+)/i, markdownText);
  const water = parseString(/Water:\s*([^\n]+)(?!.*Public Utilities)/i, markdownText);
  const specialConditions = parseString(/Special conditions:\s*([^\n]+)/i, markdownText);
  const listingAgreement = parseString(/Listing agreement:\s*([^\n]+)/i, markdownText);
  const dateOnMarket = parseString(/Date on market:\s*([^\n]+)/i, markdownText);

  // ============================================
  // 4. SCHOOLS
  // Handles both the plain list format Zillow actually renders
  // ("Name School\n\nGrades K-6 • 0.2 miles\n\n7/10") and, as a
  // fallback, a pipe-table format in case Firecrawl ever converts
  // it that way for a different listing/layout.
  // ============================================
  function extractSchoolsList(text) {
    const out = [];
    const ls = toLines(text);
    for (let i = 0; i < ls.length; i++) {
      if (/\bSchool\b/i.test(ls[i]) && ls[i + 1] && /Grades?/i.test(ls[i + 1])) {
        const name = ls[i];
        const gm = ls[i + 1].match(/Grades?\s*([^•]+?)\s*•\s*([\d.]+)\s*mile/i);
        let rating = null;
        for (let j = i + 2; j < Math.min(i + 6, ls.length); j++) {
          if (/^\d{1,2}$/.test(ls[j])) { rating = Number(ls[j]); break; }
          const rm = ls[j].match(/^(\d{1,2})\s*\/\s*10/);
          if (rm) { rating = Number(rm[1]); break; }
        }
        const level = /elementary/i.test(name) ? 'Elementary'
          : /middle|intermediate/i.test(name) ? 'Middle'
          : /high/i.test(name) ? 'High' : '';
        out.push({
          name,
          grades: gm ? gm[1].trim() : null,
          distance: gm ? `${gm[2]} mi` : null,
          rating,
          level,
          type: 'Public',
        });
      }
    }
    return out;
  }

  function extractSchoolsTable(text) {
    const out = [];
    const schoolTableMatch = text.match(/GreatSchools rating[\s\S]*?\n(\|.*?\n)+/s);
    if (!schoolTableMatch) return out;
    const rows = schoolTableMatch[0].trim().split('\n');
    rows.forEach((row) => {
      const cols = row.split('|').map((c) => c.trim()).filter(Boolean);
      if (cols.length >= 3 && !cols[0].includes('---') && !cols[0].toLowerCase().includes('rating')) {
        out.push({ rating: cols[0], name: cols[1], grades: cols[2] || null, distance: cols[3] || null });
      }
    });
    return out;
  }

  const schools = extractSchoolsList(markdownText);
  if (schools.length === 0) schools.push(...extractSchoolsTable(markdownText));

  // ============================================
  // 5. PRICE HISTORY
  // Line-based scan for "date / event / $price [/ $x/sqft]" sequences,
  // with a pipe-table fallback.
  // ============================================
  function extractPriceHistoryLines(text) {
    const out = [];
    const EVENT = /listed for sale|sold|price change|pending|contingent|listing removed|back on market|listed for rent|relisted/i;
    const ls = toLines(text);
    const seen = {};
    for (let i = 0; i < ls.length; i++) {
      const dm = ls[i].match(/^(\d{1,2}\/\d{1,2}\/\d{4})$/);
      if (!dm) continue;
      let price = null, pricePerSqft = null, event = '', hasPpsf = false, hasEvent = false;
      for (let j = i + 1; j < Math.min(i + 7, ls.length); j++) {
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(ls[j])) break;
        if (/^\$[\d,]+$/.test(ls[j]) && price == null) {
          const p = parseFloat(ls[j].replace(/[$,]/g, ''));
          if (p >= 10000) price = p;
        } else if (/\$[\d,]+\s*\/\s*sqft/i.test(ls[j])) {
          pricePerSqft = parseFloat(ls[j].replace(/[$,/sqft]/gi, ''));
          hasPpsf = true;
        } else if (!/^\$/.test(ls[j]) && /[A-Za-z]/.test(ls[j]) && ls[j].length < 40) {
          if (EVENT.test(ls[j])) { if (!event) event = ls[j]; hasEvent = true; }
          else if (!event && ls[j].length < 30) event = ls[j];
        }
      }
      const key = `${dm[1]}|${price}`;
      if (price != null && (hasPpsf || hasEvent) && !seen[key]) {
        seen[key] = true;
        out.push({ date: dm[1], year: Number(dm[1].split('/')[2]), event, price, pricePerSqft });
      }
    }
    return out;
  }

  function extractPriceHistoryTable(text) {
    const out = [];
    const priceHistSection = text.match(/Price history.*?\n(\|.*?\n)+/s);
    if (!priceHistSection) return out;
    const rows = priceHistSection[0].trim().split('\n');
    rows.forEach((row) => {
      const cols = row.split('|').map((c) => c.trim()).filter(Boolean);
      if (cols.length >= 3 && !cols[0].includes('---') && !cols[0].toLowerCase().includes('date')) {
        const rawPriceMatch = cols[2].match(/\$([0-9,]+)/);
        const price = rawPriceMatch ? parseFloat(rawPriceMatch[1].replace(/,/g, '')) : null;
        out.push({ date: cols[0], event: cols[1], price, pricePerSqft: null });
      }
    });
    return out;
  }

  // Current layout: "| 8/22/2026 | Listed for sale | $325,000$234/sqft |"
  function extractPriceHistorySection(text) {
    const out = [];
    tableRows(sectionOf(text, '## Price history')).forEach((cols) => {
      const dm = (cols[0] || '').match(/^(\d{1,2}\/\d{1,2}\/\d{4})$/);
      if (!dm || cols.length < 3) return;
      const priceMatch = cols[2].match(/\$([\d,]+)/);
      const ppsfMatch = cols[2].match(/\$([\d,]+)\s*\/\s*sqft/i);
      out.push({
        date: dm[1],
        year: Number(dm[1].split('/')[2]),
        event: cols[1] || '',
        price: priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null,
        pricePerSqft: ppsfMatch ? parseFloat(ppsfMatch[1].replace(/,/g, '')) : null,
      });
    });
    return out;
  }

  const priceHistory = extractPriceHistorySection(markdownText);
  if (priceHistory.length === 0) priceHistory.push(...extractPriceHistoryLines(markdownText));
  if (priceHistory.length === 0) priceHistory.push(...extractPriceHistoryTable(markdownText));

  // ============================================
  // 6. TAX HISTORY
  // Line-based scan for "year / $taxPaid (+x%) / $assessment (+x%)" rows.
  // ============================================
  function extractTaxHistory(text) {
    const out = [];
    const seen = {};

    // Try pipe-table format first: "| 2025 | $1,228 +2.5% | $118,742 +2% |"
    const tableRegex = /\|\s*((?:19|20)\d{2})\s*\|\s*(--|\$[\d,]+(?:\s*[+-][\d.]+%)?)\s*\|\s*\$([\d,]+)/g;
    let tm;
    while ((tm = tableRegex.exec(text)) !== null) {
      const year = Number(tm[1]);
      if (seen[year]) continue;
      const taxRaw = tm[2];
      const taxMatch = taxRaw.match(/\$([\d,]+)/);
      const propertyTax = taxMatch ? parseFloat(taxMatch[1].replace(/,/g, '')) : null;
      const taxAssessment = parseFloat(tm[3].replace(/,/g, ''));
      seen[year] = true;
      out.push({ year, propertyTax, taxAssessment });
    }
    if (out.length > 0) return out;

    // Fallback: line-based scan (year alone on a line, "--" or $ amounts follow)
    const ls = toLines(text);
    for (let i = 0; i < ls.length; i++) {
      if (!/^(19|20)\d{2}$/.test(ls[i])) continue;
      const year = Number(ls[i]);
      if (year < 1985 || year > 2030 || seen[year]) continue;
      let propertyTax = null, taxAssessment = null;
      for (let j = i + 1; j < Math.min(i + 6, ls.length); j++) {
        if (/^(19|20)\d{2}$/.test(ls[j])) break;
        const mm = ls[j].match(/^\$([\d,]+)/);
        if (mm) {
          const val = parseFloat(mm[1].replace(/,/g, ''));
          if (propertyTax == null && taxAssessment == null) propertyTax = val;
          else if (taxAssessment == null) taxAssessment = val;
        }
      }
      if (taxAssessment != null && taxAssessment >= 10000) {
        seen[year] = true;
        out.push({ year, propertyTax, taxAssessment });
      }
    }
    return out;
  }

  const taxHistory = extractTaxHistory(sectionOf(markdownText, '## Public tax history') || markdownText);
  // Current assessed value: the facts line first, else the most recent row.
  const taxAssessedValue = parseNumber(/Tax assessed value:\s*\$([0-9,]+)/, markdownText) ||
    (taxHistory[0] && taxHistory[0].taxAssessment) || null;

  // ============================================
  // 7. FORECLOSURE HISTORY (present on REO/pre-foreclosure listings only)
  // Same date/event/amount pattern as price history, but keyed on
  // foreclosure-specific event words.
  // ============================================
  function extractForeclosureHistory(text) {
    const out = [];
    const EVENT = /notice of default|foreclosure auction|original loan|lien|trustee|auction scheduled|notice of trustee/i;
    const ls = toLines(text);
    const seen = {};
    for (let i = 0; i < ls.length; i++) {
      const dm = ls[i].match(/^(\d{1,2}\/\d{1,2}\/\d{4})$/);
      if (!dm) continue;
      let amount = null, event = '';
      for (let j = i + 1; j < Math.min(i + 6, ls.length); j++) {
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(ls[j])) break;
        const am = ls[j].match(/\$([\d,]+)/);
        if (am && amount == null) amount = parseFloat(am[1].replace(/,/g, ''));
        if (!event && EVENT.test(ls[j])) event = ls[j];
      }
      const key = `${dm[1]}|${amount}|${event}`;
      if (event && amount != null && !seen[key]) {
        seen[key] = true;
        out.push({ date: dm[1], event, amount });
      }
    }
    return out;
  }

  // Current layout: "| 8/4/2026 | Foreclosed auction | $310,644unpaid balance |"
  function extractForeclosureSection(text) {
    const out = [];
    tableRows(sectionOf(text, '## Foreclosure details')).forEach((cols) => {
      const dm = (cols[0] || '').match(/^(\d{1,2}\/\d{1,2}\/\d{4})$/);
      if (!dm || cols.length < 3) return;
      const am = cols[2].match(/\$([\d,]+)/);
      out.push({ date: dm[1], event: cols[1] || '', amount: am ? parseFloat(am[1].replace(/,/g, '')) : null });
    });
    return out;
  }

  const foreclosureHistory = extractForeclosureSection(markdownText);
  if (foreclosureHistory.length === 0) foreclosureHistory.push(...extractForeclosureHistory(markdownText));

  // ============================================
  // 8. WALK / BIKE / TRANSIT SCORE + COORDINATES
  // The Walk Score link embeds the property's lat/lng
  // (walkscore.com/score/loc/lat=...&lng=...), which doubles as a
  // coordinate source when no separate map API is available.
  // ============================================
  const walkScore = parseNumber(/Walk Score[^\d]{0,40}(\d{1,3})/i, markdownText);
  const bikeScore = parseNumber(/Bike Score[^\d]{0,40}(\d{1,3})/i, markdownText);
  const transitScore = parseNumber(/Transit Score[^\d]{0,40}(\d{1,3})/i, markdownText);

  let coordinates = null;
  const coordMatch = markdownText.match(/lat=(-?[\d.]+)\/lng=(-?[\d.]+)/i) ||
                      markdownText.match(/lat=(-?[\d.]+)&lng=(-?[\d.]+)/i);
  if (coordMatch) coordinates = { lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[2]) };

  // ============================================
  // 9. LISTING AGENT / MLS INFO
  // Handles both observed formats:
  //   "Listed by: Alfred Younan 01718008 408-728-5468, Metro Realty Pros 408-333-0333"
  //   "Listed by: Karen Cook DRE #01853166 209-658-2052, Realty Executives Of Northern California"
  // Strategy: pull the whole "Listed by:" line, strip the phone number and the
  // (optionally DRE#-prefixed) license number off the end of the name segment,
  // whatever's left before the first comma is the agent's name.
  // "Source: MLSListings Inc,  MLS#: ML82058659"
  // ============================================
  // The block can span several lines ("Listed by:\n\nName License Phone,\n\nCompany Phone\n\nSource: ..."),
  // so read it up to "Source:" and collapse it to one line.
  const listedByBlock = parseString(/Listed by:\s*([\s\S]*?)\n\s*(?:Source:|#)/i, markdownText);
  const listedByLine = listedByBlock
    ? listedByBlock.replace(/\s+/g, ' ').trim()
    : parseString(/Listed by:\s*([^\n]+)/i, markdownText);
  let listingAgent = null;
  if (listedByLine) {
    const commaIdx = listedByLine.indexOf(',');
    let namePart = commaIdx !== -1 ? listedByLine.slice(0, commaIdx) : listedByLine;
    // The company is the next comma segment; a co-listing agent may follow
    // ("Name, Company,Phone, Name 2, Company 2"), so ignore the rest.
    const companySegment = commaIdx !== -1 ? listedByLine.slice(commaIdx + 1).split(',')[0] : '';
    const company = companySegment.replace(/\s*\d{3}-\d{3}-\d{4}\s*$/, '').trim() || null;

    const phoneMatch = namePart.match(/(\d{3}-\d{3}-\d{4})/);
    const phone = phoneMatch ? phoneMatch[1] : null;
    if (phoneMatch) namePart = namePart.slice(0, phoneMatch.index).trim();

    const licenseMatch = namePart.match(/(?:DRE\s*#\s*)?(\d{5,8})\s*$/i);
    const licenseNumber = licenseMatch ? licenseMatch[1] : null;
    if (licenseMatch) namePart = namePart.slice(0, licenseMatch.index).trim();

    listingAgent = {
      name: namePart || null,
      licenseNumber,
      phone,
      company,
    };
  }
  // "MLS#: ML82058659" (require the # so "MLSListings" isn't read as the number)
  const mlsMatch = markdownText.match(/MLS\s*#\s*:?\s*([A-Z0-9-]+)/i);
  const sourceMatch = markdownText.match(/Source:\s*([^,\n]+)/i);

  // ============================================
  // 10. MARKET ACTIVITY (days on market, views, saves)
  // ============================================
  // "**31 days**on Zillow**2,286**views**136**saves" -> drop the bold markers first.
  const activityText = markdownText.replace(/\*\*/g, ' ');
  const daysOnMarket = parseNumber(/(\d+)\s*days?\s*on\s*Zillow/i, activityText);
  const views = parseNumber(/([\d,]+)\s*views/i, activityText);
  const saves = parseNumber(/([\d,]+)\s*saves/i, activityText);

  // List price: the "$249,900" line right above the "# address" heading; else the first $ amount.
  const price = parseNumber(/\$([0-9,]+)\s*\n+#\s*\d/, markdownText) || parseNumber(/\$([0-9,]+)/, markdownText);

  // Lot: "- Size: 8,075 Square Feet" or "- Size: 0.41 Acres" (converted to sq ft).
  const lotAcres = parseNumber(/- Size:\s*([\d.,]+)\s*Acres?/i, markdownText);
  const lotSizeSqft = parseNumber(/- Size:\s*([0-9,]+)\s*Square Feet/, markdownText) ||
    (lotAcres != null ? Math.round(lotAcres * 43560) : null);

  return {
    price,
    address: { fullAddress, street, city, state, zipCode },
    coordinates,
    specs: {
      beds: parseNumber(/- Bedrooms:\s*(\d+)/, markdownText) || parseNumber(/(\d+)\s*beds/, markdownText),
      baths: parseNumber(/- Bathrooms:\s*(\d+)/, markdownText) || parseNumber(/(\d+)\s*baths/, markdownText),
      sqft: parseNumber(/Total interior livable area:\s*([0-9,]+)\s*sqft/, markdownText) || parseNumber(/([0-9,]+)\s*sqft/, markdownText),
      lotSizeSqft,
      yearBuilt: parseNumber(/Built in (\d{4})/, markdownText) || parseNumber(/- Year built:\s*(\d{4})/, markdownText),
      stories,
    },
    financials: {
      monthlyHoa: parseNumber(/- HOA fee:\s*\$([0-9,]+)/, markdownText) || 0,
      taxAssessedValue,
      zestimate: parseNumber(/\$([0-9,]+)\s*Zestimate/, markdownText),
      rentZestimate: parseNumber(/Rent Zestimate[^$]{0,20}\$([0-9,]+)/i, markdownText),
      pricePerSqft: parseNumber(/\$([\d,]+)\/sqft/, markdownText),
    },
    details: {
      apn: parseString(/- Parcel number:\s*([^\n]+)/, markdownText) || parseString(/Parcel number:\s*([^\n]+)/, markdownText),
      heating,
      cooling,
      parking: parseString(/- Parking features:\s*([^\n]+)/, markdownText),
      totalParkingSpaces,
      garageSpaces,
      fireplaceCount,
      fireplaceFeatures,
      foundation,
      roof,
      zoning,
      sewer,
      water,
      specialConditions,
      listingAgreement,
      dateOnMarket,
      homeType,
    },
    description,
    schools,
    priceHistory,
    taxHistory,
    foreclosureHistory,
    walkScores: { walkScore, bikeScore, transitScore },
    listingAgent,
    mlsNumber: mlsMatch ? mlsMatch[1] : null,
    mlsSource: sourceMatch ? sourceMatch[1].trim() : null,
    marketActivity: { daysOnMarket, views, saves },
  };
}

function processZillowResponse(jsonPayload) {
  const markdownContent = jsonPayload.data?.markdown || jsonPayload.markdown;

  // Mode 1: Parse from Markdown content if present
  if (typeof markdownContent === 'string' && markdownContent.trim().length > 0) {
    return extractFromMarkdown(markdownContent);
  }

  // Mode 2: Parse directly from structured JSON response
  const addr = jsonPayload.address || {};
  const street = addr.streetAddress || addr.street || null;
  const city = addr.city || null;
  const state = addr.state || null;
  const zipCode = addr.zipcode || addr.zipCode || null;

  let fullAddress = null;
  if (street && city && state && zipCode) {
    fullAddress = `${street}, ${city}, ${state} ${zipCode}`;
  } else if (typeof addr === 'string') {
    fullAddress = addr;
  }

  const priceHistory = Array.isArray(jsonPayload.priceHistory)
    ? jsonPayload.priceHistory.map((item) => {
        let price = item.price;
        if (typeof price === 'string') {
          const match = price.match(/\$([0-9,]+)/);
          price = match ? parseFloat(match[1].replace(/,/g, '')) : null;
        }
        return { date: item.date || item.time || null, event: item.event || item.priceChangeRate || null, price, pricePerSqft: item.pricePerSquareFoot || null };
      })
    : [];

  const schools = Array.isArray(jsonPayload.schools)
    ? jsonPayload.schools.map((s) => ({
        rating: s.rating ?? null,
        name: s.name || s.schoolName || null,
        grades: s.grades || null,
        distance: s.distance ? `${s.distance} mi` : null,
        level: s.level || null,
        type: s.type || 'Public',
      }))
    : [];

  return {
    price: jsonPayload.price || jsonPayload.unformattedPrice || null,
    address: { fullAddress, street, city, state, zipCode },
    coordinates: jsonPayload.latLong || jsonPayload.coordinates || null,
    specs: {
      beds: jsonPayload.bedrooms ?? jsonPayload.beds ?? jsonPayload.specs?.beds ?? null,
      baths: jsonPayload.bathrooms ?? jsonPayload.baths ?? jsonPayload.specs?.baths ?? null,
      sqft: jsonPayload.squareFeet ?? jsonPayload.sqft ?? jsonPayload.specs?.sqft ?? null,
      lotSizeSqft: jsonPayload.lotSizeSqFt ?? jsonPayload.lotSizeSqft ?? jsonPayload.specs?.lotSizeSqft ?? null,
      yearBuilt: jsonPayload.yearBuilt ?? jsonPayload.specs?.yearBuilt ?? null,
      stories: jsonPayload.stories ?? null,
    },
    financials: {
      monthlyHoa: jsonPayload.monthlyHoa ?? jsonPayload.hoaFee ?? 0,
      taxAssessedValue: jsonPayload.taxAssessedValue ?? jsonPayload.financials?.taxAssessedValue ?? null,
      zestimate: jsonPayload.neighborhood?.zestimate ?? jsonPayload.zestimate ?? jsonPayload.financials?.zestimate ?? null,
      rentZestimate: jsonPayload.rentZestimate ?? null,
      pricePerSqft: jsonPayload.pricePerSquareFoot ?? null,
    },
    details: {
      apn: jsonPayload.apn ?? jsonPayload.details?.apn ?? null,
      heating: jsonPayload.heating ?? jsonPayload.details?.heating ?? null,
      cooling: jsonPayload.cooling ?? jsonPayload.details?.cooling ?? null,
      parking: jsonPayload.parking ?? jsonPayload.details?.parking ?? null,
      totalParkingSpaces: jsonPayload.parkingSpaces ?? null,
      garageSpaces: jsonPayload.garageSpaces ?? null,
      fireplaceCount: jsonPayload.fireplaces ?? null,
      fireplaceFeatures: null,
      foundation: jsonPayload.foundation ?? null,
      roof: jsonPayload.roof ?? null,
      zoning: jsonPayload.zoning ?? null,
      sewer: jsonPayload.sewer ?? null,
      water: jsonPayload.water ?? null,
      specialConditions: jsonPayload.specialConditions ?? null,
      listingAgreement: null,
      dateOnMarket: null,
    },
    description: jsonPayload.description || null,
    schools,
    priceHistory,
    taxHistory: Array.isArray(jsonPayload.taxHistory) ? jsonPayload.taxHistory : [],
    foreclosureHistory: Array.isArray(jsonPayload.foreclosureHistory) ? jsonPayload.foreclosureHistory : [],
    walkScores: {
      walkScore: jsonPayload.walkScore ?? null,
      bikeScore: jsonPayload.bikeScore ?? null,
      transitScore: jsonPayload.transitScore ?? null,
    },
    listingAgent: jsonPayload.listingAgent || null,
    mlsNumber: jsonPayload.mlsNumber || jsonPayload.mlsid || null,
    mlsSource: jsonPayload.providerListingId ? jsonPayload.brokerageName || null : null,
    marketActivity: {
      daysOnMarket: jsonPayload.daysOnZillow ?? null,
      views: jsonPayload.pageViewCount ?? null,
      saves: jsonPayload.favoriteCount ?? null,
    },
  };
}

module.exports = { extractFromMarkdown, processZillowResponse };