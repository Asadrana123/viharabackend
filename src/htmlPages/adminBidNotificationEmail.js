/**
 * Email template for notifying admin when a new bid is placed.
 * @param {Object} params
 * @param {string} params.bidderName
 * @param {number} params.bidAmount
 * @param {string} params.auctionId
 * @param {number} params.currentBid
 * @param {number} params.participants
 * @returns {string} HTML string
 */
const getAdminBidNotificationEmail = ({ bidderName, bidAmount, auctionId, currentBid, participants }) => {
  const formattedBid = `$${Number(bidAmount).toLocaleString('en-US')}`;
  const formattedCurrent = `$${Number(currentBid || bidAmount).toLocaleString('en-US')}`;
  const auctionLink = `https://www.vihara.ai/auction-bid/${auctionId}`;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>New Bid Alert</title>
    </head>
    <body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:32px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

              <!-- Header -->
              <tr>
                <td style="background-color:#1a1a2e;padding:24px 32px;">
                  <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Vihara</h1>
                  <p style="margin:4px 0 0;color:#a0a0b8;font-size:13px;">Admin Notification</p>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:32px;">
                  <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:18px;">🔔 New Bid Placed</h2>
                  <p style="margin:0 0 24px;color:#555;font-size:14px;">A new bid has been placed on an active auction.</p>

                  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8f0;border-radius:6px;overflow:hidden;">
                    <tr style="background-color:#f8f8fc;">
                      <td style="padding:12px 16px;color:#888;font-size:13px;width:40%;border-bottom:1px solid #e8e8f0;">Bidder</td>
                      <td style="padding:12px 16px;color:#1a1a2e;font-size:13px;font-weight:600;border-bottom:1px solid #e8e8f0;">${bidderName}</td>
                    </tr>
                    <tr>
                      <td style="padding:12px 16px;color:#888;font-size:13px;border-bottom:1px solid #e8e8f0;">Bid Amount</td>
                      <td style="padding:12px 16px;color:#2e7d32;font-size:15px;font-weight:700;border-bottom:1px solid #e8e8f0;">${formattedBid}</td>
                    </tr>
                    <tr style="background-color:#f8f8fc;">
                      <td style="padding:12px 16px;color:#888;font-size:13px;border-bottom:1px solid #e8e8f0;">Current High Bid</td>
                      <td style="padding:12px 16px;color:#1a1a2e;font-size:13px;font-weight:600;border-bottom:1px solid #e8e8f0;">${formattedCurrent}</td>
                    </tr>
                    <tr>
                      <td style="padding:12px 16px;color:#888;font-size:13px;border-bottom:1px solid #e8e8f0;">Active Participants</td>
                      <td style="padding:12px 16px;color:#1a1a2e;font-size:13px;border-bottom:1px solid #e8e8f0;">${participants || 'N/A'}</td>
                    </tr>
                    <tr style="background-color:#f8f8fc;">
                      <td style="padding:12px 16px;color:#888;font-size:13px;">Auction ID</td>
                      <td style="padding:12px 16px;color:#1a1a2e;font-size:12px;word-break:break-all;">${auctionId}</td>
                    </tr>
                  </table>

                  <div style="margin-top:24px;text-align:center;">
                    <a href="${auctionLink}" style="display:inline-block;background-color:#1a1a2e;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">View Auction</a>
                  </div>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color:#f8f8fc;padding:16px 32px;border-top:1px solid #e8e8f0;">
                  <p style="margin:0;color:#aaa;font-size:12px;text-align:center;">This is an automated notification from Vihara. Do not reply to this email.</p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

module.exports = getAdminBidNotificationEmail;
