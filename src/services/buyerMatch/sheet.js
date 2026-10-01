// services/buyerMatch/sheet.js
//
// Reads an uploaded property sheet (.xlsx or .csv) and turns each row into the
// same property profile the scorer uses for listed properties — so an admin can
// see buyer matches for properties that aren't on the site yet.
//
// Column names vary between sellers' sheets, so headers are matched loosely
// ("Agent BPO Price", "BPO", "ARV" → value; "REO: List Price", "Price" → price).
// Only an address-like column is required; everything else is optional and a
// missing column simply means that factor is skipped when scoring.

const ExcelJS = require("exceljs");
const Papa = require("papaparse");
const { toStateAbbr, normCounty, normCity, regionsForProperty } = require("./geo");

const MAX_ROWS = 2000;

// field → header patterns, checked in order against the normalized header.
// Earlier fields win, so "list price" is claimed by price before value's
// generic "price" fallback could see it.
const COLUMN_RULES = [
  ["street", [/^(property )?address( ?1)?$/, /^street( address)?$/, /address/]],
  ["city", [/^city$/, /city/]],
  ["state", [/^(state|st)$/, /state/]],
  ["zip", [/^zip( ?code)?$/, /^postal( ?code)?$/, /zip/]],
  ["county", [/^county$/]],
  ["value", [/bpo/, /\barv\b/, /\bavm\b/, /(market|estimated|as is) value/, /^value$/]],
  ["price", [/list(ing)? price/, /asking/, /reserve/, /^(sale )?price$/, /price/]],
  ["beds", [/^(beds?|bedrooms?|br)$/]],
  ["baths", [/^(baths?|bathrooms?|ba)$/]],
  ["sqft", [/sq ?ft|square ?f(ee|oo)t|living area/]],
  ["propertyType", [/property type|^type$/]],
  ["occupancy", [/occupan/]],
  ["disposition", [/disposition/]],
  ["status", [/status/]],
];

const normHeader = (h) =>
  String(h || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** ExcelJS cells can be rich text, formulas, hyperlinks or dates. */
function cellText(v) {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return cellText(v.result);
    if ("text" in v) return cellText(v.text);
    return "";
  }
  return String(v).trim();
}

