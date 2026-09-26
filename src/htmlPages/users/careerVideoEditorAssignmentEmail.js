// src/htmlPages/careerVideoEditorAssignmentEmail.js
// Sent to Video Editor applicants instead of the generic confirmation.
// The listing photos and brief live behind VIDEO_EDITOR_ASSIGNMENT_URL (no attachment).

const VIDEO_EDITOR_ASSIGNMENT_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSd9J4TQUsBP7UghqgOy5GZ5DmLk2uAkq6BUmzmp7Rd3qRhksw/viewform";

/**
 * @param {string} firstName
 * @returns {string} HTML string
 */
const careerVideoEditorAssignmentEmail = (firstName) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vihara Video Editor, Test Assignment</title>
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

        <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#555;">
          Thanks for reaching out and sharing your portfolio. Excited to see what you can do with a real brief.
        </p>

        <p style="margin:0 0 10px 0;font-size:16px;font-weight:bold;color:#333;">The assignment</p>

        <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#555;">
          The listing photos for one of our current NorCal properties are in the assignment link below. We don't have any
          video footage for this property, just images, so the challenge is building a complete video from stills alone.
        </p>

        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 25px 0;">
          <tr>
            <td style="background-color:#0384fb;border-radius:6px;">
              <a href="${VIDEO_EDITOR_ASSIGNMENT_URL}" target="_blank"
                 style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">
                Open the assignment
              </a>
            </td>
          </tr>
        </table>

        <div style="padding:20px;background-color:#f8f9fa;border-left:4px solid #0384fb;margin-bottom:20px;">
          <p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;color:#555;">
            <strong style="color:#333;">Deliverable:</strong> One 15 to 30 second vertical (9:16) property ad, using any one
            (or a mix) of these approaches:
          </p>
          <ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.6;color:#555;">
            <li><strong>AI UGC-style:</strong> an AI avatar or voice "touring" the property from the images, casual and authentic in tone</li>
            <li><strong>Full AI-generated:</strong> AI video tools animate the stills into a cinematic walkthrough</li>
            <li><strong>Motion graphics:</strong> parallax/Ken Burns-style movement, text overlays, and music, no AI avatar needed</li>
          </ul>
        </div>

        <p style="margin:0 0 15px 0;font-size:14px;line-height:1.6;color:#555;">
          <strong style="color:#333;">What we're looking for:</strong> a hook in the first 3 seconds, a real story arc
          (not a photo slideshow), pacing built for paid social, and something that would actually stop the scroll in-feed.
        </p>

        <p style="margin:0 0 15px 0;font-size:14px;line-height:1.6;color:#555;">
          <strong style="color:#333;">Deadline:</strong> Please send your final file back within <strong>4 days</strong> of this email.
        </p>

        <p style="margin:0 0 15px 0;font-size:14px;line-height:1.6;color:#555;">
          <strong style="color:#333;">Compensation:</strong> If we like the output, we'll pay you for the assignment
          regardless of whether we move forward with the role.
        </p>

        <p style="margin:0 0 25px 0;font-size:14px;line-height:1.6;color:#555;">
          Let us know if you have any questions on the property or the brief. Looking forward to seeing what you create.
        </p>

        <p style="margin:0;font-size:14px;color:#666;">
          Best,<br><strong>Prajwal</strong><br>Vihara
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

module.exports = careerVideoEditorAssignmentEmail;
