const getAuctionWonEmailTemplate = ({ name, propertyAddress, winningBid, auctionLink }) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>You Won the Auction!</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f4f7; padding: 40px 20px; color: #333; }
    .wrapper { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .header { background: #1a1a2e; padding: 32px 40px; text-align: center; }
    .header h1 { color: #fff; font-size: 22px; font-weight: 600; margin-top: 8px; }
    .trophy { font-size: 48px; display: block; margin-bottom: 8px; }
    .success-banner { background: #d4edda; border-left: 4px solid #28a745; padding: 14px 40px; font-size: 14px; color: #155724; font-weight: 500; }
    .body { padding: 32px 40px; }
    .body p { font-size: 15px; line-height: 1.7; color: #555; margin-bottom: 20px; }
    .bid-table { width: 100%; border-collapse: collapse; margin: 24px 0; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0; }
    .bid-table td { padding: 14px 18px; font-size: 15px; border-bottom: 1px solid #f0f0f0; }
    .bid-table tr:last-child td { border-bottom: none; }
    .bid-table .label { color: #888; width: 55%; }
    .bid-table .value { font-weight: 600; color: #222; text-align: right; }
    .bid-table .value.win { color: #28a745; }
    .steps { background: #f8f9fa; border-radius: 8px; padding: 20px 24px; margin: 20px 0; }
    .steps h4 { font-size: 14px; color: #333; margin-bottom: 12px; }
    .steps ul { padding-left: 18px; }
    .steps ul li { font-size: 14px; color: #555; line-height: 1.8; }
    .cta-wrapper { text-align: center; margin: 28px 0 8px; }
    .cta-button { display: inline-block; background: #28a745; color: #fff !important; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-size: 15px; font-weight: 600; }
    .footer { background: #f8f9fa; padding: 20px 40px; text-align: center; font-size: 12px; color: #aaa; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <span class="trophy">🏆</span>
      <h1>Congratulations, You Won!</h1>
    </div>
    <div class="success-banner">✅ Your bid was the highest — the property is yours!</div>
    <div class="body">
      <p>Hi ${name},</p>
      <p>You have won the auction for <strong>${propertyAddress}</strong>. Here's a summary:</p>
      <table class="bid-table">
        <tr>
          <td class="label">Property</td>
          <td class="value">${propertyAddress}</td>
        </tr>
        <tr>
          <td class="label">Your Winning Bid</td>
          <td class="value win">$${winningBid.toLocaleString()}</td>
        </tr>
      </table>
      <div class="steps">
        <h4>What Happens Next:</h4>
        <ul>
          <li>Our team will contact you within 24 hours</li>
          <li>You'll receive detailed payment instructions</li>
          <li>Property inspection can be scheduled</li>
          <li>Closing process will be initiated</li>
        </ul>
      </div>
      <p>Please ensure you have the necessary funds available. Your bid is binding.</p>
      <div class="cta-wrapper">
        <a href="${auctionLink}" class="cta-button">View Auction Details</a>
      </div>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Vihara. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
};

module.exports = getAuctionWonEmailTemplate;
