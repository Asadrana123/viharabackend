const getAuctionLostEmailTemplate = ({ name, propertyAddress, winningBid, winnerName, auctionLink }) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Auction Ended</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f4f7; padding: 40px 20px; color: #333; }
    .wrapper { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .header { background: #1a1a2e; padding: 32px 40px; text-align: center; }
    .header h1 { color: #fff; font-size: 22px; font-weight: 600; margin-top: 8px; }
    .header span { font-size: 40px; display: block; margin-bottom: 8px; }
    .info-banner { background: #e8f0fe; border-left: 4px solid #4285f4; padding: 14px 40px; font-size: 14px; color: #1a56b0; font-weight: 500; }
    .body { padding: 32px 40px; }
    .body p { font-size: 15px; line-height: 1.7; color: #555; margin-bottom: 20px; }
    .bid-table { width: 100%; border-collapse: collapse; margin: 24px 0; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0; }
    .bid-table td { padding: 14px 18px; font-size: 15px; border-bottom: 1px solid #f0f0f0; }
    .bid-table tr:last-child td { border-bottom: none; }
    .bid-table .label { color: #888; width: 55%; }
    .bid-table .value { font-weight: 600; color: #222; text-align: right; }
    .tips { background: #f8f9fa; border-radius: 8px; padding: 20px 24px; margin: 20px 0; }
    .tips h4 { font-size: 14px; color: #333; margin-bottom: 12px; }
    .tips ul { padding-left: 18px; }
    .tips ul li { font-size: 14px; color: #555; line-height: 1.8; }
    .cta-wrapper { text-align: center; margin: 28px 0 8px; }
    .cta-button { display: inline-block; background: #1a1a2e; color: #fff !important; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-size: 15px; font-weight: 600; }
    .footer { background: #f8f9fa; padding: 20px 40px; text-align: center; font-size: 12px; color: #aaa; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <span>🏠</span>
      <h1>Auction Has Ended</h1>
    </div>
    <div class="info-banner">ℹ️ This auction has concluded. Better luck next time!</div>
    <div class="body">
      <p>Hi ${name},</p>
      <p>The auction for <strong>${propertyAddress}</strong> has ended. Unfortunately you didn't win this time.</p>
      <table class="bid-table">
        <tr>
          <td class="label">Property</td>
          <td class="value">${propertyAddress}</td>
        </tr>
        <tr>
          <td class="label">Winning Bid</td>
          <td class="value">$${winningBid.toLocaleString()}</td>
        </tr>
      </table>
      <div class="tips">
        <h4>Tips for Next Time:</h4>
        <ul>
          <li>Set your maximum budget before bidding</li>
          <li>Use auto-bidding to stay competitive</li>
          <li>Research comparable property values</li>
          <li>Register early for upcoming auctions</li>
        </ul>
      </div>
      <p>There are more great properties available. Don't give up!</p>
      <div class="cta-wrapper">
        <a href="https://vihara.ai/auctions" class="cta-button">Browse More Auctions</a>
      </div>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Vihara. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
};

module.exports = getAuctionLostEmailTemplate;
