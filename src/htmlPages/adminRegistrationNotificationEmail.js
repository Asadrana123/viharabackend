/**
 * Email template for notifying admin when a user registers for an auction.
 * @param {Object} params
 * @param {string} params.userName
 * @param {string} params.userEmail
 * @param {string} params.phone
 * @param {string} params.buyerType
 * @param {string} params.propertyAddress
 * @param {string} params.auctionId
 * @returns {string} HTML string
 */
const getAdminRegistrationNotificationEmail = ({ userName, userEmail, phone, buyerType, propertyAddress, auctionId }) => {
  const auctionLink = `${process.env.FRONTEND_URL}/auction-bid/${auctionId}`;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>New Auction Registration</title>
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
                  <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:18px;">📋 New Auction Registration</h2>
                  <p style="margin:0 0 24px;color:#555;font-size:14px;">A user has registered for an auction and is pending approval.</p>

                  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8f0;border-radius:6px;overflow:hidden;">
                    <tr style="background-color:#f8f8fc;">
                      <td style="padding:12px 16px;color:#888;font-size:13px;width:40%;border-bottom:1px solid #e8e8f0;">Name</td>
                      <td style="padding:12px 16px;color:#1a1a2e;font-size:13px;font-weight:600;border-bottom:1px solid #e8e8f0;">${userName}</td>
                    </tr>
                    <tr>
                      <td style="padding:12px 16px;color:#888;font-size:13px;border-bottom:1px solid #e8e8f0;">Email</td>
                      <td style="padding:12px 16px;color:#1a1a2e;font-size:13px;border-bottom:1px solid #e8e8f0;">${userEmail}</td>
                    </tr>
                    <tr style="background-color:#f8f8fc;">
                      <td style="padding:12px 16px;color:#888;font-size:13px;border-bottom:1px solid #e8e8f0;">Phone</td>
                      <td style="padding:12px 16px;color:#1a1a2e;font-size:13px;border-bottom:1px solid #e8e8f0;">${phone || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td style="padding:12px 16px;color:#888;font-size:13px;border-bottom:1px solid #e8e8f0;">Buyer Type</td>
                      <td style="padding:12px 16px;color:#1a1a2e;font-size:13px;border-bottom:1px solid #e8e8f0;">${buyerType || 'N/A'}</td>
                    </tr>
                    <tr style="background-color:#f8f8fc;">
                      <td style="padding:12px 16px;color:#888;font-size:13px;border-bottom:1px solid #e8e8f0;">Property</td>
                      <td style="padding:12px 16px;color:#1a1a2e;font-size:13px;font-weight:600;border-bottom:1px solid #e8e8f0;">${propertyAddress}</td>
                    </tr>
                    <tr>
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

module.exports = getAdminRegistrationNotificationEmail;
