// src/htmlPages/careerMarketingAssignmentEmail.js
// Sent to Marketing Manager applicants instead of the generic confirmation.
// The assignment PDF is attached by careerController (see MARKETING_ASSIGNMENT_PDF).

const MARKETING_SUBMISSION_URL = "https://forms.gle/s5vzSLsMVfGk347u9";

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
  <title>Vihara Performance/Growth Marketing Manager - Your Assignment</title>
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
          Thank you for your interest in the Performance / Growth Marketing Manager role at Vihara.
        </p>

        <p style="margin:0 0 15px 0;font-size:14px;line-height:1.6;color:#555;">
          As the next step in our hiring process, we'd like you to complete a short Performance &amp; Growth Marketing Assignment.
        </p>

        <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#555;">
          The assignment is designed to understand how you approach paid acquisition, campaign strategy, creative testing,
          analytics, and growth opportunities.
        </p>

        <div style="padding:20px;background-color:#f8f9fa;border-left:4px solid #0384fb;margin-bottom:20px;">
          <p style="margin:0 0 8px 0;font-size:14px;font-weight:bold;color:#333;">Assignment Deadline</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#555;">
            Please submit your completed assignment within <strong>4 days</strong> of receiving this email.
          </p>
        </div>

        <p style="margin:0 0 15px 0;font-size:14px;line-height:1.6;color:#555;">
          Please keep your submission practical and focused. We are more interested in your thinking, strategy, assumptions,
          and approach than in creating a highly polished presentation.
        </p>

        <p style="margin:0 0 15px 0;font-size:14px;line-height:1.6;color:#555;">
          We encourage you to give this assignment your 100%. If your submission meets our expectations, we will share an
          offer letter with you within 72 hours of reviewing it.
        </p>

        <p style="margin:0 0 15px 0;font-size:14px;line-height:1.6;color:#555;">
          You may submit the assignment as a PDF, Google Doc, or presentation.
        </p>

        <p style="margin:0 0 10px 0;font-size:14px;line-height:1.6;color:#555;">
          Please submit your completed assignment using the form below.
        </p>

        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px 0;">
          <tr>
            <td style="background-color:#0384fb;border-radius:6px;">
              <a href="${MARKETING_SUBMISSION_URL}" target="_blank"
                 style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">
                Submit the assignment
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 15px 0;font-size:14px;line-height:1.6;color:#555;">
          If you have any questions regarding the assignment, feel free to reach out.
        </p>

        <p style="margin:0 0 25px 0;font-size:14px;line-height:1.6;color:#555;">
          We look forward to seeing how you approach the problem.
        </p>

        <p style="margin:0;font-size:14px;color:#666;">
          Best regards,<br><strong>Vihara Hiring Team</strong><br>
          <a href="https://www.vihara.ai" style="color:#0384fb;text-decoration:none;">www.vihara.ai</a>
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
