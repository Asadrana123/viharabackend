const getOutbidEmailTemplate = ({ name, propertyAddress, yourBid, newBid, auctionLink }) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>You've Been Outbid</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f4f7; padding: 40px 20px; color: #333; }
    .wrapper { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .header { background: #1a1a2e; padding: 32px 40px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 22px; margin-top: 16px; font-weight: 600; }
    .alert-banner { background: #fff3cd; border-left: 4px solid #f0a500; padding: 14px 40px; font-size: 14px; color: #856404; font-weight: 500; text-align: center; }
    .body { padding: 32px 40px; }
    .body p { font-size: 15px; line-height: 1.7; color: #555; margin-bottom: 20px; }
    .bid-table { width: 100%; border-collapse: collapse; margin: 24px 0; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0; }
    .bid-table td { padding: 14px 18px; font-size: 15px; border-bottom: 1px solid #f0f0f0; }
    .bid-table tr:last-child td { border-bottom: none; }
    .bid-table .label { color: #888; width: 55%; }
    .bid-table .value { font-weight: 600; color: #222; text-align: right; }
    .bid-table .value.new-bid { color: #c0392b; }
    .cta-wrapper { text-align: center; margin: 28px 0 8px; }
    .cta-button { display: inline-block; background: #c0392b; color: #ffffff !important; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-size: 15px; font-weight: 600; letter-spacing: 0.3px; }
    .footer { background: #f8f9fa; padding: 20px 40px; text-align: center; font-size: 12px; color: #aaa; border-top: 1px solid #eee; }
    .footer a { color: #aaa; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>You've Been Outbid</h1>
    </div>
    <div class="alert-banner">
      Act fast — someone has placed a higher bid on your property.
    </div>
    <div class="body">
      <p>Hi ${name},</p>
      <p>
        Unfortunately, you've been outbid on the property at
        <strong>${propertyAddress}</strong>.
        Here's a summary of the current auction status:
      </p>
      <table class="bid-table">
        <tr>
          <td class="label">Property</td>
          <td class="value">${propertyAddress}</td>
        </tr>
        <tr>
          <td class="label">Your Last Bid</td>
          <td class="value">$${yourBid.toLocaleString()}</td>
        </tr>
        <tr>
          <td class="label">Current Highest Bid</td>
          <td class="value new-bid">$${newBid.toLocaleString()}</td>
        </tr>
      </table>
      <p>Don't lose out! Place a higher bid now to stay in the running for this property.</p>
      <div class="cta-wrapper">
        <a href="${auctionLink}" class="cta-button">Bid Again Now</a>
      </div>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Vihara. All rights reserved.</p>
      <p style="margin-top: 6px;">You're receiving this because you placed a bid on a Vihara auction.</p>
    </div>
  </div>
</body>
</html>`;
};

module.exports = getOutbidEmailTemplate;
