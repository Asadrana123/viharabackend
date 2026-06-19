// src/htmlPages/careerApplicantEmail.js

/**
 * @param {string} firstName
 * @param {string} roleLabel
 * @returns {string} HTML string
 */
const careerApplicantEmail = (firstName, roleLabel) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Application Received - Vihara</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;background-color:#ffffff;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;">

    <!-- Logo -->
    <tr>
      <td align="center" style="padding:30px 40px;">
        <img src="https://res.cloudinary.com/drm9blcmj/image/upload/v1768580466/vihara-new-logo_csgllk.png"
             alt="Vihara" width="200"
             style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;">
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding:0 40px 30px 40px;">
        <p style="margin:0 0 15px 0;font-size:14px;color:#333;">Hi ${firstName},</p>

        <p style="margin:0 0 20px 0;font-size:16px;font-weight:bold;color:#333;">
          We've received your application!
        </p>

        <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#555;">
          Thank you for applying for the
          <strong style="color:#0384fb;">${roleLabel}</strong>
          position at Vihara. Our team will carefully review your application.
        </p>

        <div style="padding:20px;background-color:#f8f9fa;border-left:4px solid #0384fb;margin-bottom:25px;">
          <p style="margin:0;font-size:14px;line-height:1.6;color:#555;">
            If your profile matches what we're looking for, someone from our team will reach out
            directly. This typically takes <strong>5–7 business days</strong>.
          </p>
        </div>

        <p style="margin:0 0 25px 0;font-size:14px;line-height:1.6;color:#555;">
          In the meantime, feel free to explore more at
          <a href="https://www.vihara.ai" style="color:#0384fb;text-decoration:none;">vihara.ai</a>.
        </p>

        <p style="margin:0;font-size:14px;color:#666;">
          Best regards,<br><strong>Trisha at Vihara</strong>
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding:20px 40px;border-top:1px solid #e2e8f0;">
        <p style="margin:0;font-size:12px;color:#d1d5db;text-align:center;">
          © ${new Date().getFullYear()} Vihara · RL Auction Inc. · All rights reserved.<br>
          We respect your right to privacy. View our policy
          <a href="https://www.vihara.ai/privacy-statement" style="color:#d1d5db;text-decoration:underline;">here</a>.
        </p>
      </td>
    </tr>

  </table>
</body>
</html>`;
};

module.exports = careerApplicantEmail;
