// utils/sellerReportExport.js
//
// Pure rendering for the seller dashboard "full report" export. Takes a plain
// report object (gathered in sellerController) and produces a PDF (drawn into a
// caller-supplied PDFKit document) or an ExcelJS workbook. No database access
// and no coupling to the HTTP response, so this stays easy to test in isolation.
//
// The report object shape:
// {
//   generatedAt: Date,
//   timezone:    "America/Los_Angeles",
//   property:  { productName, location, zipCode, propertyType, assetType,
//                occupancyStatus, beds, baths, squareFootage, lotSize,
//                yearBuilt, apn, status },
//   terms:     { reservePrice, highestBid, startBid, minIncrement },
//   window:    { start: Date|null, end: Date|null },
//   counts:    { total, approved, pending },
//   bids:          [{ index, bidderName, amount, createdAt }],
//   registrations: [{ index, name, buyerType, status, submittedAt, email, phone }]
// }

const ExcelJS = require("exceljs");
const { DateTime } = require("luxon");

// ---------- formatting helpers ----------

function fmtMoney(n) {
  return n != null ? `$${Number(n).toLocaleString("en-US")}` : "-";
}

function fmtNumber(n) {
  return n != null ? Number(n).toLocaleString("en-US") : "-";
}

// Format an instant in the property's timezone, e.g. "Aug 29, 2026, 2:55 PM PDT".
// `fallback` is returned for null/invalid dates ("-" for events, "TBD" for the
// auction window, matching the dashboard).
function fmtDateTz(date, zone, fallback = "-") {
  if (!date) return fallback;
  const dt = DateTime.fromJSDate(new Date(date), { zone: zone || "UTC" }).setLocale("en-US");
  return dt.isValid ? dt.toFormat("LLL d, yyyy, h:mm a ZZZZ") : fallback;
}

function slugify(str) {
  return String(str || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "auction";
}

// Filename (no extension) for the download.
function buildReportFilename(report) {
  const base = report?.property?.productName || report?.property?.location || "auction";
  return `${slugify(base)}_report`;
}

// Rows for the property/terms summary — shared by PDF and Excel so the two
// exports never drift. Each entry is [label, value].
function summaryRows(report) {
  const p = report.property || {};
  const t = report.terms || {};
  const w = report.window || {};
  const c = report.counts || {};
  const tz = report.timezone;

  return [
    ["Property", p.productName || "-"],
    ["Address", [p.location, p.zipCode].filter(Boolean).join(" ") || "-"],
    ["Status", p.status || "-"],
    ["Property Type", p.propertyType || "-"],
    ["Asset Type", p.assetType || "-"],
    ["Occupancy", p.occupancyStatus || "-"],
    ["Beds", p.beds != null ? String(p.beds) : "-"],
    ["Baths", p.baths != null ? String(p.baths) : "-"],
    ["Square Footage", fmtNumber(p.squareFootage)],
    ["Lot Size", fmtNumber(p.lotSize)],
    ["Year Built", p.yearBuilt != null ? String(p.yearBuilt) : "-"],
    ["APN", p.apn || "-"],
    ["Reserve Price", fmtMoney(t.reservePrice)],
    ["Highest Bid", fmtMoney(t.highestBid)],
    ["Starting Bid", fmtMoney(t.startBid)],
    ["Min Increment", fmtMoney(t.minIncrement)],
    ["Auction Start", fmtDateTz(w.start, tz, "TBD")],
    ["Auction End", fmtDateTz(w.end, tz, "TBD")],
    ["Registered Bidders", String(c.total ?? 0)],
    ["Approved", String(c.approved ?? 0)],
    ["Pending", String(c.pending ?? 0)]
  ];
}

// ---------- PDF ----------

const PDF = {
  ink: "#081f52",
  blue: "#1652ce",
  muted: "#5a6072",
  border: "#e2e5ec",
  soft: "#f5f8fe"
};

// Draw a simple table with a header row, wrapping cells and automatic page
// breaks (the header repeats on each new page). Returns the y after the table.
function drawTable(doc, columns, rows, startY) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const bottom = doc.page.height - doc.page.margins.bottom;
  const cellPadX = 6;
  const cellPadY = 5;

  let y = startY;

  const colX = [];
  let x = left;
  columns.forEach((c) => { colX.push(x); x += c.width; });

  const drawHeader = () => {
    doc.save();
    doc.rect(left, y, right - left, 20).fill(PDF.soft);
    doc.restore();
    doc.fontSize(9).fillColor(PDF.ink).font("Helvetica-Bold");
    columns.forEach((c, i) => {
      doc.text(c.label, colX[i] + cellPadX, y + cellPadY, {
        width: c.width - cellPadX * 2,
        align: c.align || "left"
      });
    });
    y += 20;
    doc.font("Helvetica");
  };

  drawHeader();

  rows.forEach((row) => {
    doc.fontSize(9).fillColor(PDF.muted).font("Helvetica");

    // Measure the tallest cell to size the row.
    let rowHeight = 0;
    row.forEach((cell, i) => {
      const h = doc.heightOfString(String(cell ?? ""), {
        width: columns[i].width - cellPadX * 2
      });
      rowHeight = Math.max(rowHeight, h);
    });
    rowHeight += cellPadY * 2;

    // Page break if the row won't fit.
    if (y + rowHeight > bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
      doc.fontSize(9).fillColor(PDF.muted).font("Helvetica");
    }

    row.forEach((cell, i) => {
      doc.text(String(cell ?? ""), colX[i] + cellPadX, y + cellPadY, {
        width: columns[i].width - cellPadX * 2,
        align: columns[i].align || "left"
      });
    });

    y += rowHeight;
    doc.save();
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(PDF.border).stroke();
    doc.restore();
  });

  return y;
}

