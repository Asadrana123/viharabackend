const createRealtorSubmissionReceivedEmail = (realtorName, propertyName, propertyAddress) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Property Submission Received - Vihara</title>
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
                <p style="margin: 0 0 25px 0; font-size: 16px; font-weight: bold; color: #0384FB;">We've received your property submission</p>
                <p style="margin: 0 0 25px 0; font-size: 14px; line-height: 1.6; color: #555;">Thanks for submitting a property to Vihara. Our team reviews every listing for ownership, compliance and details before it goes live.</p>
                <div style="padding: 20px; background-color: #f0f8ff; border-left: 4px solid #0384FB; margin-bottom: 25px;">
                    <p style="margin: 0 0 10px 0; font-weight: bold; color: #333;">${propertyName}</p>
                    <p style="margin: 0 0 12px 0; color: #555;">${propertyAddress}</p>
                    <p style="margin: 0; font-size: 13px; font-weight: bold; color: #b45309;">Status: Pending review</p>
                </div>
                <p style="margin: 0 0 25px 0; font-size: 14px; line-height: 1.6; color: #555;">We'll email you as soon as it's approved and live — or if we need any changes. You can track its status anytime from your dashboard.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    <tr>
                        <td align="center" style="padding-bottom: 25px;">
                            <a href="https://vihara.ai/realtor/dashboard" style="display: inline-block; background-color: #0384FB; color: white; padding: 15px 40px; text-decoration: none; border-radius: 4px; font-weight: bold;">Go to Dashboard</a>
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

module.exports = createRealtorSubmissionReceivedEmail;
