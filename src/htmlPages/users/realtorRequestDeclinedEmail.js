const createRealtorRequestDeclinedEmail = (realtorName, propertyName, propertyAddress, note) => {
  const noteBlock = note
    ? `<div style="padding: 16px 20px; background-color: #f8f9fa; border-left: 4px solid #e0e0e0; margin: 0 0 25px 0; color: #555; font-size: 14px;">${note}</div>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Property Request Update - Vihara</title>
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
                <p style="margin: 0 0 20px 0; font-size: 16px; font-weight: bold; color: #333;">Update on your property request</p>
                <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #555;">Your request for the following property was not approved at this time:</p>
                <div style="padding: 20px; background-color: #f8f9fa; border-left: 4px solid #0384FB; margin-bottom: 25px;">
                    <p style="margin: 0 0 6px 0; font-weight: bold; color: #333;">${propertyName || "Property"}</p>
                    <p style="margin: 0; color: #555;">${propertyAddress || ""}</p>
                </div>
                ${noteBlock}
                <p style="margin: 0 0 20px 0; font-size: 14px; color: #666;">You can browse and request other properties from your dashboard anytime.</p>
                <p style="margin: 0; font-size: 14px; color: #666;">Best regards,<br><strong>Vihara Team</strong></p>
            </td>
        </tr>
    </table>
</body>
</html>`;
};

module.exports = createRealtorRequestDeclinedEmail;