const toNumber = (v) => {
  const n = Number(String(v || "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Map each header cell to a field. Returns { field: columnIndex }. */
function mapColumns(headers) {
  const used = new Set();
  const columns = {};
  for (const [field, patterns] of COLUMN_RULES) {
    for (const re of patterns) {
      const idx = headers.findIndex((h, i) => !used.has(i) && h && re.test(h));
      if (idx !== -1) {
        columns[field] = idx;
        used.add(idx);
        break;
      }
    }
  }
  return columns;
}

/** Rows as arrays of strings, per sheet, from either file type. */
async function readGrid(buffer, fileName) {
  if (/\.csv$/i.test(fileName)) {
    const parsed = Papa.parse(buffer.toString("utf8"), { skipEmptyLines: true });
    return [{ name: "CSV", rows: parsed.data.map((r) => r.map(cellText)) }];
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets.map((ws) => {
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      // row.values is 1-based; drop the empty slot 0.
      rows.push(row.values.slice(1).map(cellText));
    });
    return { name: ws.name, rows };
  });
}

/** First row in the top 10 that has an address-like header. */
function findHeader(rows) {
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const headers = rows[i].map(normHeader);
    const columns = mapColumns(headers);
    if (columns.street != null) return { index: i, columns, headers: rows[i] };
  }
  return null;
}

function normPropertyType(t) {
  const s = String(t || "").toLowerCase();
  if (!s) return null;
  if (/condo|town ?home|townhouse/.test(s)) return "Condo, Townhouse, other single unit";
  if (/multi|duplex|triplex|fourplex|quad|\d+ ?units?/.test(s)) return "Multi-family";
  if (/land|lot\b|acre/.test(s)) return "Land";
  if (/single|sfr|house|residential/.test(s)) return "Single Family";
  return null;
}

function assetTypeFrom(text) {
  const s = text.toLowerCase();
  if (/reo|bank owned/.test(s)) return "Reo Bank Owned";
  if (/foreclos/.test(s)) return "Foreclosure Homes";
  if (/short sale/.test(s)) return "Short Sale";
  return null;
}

function occupancyFrom(text) {
  const s = text.toLowerCase();
  if (/vacant/.test(s)) return "Vacant";
  if (/evict|occupied|tenant/.test(s)) return "Occupied";
  return null;
}

/** One sheet row → a scorer-ready property profile (id is "sheet-<row>"). */
function toProfile(cells, columns, rowNumber) {
  const get = (field) => (columns[field] != null ? cells[columns[field]] || "" : "");
  const street = get("street");
  if (!street) return null;

  const state = toStateAbbr(get("state")) || get("state").toUpperCase();
  const zip = get("zip").replace(/\.0$/, "").padStart(get("zip") ? 5 : 0, "0").slice(0, 5);
  const countyKey = normCounty(get("county"));
  const value = toNumber(get("value"));
  const listPrice = toNumber(get("price"));
  const price = listPrice || value;
  const beds = toNumber(get("beds"));
  const statusText = [get("status"), get("disposition")].join(" ");
  const city = get("city");

  return {
    id: `sheet-${rowNumber}`,
    row: rowNumber,
    slug: null,
    name: [street, city, state].filter(Boolean).join(", "),
    street,
    city,
    state,
    cityKey: normCity(city),
    countyKey,
    regions: regionsForProperty({ state, countyKey, zip }),
    zipCode: zip,
    image: null,
    price,
    priceSource: listPrice ? "list" : value ? "value" : null,
    value,
    discount: listPrice && value ? (value - listPrice) / value : null,
    rentYield: null,
    beds,
    baths: toNumber(get("baths")),
    squareFootage: toNumber(get("sqft")),
    propertyType: normPropertyType(get("propertyType")),
    assetType: assetTypeFrom(statusText),
    occupancyStatus: occupancyFrom(`${get("occupancy")} ${statusText}`),
    auctionStartDate: null,
    auctionEndDate: null,
    sellerIds: [],
    status: get("status"),
    disposition: get("disposition"),
  };
}

/**
 * Parse an uploaded sheet into property profiles.
 * @returns {{ sheets, sheet, columns, properties, skipped }}
 * @throws {Error & {statusCode}} when no usable sheet / address column exists
 */
async function parsePropertySheet(buffer, fileName, wantedSheet) {
  let grids;
  try {
    grids = await readGrid(buffer, fileName);
  } catch (err) {
    throw Object.assign(new Error("Could not read this file. Upload an .xlsx or .csv sheet."), { statusCode: 400 });
  }

  const usable = grids
    .map((g) => ({ ...g, header: findHeader(g.rows) }))
    .filter((g) => g.header);
  if (!usable.length) {
    throw Object.assign(new Error("No sheet has an Address column in its first rows."), { statusCode: 400 });
  }

  const grid = usable.find((g) => g.name === wantedSheet) || usable[0];
  const { index, columns, headers } = grid.header;

  const properties = [];
  let skipped = 0;
  for (let i = index + 1; i < grid.rows.length && properties.length < MAX_ROWS; i++) {
    const p = toProfile(grid.rows[i], columns, i + 1);
    if (p) properties.push(p);
    else if (grid.rows[i].some(Boolean)) skipped++;
  }

  return {
    sheets: usable.map((g) => g.name),
    sheet: grid.name,
    // Which sheet header fed each field — shown to the admin so a wrong guess
    // is visible.
    columns: Object.fromEntries(Object.entries(columns).map(([f, i]) => [f, headers[i]])),
    properties,
    skipped,
    truncated: grid.rows.length - index - 1 > MAX_ROWS,
  };
}

module.exports = { parsePropertySheet, MAX_ROWS };
