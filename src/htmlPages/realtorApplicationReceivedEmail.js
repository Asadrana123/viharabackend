const createRealtorApplicationReceivedEmail = (realtorName) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Realtor Application Received - Vihara</title>
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
                <p style="margin: 0 0 25px 0; font-size: 16px; font-weight: bold; color: #333;">Your realtor application has been received</p>
                <p style="margin: 0 0 25px 0; font-size: 14px; line-height: 1.6; color: #555;">Thanks for applying to become a Vihara realtor partner. Our team reviews every application, and you'll receive an email as soon as your account is approved. Once approved, you'll get your own showcase page and a dashboard to track your leads and auction activity.</p>
                <p style="margin: 0 0 20px 0; font-size: 14px; color: #666;">We'll be in touch soon.</p>
                <p style="margin: 0; font-size: 14px; color: #666;">Best regards,<br><strong>Vihara Team</strong></p>
            </td>
        </tr>
    </table>
</body>
</html>`;
};

module.exports = createRealtorApplicationReceivedEmail;
