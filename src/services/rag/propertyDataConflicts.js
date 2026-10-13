// services/rag/propertyDataConflicts.js
//
// A property record keeps some facts twice, in two places that nothing keeps in step:
//   - plain number fields:   beds, baths, monthlyHOADues, squareFootage
//   - listing text lists:    propertyDetails.interiorDetails.bedroomsBathrooms ("4 Bedrooms"),
//                            propertyDetails.community.hoa ("$922 monthly HOA fee"),
//                            propertyDetails.interiorDetails.interiorFeatures ("4,906 interior livable area")
// When an admin edits one and not the other, the record contradicts itself. This module finds
// those contradictions. Pure: no database, no network.
//
// Used by the chunker (to keep both versions out of what the AI reads) and by
// scripts/ragChunkAudit.js (to list them for whoever owns the listings).
'use strict';

const present = (v) => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '');
const asList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
const num = (s) => Number(String(s).replace(/,/g, ''));

const BEDROOMS = /(\d+(?:\.\d+)?)\s*bed(?:room)?s?\b/i;
// "3 Bathrooms" / "3 Baths", but not "2 Full bathrooms" or "1 Half bathroom" (a breakdown, not the total).
const BATHROOMS = /(?<!full\s)(?<!half\s)(\d+(?:\.\d+)?)\s*bath(?:room)?s?\b/i;
const MONTHLY_FEE = /\$\s?([\d,]+(?:\.\d+)?)\s*(?:per month|a month|monthly|\/\s?mo)/i;
const ANY_FEE = /\$\s?\d/;
const LIVABLE_AREA = /([\d,]{3,})\s*(?:sq\.?\s?ft\.?|square feet|interior livable area)/i;

/** The bedroom/bathroom lines in the listing text that disagree with the number fields. */
function conflictingRoomLines(property) {
  const lines = asList(property?.propertyDetails?.interiorDetails?.bedroomsBathrooms);
  const out = [];
  for (const line of lines) {
    const bed = line.match(BEDROOMS);
    const bath = line.match(BATHROOMS);
    if (bed && present(property.beds) && num(bed[1]) !== Number(property.beds)) out.push({ field: 'beds', fieldValue: Number(property.beds), textValue: num(bed[1]), line });
    else if (bath && !bed && present(property.baths) && num(bath[1]) !== Number(property.baths)) out.push({ field: 'baths', fieldValue: Number(property.baths), textValue: num(bath[1]), line });
  }
  return out;
}

/** HOA: the dues field against a fee named in the HOA text. Returns null when they agree or there is nothing to compare. */
function hoaConflict(property) {
  const text = asList(property?.propertyDetails?.community?.hoa).join(' ');
  if (!ANY_FEE.test(text) || !present(property?.monthlyHOADues)) return null;
  const dues = Number(property.monthlyHOADues);
  if (dues === 0) return { field: 'monthlyHOADues', fieldValue: 0, textValue: text.trim() };
  const monthly = text.match(MONTHLY_FEE);
  if (monthly && Math.round(num(monthly[1])) !== Math.round(dues)) return { field: 'monthlyHOADues', fieldValue: dues, textValue: text.trim() };
  return null;
}

/** Interior area: the squareFootage field against a figure in the interior features text. */
function areaConflict(property) {
  if (!present(property?.squareFootage)) return null;
  for (const line of asList(property?.propertyDetails?.interiorDetails?.interiorFeatures)) {
    const m = line.match(LIVABLE_AREA);
    if (m && num(m[1]) !== Number(property.squareFootage)) {
      return { field: 'squareFootage', fieldValue: Number(property.squareFootage), textValue: num(m[1]), line };
    }
  }
  return null;
}

/** Every contradiction in one property record: [{ field, fieldValue, textValue, line? }]. */
function findConflicts(property) {
  return [...conflictingRoomLines(property), hoaConflict(property), areaConflict(property)].filter(Boolean);
}

module.exports = { findConflicts, conflictingRoomLines, hoaConflict, areaConflict };
