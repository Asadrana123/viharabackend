const getSellerAuctionClosedEmailTemplate = ({ name, report }) => {
  const p = (report && report.property) || {};
  const t = (report && report.terms) || {};
  const c = (report && report.counts) || {};
  const bidsCount = (report && report.bids && report.bids.length) || 0;

  const fmtMoney = (n) =>
    n != null ? `$${Number(n).toLocaleString("en-US")}` : "—";

  const propertyLabel = p.productName || p.location || "Your property";
  const address = [p.location, p.zipCode].filter(Boolean).join(" ") || "—";
  const hasBids = bidsCount > 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Auction Closed — Seller Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f4f7; padding: 40px 20px; color: #333; }
    .wrapper { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .header { background: #1a1a2e; padding: 32px 40px; text-align: center; }
    .header span { font-size: 40px; display: block; margin-bottom: 8px; }
    .header h1 { color: #fff; font-size: 22px; font-weight: 600; }
    .info-banner { background: #e8f0fe; border-left: 4px solid #4285f4; padding: 14px 40px; font-size: 14px; color: #1a56b0; font-weight: 500; }
    .body { padding: 32px 40px; }
    .body p { font-size: 15px; line-height: 1.7; color: #555; margin-bottom: 20px; }
    .bid-table { width: 100%; border-collapse: collapse; margin: 24px 0; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0; }
    .bid-table td { padding: 14px 18px; font-size: 15px; border-bottom: 1px solid #f0f0f0; }
    .bid-table tr:last-child td { border-bottom: none; }
    .bid-table .label { color: #888; width: 55%; }
    .bid-table .value { font-weight: 600; color: #222; text-align: right; }
    .attach-note { background: #f8f9fa; border-radius: 8px; padding: 16px 20px; margin: 20px 0; font-size: 14px; color: #555; line-height: 1.7; }
    .attach-note strong { color: #333; }
    .footer { background: #f8f9fa; padding: 20px 40px; text-align: center; font-size: 12px; color: #aaa; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <span>🏁</span>
      <h1>Auction Closed</h1>
    </div>
    <div class="info-banner">ℹ️ The auction for your property has ended. The full report is attached.</div>
    <div class="body">
      <p>Hi ${name},</p>
      <p>The auction for <strong>${propertyLabel}</strong> has closed. Here's a quick summary:</p>
      <table class="bid-table">
        <tr>
          <td class="label">Property</td>
          <td class="value">${address}</td>
        </tr>
        <tr>
          <td class="label">Highest Bid</td>
          <td class="value">${hasBids ? fmtMoney(t.highestBid) : "No bids received"}</td>
        </tr>
        <tr>
          <td class="label">Total Bids</td>
          <td class="value">${bidsCount}</td>
        </tr>
        <tr>
          <td class="label">Registered Bidders</td>
          <td class="value">${c.total ?? 0}</td>
        </tr>
        <tr>
          <td class="label">Approved / Pending</td>
          <td class="value">${c.approved ?? 0} / ${c.pending ?? 0}</td>
        </tr>
      </table>
      <div class="attach-note">
        <strong>Attached to this email:</strong><br/>
        • Full auction report (PDF)<br/>
        • Full auction report (Excel)<br/>
        Both include every bid and registration for this property.
      </div>
      <p>All times in the report are shown in the property's local timezone.</p>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Vihara. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
};

module.exports = getSellerAuctionClosedEmailTemplate;
