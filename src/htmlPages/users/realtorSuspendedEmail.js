const createRealtorSuspendedEmail = (realtorName, note) => {
  const noteBlock = note
    ? `<div style="padding: 16px 20px; background-color: #fff8f0; border-left: 4px solid #f0a020; margin-bottom: 25px; color: #555; font-size: 14px;">${note}</div>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Realtor Account Suspended - Vihara</title>
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
                <p style="margin: 0 0 20px 0; font-size: 16px; font-weight: bold; color: #333;">Your realtor account has been suspended</p>
                <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #555;">Your Vihara realtor account has been temporarily suspended. While suspended, your showcase page and dashboard access are paused.</p>
                ${noteBlock}
                <p style="margin: 0 0 20px 0; font-size: 14px; color: #666;">Please contact our team if you have any questions or would like to restore your account.</p>
                <p style="margin: 0; font-size: 14px; color: #666;">Best regards,<br><strong>Vihara Team</strong></p>
            </td>
        </tr>
    </table>
</body>
</html>`;
};

module.exports = createRealtorSuspendedEmail;
