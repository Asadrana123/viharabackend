// htmlPages/outbound/outboundEmailLayout.js
//
// Wraps an outbound campaign email's rendered body in the same email-safe
// Vihara layout as src/htmlPages/users/welcomeEmail.js — same logo, fonts,
// colors, table structure, mobile handling, and footer — so outbound
// campaign emails look consistent with the rest of Vihara's transactional
// email, not a one-off style. Text-format bodies (the default) are
// HTML-escaped and turned into <p> paragraphs (blank-line split, <br> for
// single newlines); HTML-format bodies are inserted exactly as the admin
// wrote them.
//
// Deliberately forces light mode (`color-scheme: light`) rather than
// supporting prefers-color-scheme dark mode — welcomeEmail.js's dark-mode
// CSS only flips text to white without ever flipping any background to
// match, which makes text invisible on a dark-mode system. Not worth
// copying that bug here; light-only keeps this email readable everywhere.
//
// No unsubscribe footer link in v1 — deferred by decision, see
// outboundplan.md §10. When that's built, it goes in the footer <td> below,
// next to the existing privacy-policy line.

const LOGO_URL = "https://res.cloudinary.com/drm9blcmj/image/upload/v1768580466/vihara-new-logo_csgllk.png";

const escapeHtml = (str) =>
  String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const textToHtml = (text) =>
  String(text || "")
    .split(/\n{2,}/)
    .filter((block) => block.trim() !== "")
    .map(
      (block) =>
        `<p style="margin: 0 0 20px 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 16px; line-height: 1.6; color: #333333;" class="mobile-text">${escapeHtml(
          block
        ).replace(/\n/g, "<br>")}</p>`
    )
    .join("");

/**
 * @param {string} body - the rendered (post-{{var}}-substitution) body
 * @param {"text"|"html"} bodyFormat
 * @returns {string} full HTML document
 */
const outboundEmailLayout = (body, bodyFormat) => {
  const content = bodyFormat === "html" ? body : textToHtml(body);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no">
    <title>Vihara</title>

    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:AllowPNG/>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->

    <style type="text/css">
        body, table, td, p, a, li, blockquote {
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
        }
        table, td {
            mso-table-lspace: 0pt;
            mso-table-rspace: 0pt;
        }
        img {
            -ms-interpolation-mode: bicubic;
            max-width: 100%;
            height: auto;
            display: block;
            outline: none;
            text-decoration: none;
            border: 0;
        }
        @media only screen and (max-width: 600px) {
            .email-container { width: 100% !important; }
            .mobile-padding { padding-left: 20px !important; padding-right: 20px !important; }
            .mobile-text { font-size: 14px !important; line-height: 1.4 !important; }
            .mobile-center { text-align: center !important; }
        }
        /* Deliberately no prefers-color-scheme dark-mode block: applying it
           only to text (not background) would make text invisible against
           the still-white background — exactly the bug this file used to
           have. Force light mode instead so the email is always readable,
           regardless of the viewer's system theme. */
        :root { color-scheme: light; supported-color-schemes: light; }
    </style>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; background-color: #ffffff; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0; padding: 0; background-color: #ffffff;">
        <tr>
            <td align="center" style="padding: 0;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="email-container" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
                    <tr>
                        <td align="center" style="padding: 20px;" class="mobile-padding mobile-center">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td align="center">
                                        <img src="${LOGO_URL}"
                                             alt="Vihara.com"
                                             width="200"
                                             height="auto"
                                             style="display: block; max-width: 200px; height: auto; margin: 0 auto; border: 0; outline: none; text-decoration: none;">
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td bgcolor="#ffffff" style="padding: 40px; background-color: #ffffff;" class="mobile-padding">
                            ${content}
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 0 20px 30px;" class="mobile-padding">
                            <p style="margin: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 12px; line-height: 1.4; color: #d1d5db; text-align: center;" class="mobile-text">
                                We respect your right to privacy. View our policy
                                <a href="https://www.vihara.ai/privacy-statement" style="color: #d1d5db; text-decoration: underline;">here</a>.
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

module.exports = { outboundEmailLayout };
