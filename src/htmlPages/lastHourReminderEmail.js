// htmlPages/lastHourReminderEmail.js

/**
 * @param {Object} params
 * @param {string} params.name - Bidder's name
 * @param {string} params.propertyAddress - Property address string
 * @param {number} params.currentBid - Current highest bid amount
 * @param {string} params.auctionLink - Link to the auction room
 * @param {Date|string} params.endTime - Auction end time
 */
function getLastHourReminderEmailTemplate({ name, propertyAddress, currentBid, auctionLink, endTime }) {
  const formattedBid = currentBid
    ? `$${Number(currentBid).toLocaleString('en-US')}`
    : 'No bids yet';

  const formattedEndTime = endTime
    ? new Date(endTime).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/Chicago'
      })
    : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>1 Hour Left to Bid</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#1a1a2e;padding:28px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;letter-spacing:1px;">VIHARA</h1>
              <p style="margin:6px 0 0;color:#a0a0b0;font-size:13px;">Real Estate Auctions</p>
            </td>
          </tr>

          <!-- Urgency Banner -->
          <tr>
            <td style="background:#e85d04;padding:14px 40px;text-align:center;">
              <p style="margin:0;color:#ffffff;font-size:16px;font-weight:bold;letter-spacing:0.5px;">
                ⏰ Only 1 Hour Left — Don't Miss Out!
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 16px;color:#333333;font-size:15px;">Hi ${name},</p>
              <p style="margin:0 0 24px;color:#555555;font-size:15px;line-height:1.6;">
                The auction for <strong>${propertyAddress}</strong> is closing in
                <strong>1 hour</strong>. This is your last chance to place or update your bid.
              </p>

              <!-- Bid Info Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f8;border:1px solid #e0e0e0;border-radius:6px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 8px;color:#888888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Current Highest Bid</p>
                    <p style="margin:0 0 16px;color:#1a1a2e;font-size:28px;font-weight:bold;">${formattedBid}</p>
                    ${formattedEndTime ? `<p style="margin:0;color:#888888;font-size:13px;">Auction ends: <strong style="color:#555;">${formattedEndTime} CT</strong></p>` : ''}
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${auctionLink}"
                      style="display:inline-block;background:#e85d04;color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:6px;font-size:15px;font-weight:bold;letter-spacing:0.5px;">
                      Place Your Bid Now →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:28px 0 0;color:#888888;font-size:13px;text-align:center;line-height:1.6;">
                If you have any questions, reply to this email or visit
                <a href="https://vihara.ai" style="color:#e85d04;">vihara.ai</a>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f0f0f0;padding:20px 40px;text-align:center;border-top:1px solid #e0e0e0;">
              <p style="margin:0;color:#aaaaaa;font-size:12px;">
                © ${new Date().getFullYear()} Vihara. All rights reserved.<br/>
                You are receiving this email because you registered for this auction.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

module.exports = getLastHourReminderEmailTemplate;
