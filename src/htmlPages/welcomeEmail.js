const createWelcomeEmail = (newUser, clientUrl) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no">
    <title>Welcome to Vihara</title>
    
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
            .mobile-button { padding: 12px 30px !important; font-size: 14px !important; }
            .mobile-center { text-align: center !important; }
            .footer-logo-section { padding-bottom: 20px !important; }
            .social-icons-row td { display: block !important; text-align: center !important; padding-bottom: 10px !important; }
        }
        @media (prefers-color-scheme: dark) {
            .dark-mode-bg { background-color: #1e1e1e !important; }
            .dark-mode-text { color: #ffffff !important; }
        }
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
                                        <img src="https://res.cloudinary.com/drm9blcmj/image/upload/v1768580466/vihara-new-logo_csgllk.png" 
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
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                    <td style="padding-bottom: 30px;">
                                        <h1 style="margin: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 22px; font-weight: normal; color: #333333; line-height: 1.3;" class="dark-mode-text">
                                            Welcome to Vihara ${newUser.name}.
                                        </h1>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding-bottom: 30px;">
                                        <p style="margin: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 16px; line-height: 1.5; color: #333333;" class="mobile-text dark-mode-text">
                                            Your username is: 
                                            <a href="mailto:${newUser.email}" style="color: #4A90E2; text-decoration: none;">${newUser.email}</a>
                                        </p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding-bottom: 40px;">
                                        <p style="margin: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 16px; line-height: 1.6; color: #333333;" class="mobile-text dark-mode-text">
                                            Now that you have registered on 
                                            <a href="https://vihara.ai" style="color: #0384FB; text-decoration: none;">vihara.ai</a>, 
                                            you have access to your own personal dashboard to save searches and properties, share your favorites, receive notifications when there is a price or status change, and more!
                                        </p>
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center" style="padding-bottom: 40px;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                            <tr>
                                                <td align="center" bgcolor="#0384FB" style="border-radius: 4px; background-color: #0384FB;">
                                                    <a href="${clientUrl}" 
                                                       style="display: inline-block; padding: 15px 40px; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 16px; font-weight: bold; color: #ffffff; text-decoration: none; border-radius: 4px; -webkit-text-size-adjust: none; mso-padding-alt: 0; box-sizing: border-box;" 
                                                       class="mobile-button">
                                                        <!--[if mso]><i style="letter-spacing: 40px; mso-font-width: -100%; mso-text-raise: 20pt;">&nbsp;</i><![endif]-->
                                                        <span style="mso-text-raise: 10pt;">Get Started</span>
                                                        <!--[if mso]><i style="letter-spacing: 40px; mso-font-width: -100%;">&nbsp;</i><![endif]-->
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding-bottom: 15px;">
                                        <p style="margin: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 16px; line-height: 1.5; color: #333333;" class="mobile-text dark-mode-text">
                                            Need help? Our 
                                            <a href="mailto:trisha@vihara.ai" style="color: #0384FB; text-decoration: none;">customer service</a> 
                                            team is here to help.
                                        </p>
                                    </td>
                                </tr>
                                <tr>
                                    <td>
                                        <p style="margin: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 16px; line-height: 1.5; color: #333333;" class="mobile-text dark-mode-text">
                                            Thank you for choosing Vihara.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td bgcolor="#4a5568" style="padding: 30px 40px; background-color: #4a5568;" class="mobile-padding">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                    <td class="footer-logo-section" style="padding-bottom: 20px;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                            <tr>
                                                <td align="left" valign="middle" style="width: 50%;">
                                                    <img src="https://res.cloudinary.com/my1chatapp/image/upload/v1758125574/XmHome_yfauw5.png" 
                                                         alt="Equal Housing" 
                                                         width="40" 
                                                         height="40"
                                                         style="display: block; border: 0; outline: none; text-decoration: none;">
                                                </td>
                                                <td align="right" valign="middle" style="width: 50%;">
                                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0;">
                                                        <tr class="social-icons-row">
                                                            <td style="padding: 0 5px;">
                                                                <a href="https://www.facebook.com/profile.php?id=61556248807076" style="display: inline-block; text-decoration: none;">
                                                                    <img src="https://res.cloudinary.com/my1chatapp/image/upload/v1758121455/FbIcon_edgimr.png" alt="Facebook" width="40" height="40" style="display: block; border: 0; outline: none; text-decoration: none; border-radius: 50%;">
                                                                </a>
                                                            </td>
                                                            <td style="padding: 0 5px;">
                                                                <a href="https://www.instagram.com/vihara.ai/" style="display: inline-block; text-decoration: none;">
                                                                    <img src="https://res.cloudinary.com/my1chatapp/image/upload/v1768646620/insta-icon_yab7b2.webp" alt="Instagram" width="40" height="40" style="display: block; border: 0; outline: none; text-decoration: none; border-radius: 50%;">
                                                                </a>
                                                            </td>
                                                            <td style="padding: 0 5px;">
                                                                <a href="https://www.linkedin.com/company/vihara-ai/" style="display: inline-block; text-decoration: none;">
                                                                    <img src="https://res.cloudinary.com/my1chatapp/image/upload/v1758121456/LdIcon_rvaqhn.png" alt="LinkedIn" width="40" height="40" style="display: block; border: 0; outline: none; text-decoration: none; border-radius: 50%;">
                                                                </a>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding-bottom: 15px;">
                                        <p style="margin: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 12px; line-height: 1.4; color: #d1d5db; text-align: center;" class="mobile-text">
                                            RL Auction Inc.<br>1335 S Milpitas Blvd, Milpitas, California 95035.
                                        </p>
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center">
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
            </td>
        </tr>
    </table>
</body>
</html>`;
};

module.exports = createWelcomeEmail;
