const createRealtorSubmissionApprovedEmail = (realtorName, propertyName, propertyAddress, dashboardUrl, listingUrl) => {
    const dash = dashboardUrl || "https://vihara.ai/realtor/dashboard";
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Property Is Live - Vihara</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #ffffff;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto;">
        <tr>
            <td align="center" style="padding: 30px 40px;">
                <img src="https://res.cloudinary.com/drm9blcmj/image/upload/v1768580466/vihara-new-logo_csgllk.png" alt="Vihara" width="200" style="display: block; margin: 0 auto;">
            </td>
        </tr>
        <tr>
            <td style="padding: 0 40px 30px 40px;">
                <p style="margin: 0 0 15px 0; font-size: 14px; color: #333;">Hello ${realtorName},</p>
                <p style="margin: 0 0 25px 0; font-size: 16px; font-weight: bold; color: #2ecc71;">✓ Your Property Is Now Live!</p>
                <p style="margin: 0 0 25px 0; font-size: 14px; line-height: 1.6; color: #555;">Great news! Your submission was approved and is published on Vihara — on your dashboard and on the main property listing under your name.</p>
                <div style="padding: 20px; background-color: #f0f8ff; border-left: 4px solid #2ecc71; margin-bottom: 25px;">
                    <p style="margin: 0 0 10px 0; font-weight: bold; color: #333;">${propertyName}</p>
                    <p style="margin: 0 0 12px 0; color: #555;">${propertyAddress}</p>
                    <p style="margin: 0; font-size: 13px; font-weight: bold; color: #047857;">Status: Live</p>
                </div>
                <p style="margin: 0 0 25px 0; font-size: 14px; line-height: 1.6; color: #555;">You can track leads, bids and activity from your dashboard — and share the listing with your network.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    <tr>
                        <td align="center" style="padding-bottom: 15px;">
                            <a href="${dash}" style="display: inline-block; background-color: #0384FB; color: white; padding: 15px 40px; text-decoration: none; border-radius: 4px; font-weight: bold;">Open Dashboard</a>
                        </td>
                    </tr>
                    ${listingUrl ? `<tr>
                        <td align="center" style="padding-bottom: 25px;">
                            <a href="${listingUrl}" style="font-size: 14px; color: #0384FB; text-decoration: none; font-weight: bold;">View your listing &rarr;</a>
                        </td>
                    </tr>` : ``}
                </table>
                <p style="margin: 0; font-size: 14px; color: #666;">Best regards,<br><strong>Vihara Team</strong></p>
            </td>
        </tr>
    </table>
</body>
</html>`;
};

module.exports = createRealtorSubmissionApprovedEmail;
