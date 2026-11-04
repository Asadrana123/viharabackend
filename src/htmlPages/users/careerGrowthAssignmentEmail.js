// src/htmlPages/users/careerGrowthAssignmentEmail.js
// Sent to Growth Manager applicants instead of the generic confirmation.
// The assignment PDF is attached by careerController (see GROWTH_ASSIGNMENT_PDF).
// Candidates submit by replying to this email, as the PDF asks.

/**
 * @param {string} firstName
 * @returns {string} HTML string
 */
const careerGrowthAssignmentEmail = (firstName) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vihara Growth Manager - Your Assignment</title>
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
          Thank you for applying for the Growth Manager role at Vihara.
        </p>

        <p style="margin:0 0 15px 0;font-size:14px;line-height:1.6;color:#555;">
          The next step is a take-home assignment: <strong>Build Vihara's buyer growth engine</strong>.
          The full brief is attached as a PDF.
        </p>

        <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#555;">
          We want to see how you read a market, find many ways to grow, connect them into one system,
          pick your bets, and ship something yourself.
        </p>

        <div style="padding:20px;background-color:#f8f9fa;border-left:4px solid #0384fb;margin-bottom:20px;">
          <p style="margin:0 0 8px 0;font-size:14px;font-weight:bold;color:#333;">Deadline</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#555;">
            Please send your work within <strong>72 hours</strong> of receiving this email.
            If you need more time, ask before the deadline.
          </p>
        </div>

        <p style="margin:0 0 8px 0;font-size:14px;font-weight:bold;color:#333;">What to send</p>
        <ol style="margin:0 0 20px 0;padding-left:20px;font-size:14px;line-height:1.6;color:#555;">
          <li>A doc or deck (12 pages or slides max) covering parts A to C.</li>
          <li>Your growth system diagram (any tool, even a photo of paper).</li>
          <li>A spreadsheet with your plays, funnel model and loop math.</li>
          <li>Your part D asset.</li>
        </ol>

        <p style="margin:0 0 15px 0;font-size:14px;line-height:1.6;color:#555;">
          <strong>To submit, just reply to this email</strong> with your files or links.
          Shared links are fine, please give view access.
        </p>

        <p style="margin:0 0 15px 0;font-size:14px;line-height:1.6;color:#555;">
          Please keep the brief private. Don't share it, contact our customers or run ads for Vihara.
          We won't use your work unless we hire you.
        </p>

        <p style="margin:0 0 25px 0;font-size:14px;line-height:1.6;color:#555;">
          If you have any questions, reply to this email. We look forward to seeing your plan.
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

module.exports = careerGrowthAssignmentEmail;
