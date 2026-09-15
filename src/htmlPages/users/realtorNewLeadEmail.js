const createRealtorNewLeadEmail = (realtorName, buyerName, buyerType, propertyAddress, dashboardUrl) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Lead - Vihara</title>
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
                <p style="margin: 0 0 20px 0; font-size: 16px; font-weight: bold; color: #2ecc71;">&#127881; You have a new lead!</p>
                <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #555;">A buyer registered for an auction through your showcase. Here are the details:</p>
                <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8f0;border-radius:6px;overflow:hidden;margin-bottom:25px;">
                    <tr style="background-color:#f8f8fc;">
                        <td style="padding:12px 16px;color:#888;font-size:13px;width:40%;border-bottom:1px solid #e8e8f0;">Buyer</td>
                        <td style="padding:12px 16px;color:#1a1a2e;font-size:13px;font-weight:600;border-bottom:1px solid #e8e8f0;">${buyerName || "New buyer"}</td>
                    </tr>
                    <tr>
                        <td style="padding:12px 16px;color:#888;font-size:13px;border-bottom:1px solid #e8e8f0;">Buyer type</td>
                        <td style="padding:12px 16px;color:#1a1a2e;font-size:13px;border-bottom:1px solid #e8e8f0;">${buyerType || "&mdash;"}</td>
                    </tr>
                    <tr style="background-color:#f8f8fc;">
                        <td style="padding:12px 16px;color:#888;font-size:13px;">Property</td>
                        <td style="padding:12px 16px;color:#1a1a2e;font-size:13px;">${propertyAddress || "&mdash;"}</td>
                    </tr>
                </table>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    <tr>
                        <td align="center" style="padding-bottom: 25px;">
                            <a href="${dashboardUrl}" style="display: inline-block; background-color: #0384FB; color: white; padding: 15px 40px; text-decoration: none; border-radius: 4px; font-weight: bold;">View in dashboard</a>
                        </td>
                    </tr>
                </table>
                <p style="margin: 0; font-size: 14px; color: #666;">Best regards,<br><strong>Vihara Team</strong></p>
            </td>
        </tr>
    </table>
</body>
</html>`;
};

module.exports = createRealtorNewLeadEmail;