function sectionHeading(doc, text, y) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (y + 30 > bottom) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  doc.fontSize(13).fillColor(PDF.ink).font("Helvetica-Bold").text(text, doc.page.margins.left, y);
  return doc.y + 6;
}

// Render the whole report into an existing PDFKit document (caller pipes + ends).
function renderAuctionReportPdf(doc, report) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const tz = report.timezone;

  // Title block
  doc.fontSize(20).fillColor(PDF.ink).font("Helvetica-Bold")
    .text("Seller Auction Report", left, doc.page.margins.top);
  doc.moveDown(0.2);
  doc.fontSize(12).fillColor(PDF.blue).font("Helvetica-Bold")
    .text(report.property?.productName || "-", { width });
  doc.fontSize(10).fillColor(PDF.muted).font("Helvetica")
    .text([report.property?.location, report.property?.zipCode].filter(Boolean).join(" ") || "-", { width });
  doc.moveDown(0.3);
  doc.fontSize(8).fillColor(PDF.muted)
    .text(`Generated ${fmtDateTz(report.generatedAt, tz)}  ·  All times shown in the property's local time.`, { width });

  let y = doc.y + 14;

  // Summary as a 2-column label/value table
  y = sectionHeading(doc, "Property & Auction Details", y);
  y = drawTable(
    doc,
    [
      { label: "Field", width: width * 0.4 },
      { label: "Value", width: width * 0.6 }
    ],
    summaryRows(report),
    y
  );

  y += 18;

  // Bids
  y = sectionHeading(doc, `Bids (${report.bids.length})`, y);
  if (report.bids.length === 0) {
    doc.fontSize(9).fillColor(PDF.muted).font("Helvetica")
      .text("No bids placed yet for this property.", left, y);
    y = doc.y + 12;
  } else {
    y = drawTable(
      doc,
      [
        { label: "#", width: width * 0.07, align: "left" },
        { label: "Bidder Name", width: width * 0.33 },
        { label: "Amount", width: width * 0.25, align: "right" },
        { label: "Time", width: width * 0.35 }
      ],
      report.bids.map((b) => [b.index, b.bidderName, fmtMoney(b.amount), fmtDateTz(b.createdAt, tz)]),
      y
    );
    y += 18;
  }

  // Registrations
  y = sectionHeading(doc, `Registrations (${report.registrations.length})`, y);
  if (report.registrations.length === 0) {
    doc.fontSize(9).fillColor(PDF.muted).font("Helvetica")
      .text("No bidders have registered for this property yet.", left, y);
  } else {
    drawTable(
      doc,
      [
        { label: "#", width: width * 0.05, align: "left" },
        { label: "Name", width: width * 0.17 },
        { label: "Buyer Type", width: width * 0.13 },
        { label: "Status", width: width * 0.11 },
        { label: "Submitted", width: width * 0.2 },
        { label: "Email", width: width * 0.21 },
        { label: "Phone", width: width * 0.13 }
      ],
      report.registrations.map((r) => [
        r.index,
        r.name,
        r.buyerType || "-",
        r.status || "-",
        fmtDateTz(r.submittedAt, tz),
        r.email || "-",
        r.phone || "-"
      ]),
      y
    );
  }
}

// ---------- Excel ----------

function styleHeaderRow(row) {
  row.font = { bold: true, color: { argb: "FF081F52" } };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F8FE" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFE2E5EC" } } };
  });
}

async function buildAuctionReportWorkbook(report) {
  const tz = report.timezone;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Vihara";
  wb.created = new Date();

  // ----- Summary sheet -----
  const summary = wb.addWorksheet("Summary");
  summary.columns = [
    { header: "Field", key: "field", width: 26 },
    { header: "Value", key: "value", width: 48 }
  ];
  styleHeaderRow(summary.getRow(1));
  summaryRows(report).forEach(([field, value]) => summary.addRow({ field, value }));

  // ----- Bids sheet -----
  const bidsSheet = wb.addWorksheet("Bids");
  bidsSheet.columns = [
    { header: "#", key: "index", width: 6 },
    { header: "Bidder Name", key: "bidderName", width: 26 },
    { header: "Amount", key: "amount", width: 16 },
    { header: "Time", key: "time", width: 30 }
  ];
  styleHeaderRow(bidsSheet.getRow(1));
  report.bids.forEach((b) => {
    const row = bidsSheet.addRow({
      index: b.index,
      bidderName: b.bidderName,
      amount: b.amount != null ? Number(b.amount) : null,
      time: fmtDateTz(b.createdAt, tz)
    });
    row.getCell("amount").numFmt = '"$"#,##0';
  });

  // ----- Registrations sheet -----
  const regSheet = wb.addWorksheet("Registrations");
  regSheet.columns = [
    { header: "#", key: "index", width: 6 },
    { header: "Name", key: "name", width: 22 },
    { header: "Buyer Type", key: "buyerType", width: 16 },
    { header: "Status", key: "status", width: 12 },
    { header: "Submitted", key: "submitted", width: 30 },
    { header: "Email", key: "email", width: 28 },
    { header: "Phone", key: "phone", width: 16 }
  ];
  styleHeaderRow(regSheet.getRow(1));
  report.registrations.forEach((r) => {
    regSheet.addRow({
      index: r.index,
      name: r.name,
      buyerType: r.buyerType || "",
      status: r.status || "",
      submitted: fmtDateTz(r.submittedAt, tz),
      email: r.email || "",
      phone: r.phone || ""
    });
  });

  return wb;
}

module.exports = {
  renderAuctionReportPdf,
  buildAuctionReportWorkbook,
  buildReportFilename
};
