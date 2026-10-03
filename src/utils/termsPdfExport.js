// utils/termsPdfExport.js
//
// Renders a property's Terms & Conditions (config/property/termsAndConditions.js)
// to a PDF Buffer, e.g. for attaching to the seller auction-closed email.

const PDFDocument = require("pdfkit");
const { getPropertyDisclaimers } = require("../config/property/termsAndConditions");

const PDF = {
  ink: "#081f52",
  blue: "#1652ce",
  muted: "#5a6072"
};

function renderTermsPdf(doc, product = {}) {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const { bulletDisclaimers, legalSections } = getPropertyDisclaimers(product);

  // Title block
  doc.fontSize(20).fillColor(PDF.ink).font("Helvetica-Bold")
    .text("Terms and Conditions", left, doc.page.margins.top, { width });
  doc.moveDown(0.2);
  doc.fontSize(12).fillColor(PDF.blue).font("Helvetica-Bold")
    .text(product.productName || "-", { width });
  const location = [product.street, product.city, product.state, product.zipCode]
    .filter(Boolean)
    .join(", ");
  if (location) {
    doc.fontSize(10).fillColor(PDF.muted).font("Helvetica").text(location, { width });
  }
  doc.moveDown(1);

  // Bullet list
  doc.fontSize(9.5).fillColor(PDF.muted).font("Helvetica");
  bulletDisclaimers.forEach((item) => {
    doc.text(`•  ${item}`, left, doc.y, { width, indent: 0, paragraphGap: 4 });
  });
  doc.moveDown(1);

  // Legal sections (PDFKit flows text onto new pages automatically)
  legalSections.forEach((section) => {
    doc.fontSize(11.5).fillColor(PDF.ink).font("Helvetica-Bold")
      .text(section.heading, left, doc.y, { width });
    doc.moveDown(0.3);
    doc.fontSize(9.5).fillColor(PDF.muted).font("Helvetica");
    section.paragraphs.forEach((para) => {
      doc.text(para, left, doc.y, { width, align: "justify", paragraphGap: 5 });
    });
    doc.moveDown(0.8);
  });
}

function renderTermsPdfBuffer(product) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      renderTermsPdf(doc, product);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { renderTermsPdfBuffer };
