// src/htmlPages/careerAdminNotificationEmail.js

/**
 * @param {object} application  - the saved CareerApplication document
 * @param {string} roleLabel    - human-readable role name
 * @returns {string} HTML string
 */
const careerAdminNotificationEmail = (application, roleLabel) => {
  const isMarketing = application.role === "marketing-manager";

  const row = (label, value) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#64748b;width:42%;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#0f172a;font-weight:500;">${value || "—"}</td>
    </tr>`;

  const qaRow = (label, value) => value ? `
    <tr>
      <td colspan="2" style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
        <p style="margin:0 0 4px 0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">${label}</p>
        <p style="margin:0;font-size:14px;color:#0f172a;line-height:1.6;">${value}</p>
      </td>
    </tr>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Career Application - Vihara Admin</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;background-color:#f4f6f9;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f4f6f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600"
               style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#0384fb;padding:28px 36px;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">New Career Application</p>
              <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Vihara Admin Notification</p>
            </td>
          </tr>

          <!-- Applicant summary -->
          <tr>
            <td style="padding:32px 36px 0;">
              <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:#0f172a;">
                ${application.firstName} ${application.lastName}
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#0384fb;font-weight:600;">
                Applied for: ${roleLabel}
              </p>

              <!-- Basic info table -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                ${row("Email", application.email)}
                ${row("Phone", application.phone)}
                ${row("LinkedIn", application.linkedinUrl ? `<a href="${application.linkedinUrl}" style="color:#0384fb;">${application.linkedinUrl}</a>` : null)}
                ${row("Portfolio", application.portfolioUrl ? `<a href="${application.portfolioUrl}" style="color:#0384fb;">${application.portfolioUrl}</a>` : null)}
                ${row("Resume", `<a href="${application.resumeLink}" style="color:#0384fb;">View Resume</a>`)}
                ${row("CTC", application.currentExpectedCTC)}
                ${row("Available immediately", application.availableImmediately)}
              </table>
            </td>
          </tr>

          <!-- Q&A section -->
          <tr>
            <td style="padding:24px 36px 0;">
              <p style="margin:0 0 16px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;padding-bottom:12px;border-bottom:1px solid #e2e8f0;">
                Application Questions
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                ${!isMarketing ? qaRow("Technical Skills", application.technicalSkills) : ""}
                ${!isMarketing ? qaRow("MERN & Figma Rating", application.mernAndFigmaRating) : ""}
                ${qaRow("Project they're most proud of", application.proudProject)}
                ${qaRow("Free time learning", application.freeTimeLearning)}
                ${qaRow("Person / company they admire", application.admirePerson)}
                ${qaRow("One world-class skill", application.worldClassSkill)}
                ${qaRow("Most controversial opinion", application.controversialOpinion)}
                ${qaRow("Comfortable with schedule", application.comfortableSchedule)}
                ${qaRow("Can join immediately", application.joinImmediately)}
                ${isMarketing ? qaRow("Most successful campaign", application.successfulCampaign) : ""}
                ${isMarketing ? qaRow("Creative growth strategy", application.creativeGrowthStrategy) : ""}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 36px;border-top:1px solid #e2e8f0;margin-top:24px;">
              <p style="margin:0;font-size:13px;color:#94a3b8;">
                View full application in the Admin Panel → Careers tab
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

module.exports = careerAdminNotificationEmail;
