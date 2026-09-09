const createRealtorRequestApprovedEmail = (realtorName, propertyName, propertyAddress, dashboardUrl) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Property Request Approved - Vihara</title>
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
                <p style="margin: 0 0 20px 0; font-size: 16px; font-weight: bold; color: #2ecc71;">&#10003; Your property request was approved!</p>
                <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #555;">This property is now on your showcase, and any buyer who registers through your link will be tracked to you:</p>
                <div style="padding: 20px; background-color: #f0f8ff; border-left: 4px solid #2ecc71; margin-bottom: 25px;">
                    <p style="margin: 0 0 6px 0; font-weight: bold; color: #333;">${propertyName || "Property"}</p>
                    <p style="margin: 0; color: #555;">${propertyAddress || ""}</p>
                </div>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    <tr>
                        <td align="center" style="padding-bottom: 25px;">
                            <a href="${dashboardUrl}" style="display: inline-block; background-color: #0384FB; color: white; padding: 15px 40px; text-decoration: none; border-radius: 4px; font-weight: bold;">Open my dashboard</a>
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

module.exports = createRealtorRequestApprovedEmail;
