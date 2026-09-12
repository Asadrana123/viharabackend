const createRealtorSubmissionRejectedEmail = (realtorName, propertyName, propertyAddress, note) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Update On Your Submission - Vihara</title>
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
                <p style="margin: 0 0 25px 0; font-size: 16px; font-weight: bold; color: #e74c3c;">Update On Your Submission</p>
                <p style="margin: 0 0 25px 0; font-size: 14px; line-height: 1.6; color: #555;">Thank you for submitting your property. After review, we're not able to publish this one at the moment.</p>
                <div style="padding: 20px; background-color: #f0f8ff; border-left: 4px solid #e74c3c; margin-bottom: 25px;">
                    <p style="margin: 0 0 10px 0; font-weight: bold; color: #333;">${propertyName}</p>
                    <p style="margin: 0 0 12px 0; color: #555;">${propertyAddress}</p>
                    <p style="margin: 0; font-size: 13px; font-weight: bold; color: #b91c1c;">Status: Not approved</p>
                </div>
                ${note ? `<div style="padding: 18px 20px; background-color: #f7f8fa; border: 1px solid #eceef1; border-radius: 4px; margin-bottom: 25px;">
                    <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.4px; color: #98a2b3;">Reason</p>
                    <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #444; white-space: pre-wrap;">${note}</p>
                </div>` : ``}
                <p style="margin: 0 0 25px 0; font-size: 14px; line-height: 1.6; color: #555;">If you believe this was a mistake or you'd like guidance on resubmitting, just reply to this email and our team will help.</p>
                <p style="margin: 0; font-size: 14px; color: #666;">Best regards,<br><strong>Vihara Team</strong></p>
            </td>
        </tr>
    </table>
</body>
</html>`;
};

module.exports = createRealtorSubmissionRejectedEmail;
