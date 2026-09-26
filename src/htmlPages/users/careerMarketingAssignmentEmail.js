// src/htmlPages/careerMarketingAssignmentEmail.js
// Sent to Marketing Manager applicants instead of the generic confirmation.
// The assignment PDF is attached by careerController (see MARKETING_ASSIGNMENT_PDF).

/**
 * @param {string} firstName
 * @returns {string} HTML string
 */
const careerMarketingAssignmentEmail = (firstName) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vihara Marketing Manager - Your Assignment</title>
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

        <p style="margin:0 0 15px 0;font-size:14px;line-height:1.6;color:#555;">
          Thanks for applying to the Marketing Manager role at Vihara, and for taking the time to share your background.
        </p>

        <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#555;">
          Next step is the assignment attached. It's built around a real scenario: you joining as Marketing Manager tomorrow,
          with Meta as our primary channel today, and your job is to show us how you'd audit, build, test, and scale from there,
          including a real measurement problem we've actually run into.
        </p>

        <div style="padding:20px;background-color:#f8f9fa;border-left:4px solid #0384fb;margin-bottom:20px;">
          <p style="margin:0 0 8px 0;font-size:14px;font-weight:bold;color:#333;">What to send back:</p>
          <ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.6;color:#555;">
            <li>An 8 to 12 slide deck covering the assignment</li>
            <li>A short 5 to 8 minute walkthrough (Loom or similar) talking through your thinking</li>
          </ul>
        </div>

        <p style="margin:0 0 15px 0;font-size:14px;line-height:1.6;color:#555;">
          The deck shows us the output. The walkthrough is how we actually judge the thinking behind it, so please don't skip it.
        </p>

        <p style="margin:0 0 15px 0;font-size:14px;line-height:1.6;color:#555;">
          Please submit within <strong>5 days</strong> of this email.
        </p>

        <p style="margin:0 0 15px 0;font-size:14px;line-height:1.6;color:#555;">
          Questions on the assignment? Just write to
          <a href="mailto:info@vihara.ai" style="color:#0384fb;text-decoration:none;">info@vihara.ai</a>.
        </p>

        <p style="margin:0 0 25px 0;font-size:14px;line-height:1.6;color:#555;">
          Looking forward to seeing how you think.
        </p>

        <p style="margin:0;font-size:14px;color:#666;">
          Best,<br><strong>The Vihara Team</strong>
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

module.exports = careerMarketingAssignmentEmail;
