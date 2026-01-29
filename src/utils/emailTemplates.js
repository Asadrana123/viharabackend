// utils/emailTemplates.js
const createPasswordResetEmail = (userName, resetUrl) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no">
    <title>Reset Your Password - Vihara</title>
    
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
        /* Reset and base styles */
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
        }
        
        /* Media queries for responsive design */
        @media only screen and (max-width: 480px) {
            .email-container {
                width: 100% !important;
            }
            
            .mobile-padding {
                padding-left: 20px !important;
                padding-right: 20px !important;
            }
            
            .mobile-text {
                font-size: 14px !important;
                line-height: 1.4 !important;
            }
            
            .mobile-button {
                padding: 12px 24px !important;
                font-size: 14px !important;
            }
            
            .mobile-center {
                text-align: center !important;
            }
        }
        
        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
            .dark-mode-bg {
                background-color: #1e1e1e !important;
            }
            .dark-mode-text {
                color: #ffffff !important;
            }
        }
        
        /* Outlook specific styles */
        <!--[if mso]>
        .fallback-font {
            font-family: Arial, sans-serif !important;
        }
        <![endif]-->
    </style>
</head>

<body style="margin: 0; padding: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; background-color: #ffffff; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
    
    <!-- Main Email Container -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0; padding: 0; background-color: #ffffff;">
        <tr>
            <td align="center" style="padding: 0;">
                
                <!-- Email Content Container - 600px max width -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="email-container" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
                    
                    <!-- Header Section with Logo -->
                    <tr>
                        <td align="center" bgcolor="#ffffff" style="padding: 30px 40px; background-color: #ffffff;" class="mobile-padding">
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
                    
                    <!-- Main Content Section -->
                    <tr>
                        <td bgcolor="#ffffff" style="padding: 0 40px 30px 40px; background-color: #ffffff;" class="mobile-padding">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                
                                <!-- Greeting -->
                                <tr>
                                    <td style="padding-bottom: 15px;">
                                        <p style="margin: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 14px; line-height: 1.4; color: #333333;" class="mobile-text dark-mode-text">
                                            Hello ${userName},
                                        </p>
                                    </td>
                                </tr>
                                
                                <!-- Main Message -->
                                <tr>
                                    <td style="padding-bottom: 25px;">
                                        <p style="margin: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 14px; line-height: 1.5; color: #333333;" class="mobile-text dark-mode-text">
                                            Please click the link below to update your 
                                            <a href="https://vihara.ai" style="color: #4A90E2; text-decoration: none;">Vihara.ai</a> 
                                            account password.
                                        </p>
                                    </td>
                                </tr>
                                
                                <!-- Reset Button Section -->
                                <tr>
                                    <td align="center" style="padding: 20px 0;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                            <tr>
                                                <td align="center" bgcolor="#4A90E2" style="border-radius: 4px; background-color: #4A90E2;">
                                                    <a href="${resetUrl}" 
                                                       style="display: inline-block; padding: 12px 30px; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 14px; font-weight: bold; color: #ffffff; text-decoration: none; border-radius: 4px; -webkit-text-size-adjust: none; mso-padding-alt: 0; box-sizing: border-box;" 
                                                       class="mobile-button">
                                                        <!--[if mso]>
                                                        <i style="letter-spacing: 30px; mso-font-width: -100%; mso-text-raise: 20pt;">&nbsp;</i>
                                                        <![endif]-->
                                                        <span style="mso-text-raise: 10pt;">Reset Password</span>
                                                        <!--[if mso]>
                                                        <i style="letter-spacing: 30px; mso-font-width: -100%;">&nbsp;</i>
                                                        <![endif]-->
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                
                                <!-- Expiry Notice -->
                                <tr>
                                    <td align="center" style="padding-top: 15px;">
                                        <p style="margin: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 12px; line-height: 1.4; color: #666666; text-align: center;" class="mobile-text">
                                            The link will be active for only 24 hours.
                                        </p>
                                    </td>
                                </tr>
                                
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Help Section -->
                    <tr>
                        <td bgcolor="#f5f5f5" style="padding: 25px 40px; background-color: #f5f5f5; text-align: center;" class="mobile-padding mobile-center">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                
                                <tr>
                                    <td align="center" style="padding-bottom: 8px;">
                                        <p style="margin: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 16px; font-weight: normal; color: #666666; text-align: center;" class="mobile-text">
                                            Questions? We're here to help.
                                        </p>
                                    </td>
                                </tr>
                                
                                <tr>
                                    <td align="center" style="padding-bottom: 8px;">
                                        <p style="margin: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 14px; color: #666666; text-align: center; line-height: 1.4;" class="mobile-text">
                                            Contact us at 
                                            <a href="mailto:trisha@vihara.ai" style="color: #4A90E2; text-decoration: none;">trisha@vihara.ai</a> 
                                            Mon-Fri from 9am - 6pm PT or email
                                        </p>
                                    </td>
                                </tr>
                                
                                <tr>
                                    <td align="center">
                                        <p style="margin: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 14px; color: #666666; text-align: center; line-height: 1.4;" class="mobile-text">
                                            Or, visit our online 
                                            <a href="https://vihara.ai/contact-us" style="color: #4A90E2; text-decoration: none;">Vihara Help Center</a>.
                                        </p>
                                    </td>
                                </tr>
                                
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Footer Section -->
                    <tr>
                        <td bgcolor="#ffffff" style="padding: 30px 40px; background-color: #ffffff; text-align: center;" class="mobile-padding mobile-center">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                
                                <!-- Tagline -->
                                <tr>
                                    <td align="center" style="padding-bottom: 20px;">
                                        <p style="margin: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 18px; font-weight: bold; text-align: center;" class="dark-mode-text">
                                            <span style="color: #4A90E2;">BEYOND</span> 
                                            <span style="color: #7CB342;">THE BID.</span>
                                        </p>
                                    </td>
                                </tr>
                                
                                <!-- Social Icons -->
                                <tr>
                                    <td align="center" style="padding-bottom: 20px;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                                            <tr>
                                                <td style="padding: 0 8px;">
                                                    <a href="#" style="display: inline-block; text-decoration: none;">
                                                        <img src="https://res.cloudinary.com/my1chatapp/image/upload/v1758121455/FbIcon_edgimr.png" 
                                                             alt="Facebook" 
                                                             width="32" 
                                                             height="32"
                                                             style="display: block; border: 0; border-radius: 50%; outline: none; text-decoration: none;">
                                                    </a>
                                                </td>
                                                <td style="padding: 0 8px;">
                                                    <a href="#" style="display: inline-block; text-decoration: none;">
                                                        <img src="https://res.cloudinary.com/my1chatapp/image/upload/v1758121456/GlIcon_grsi7k.png" 
                                                             alt="Google+" 
                                                             width="32" 
                                                             height="32"
                                                             style="display: block; border: 0; border-radius: 50%; outline: none; text-decoration: none;">
                                                    </a>
                                                </td>
                                                <td style="padding: 0 8px;">
                                                    <a href="#" style="display: inline-block; text-decoration: none;">
                                                        <img src="https://res.cloudinary.com/my1chatapp/image/upload/v1758121456/LdIcon_rvaqhn.png" 
                                                             alt="LinkedIn" 
                                                             width="32" 
                                                             height="32"
                                                             style="display: block; border: 0; border-radius: 50%; outline: none; text-decoration: none;">
                                                    </a>
                                                </td>
                                                <td style="padding: 0 8px;">
                                                    <a href="#" style="display: inline-block; text-decoration: none;">
                                                        <img src="https://res.cloudinary.com/my1chatapp/image/upload/v1758121458/TrIcon_c7qoyb.png" 
                                                             alt="Twitter" 
                                                             width="32" 
                                                             height="32"
                                                             style="display: block; border: 0; border-radius: 50%; outline: none; text-decoration: none;">
                                                    </a>
                                                </td>
                                                <td style="padding: 0 8px;">
                                                    <a href="#" style="display: inline-block; text-decoration: none;">
                                                        <img src="https://res.cloudinary.com/my1chatapp/image/upload/v1758121465/YtIcon_zyidvg.png" 
                                                             alt="YouTube" 
                                                             width="32" 
                                                             height="32"
                                                             style="display: block; border: 0; border-radius: 50%; outline: none; text-decoration: none;">
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                
                                <!-- App Store Buttons -->
                                <tr>
                                    <td align="center" style="padding-bottom: 20px;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                                            <tr>
                                                <td style="padding: 0 5px;">
                                                    <a href="#" style="display: inline-block; text-decoration: none;">
                                                        <img src="https://res.cloudinary.com/my1chatapp/image/upload/v1758121238/PlayStore_dnjfli.png" 
                                                             alt="Get it on Google Play" 
                                                             width="110" 
                                                             height="40"
                                                             style="display: block; border: 0; outline: none; text-decoration: none;">
                                                    </a>
                                                </td>
                                                <td style="padding: 0 5px;">
                                                    <a href="#" style="display: inline-block; text-decoration: none;">
                                                        <img src="https://res.cloudinary.com/my1chatapp/image/upload/v1758120827/AppStore_msm0jt.png" 
                                                             alt="Download on the App Store" 
                                                             width="110" 
                                                             height="40"
                                                             style="display: block; border: 0; outline: none; text-decoration: none;">
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                
                                <!-- Footer Links -->
                                <tr>
                                    <td align="center" style="padding-bottom: 15px;">
                                        <p style="margin: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 12px; color: #666666; text-align: center; line-height: 1.4;" class="mobile-text">
                                            <a href="#" style="color: #666666; text-decoration: none; margin: 0 5px;">Licensing & Disclosures</a> |
                                            <a href="#" style="color: #666666; text-decoration: none; margin: 0 5px;">Privacy Statement</a> |
                                            <a href="#" style="color: #666666; text-decoration: none; margin: 0 5px;">Website Terms of Use</a>
                                        </p>
                                    </td>
                                </tr>
                                
                                <!-- Address -->
                                <tr>
                                    <td align="center" style="padding-bottom: 5px;">
                                        <p style="margin: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 12px; color: #666666; text-align: center; line-height: 1.4;" class="mobile-text">
                                            Inc. 1335 S Milpitas Blvd Milpitas, California 95035
                                        </p>
                                    </td>
                                </tr>
                                
                                <!-- Copyright -->
                                <tr>
                                    <td align="center">
                                        <p style="margin: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 12px; color: #666666; text-align: center; line-height: 1.4;" class="mobile-text">
                                            © 2026 Vihara.ai, LLC. All Rights Reserved
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
    
    <!-- Outlook fallback for button -->
    <!--[if mso]>
    <style>
        .mso-button-wrap {
            background-color: #4A90E2;
            border-radius: 4px;
            padding: 12px 30px;
        }
        .mso-button-wrap a {
            color: #ffffff !important;
            font-family: Arial, sans-serif !important;
            font-size: 14px !important;
            font-weight: bold !important;
            text-decoration: none !important;
        }
    </style>
    <![endif]-->
    
</body>
</html>`;
};

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
        /* Reset and base styles */
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
        
        /* Media queries for responsive design */
        @media only screen and (max-width: 600px) {
            .email-container {
                width: 100% !important;
            }
            
            .mobile-padding {
                padding-left: 20px !important;
                padding-right: 20px !important;
            }
            
            .mobile-text {
                font-size: 14px !important;
                line-height: 1.4 !important;
            }
            
            .mobile-button {
                padding: 12px 30px !important;
                font-size: 14px !important;
            }
            
            .mobile-center {
                text-align: center !important;
            }
            
            .footer-logo-section {
                padding-bottom: 20px !important;
            }
            
            .social-icons-row td {
                display: block !important;
                text-align: center !important;
                padding-bottom: 10px !important;
            }
        }
        
        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
            .dark-mode-bg {
                background-color: #1e1e1e !important;
            }
            .dark-mode-text {
                color: #ffffff !important;
            }
        }
        
        /* Outlook specific styles */
        <!--[if mso]>
        .fallback-font {
            font-family: Arial, sans-serif !important;
        }
        <![endif]-->
    </style>
</head>

<body style="margin: 0; padding: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; background-color: #ffffff; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
    
    <!-- Main Email Container -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0; padding: 0; background-color: #ffffff;">
        <tr>
            <td align="center" style="padding: 0;">
                
                <!-- Email Content Container - 600px max width -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="email-container" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
                    
                    <!-- Header Section -->
                    <tr>
                        <td align="center"  style="padding: 20px;" class="mobile-padding mobile-center">
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
                    
                    <!-- Content Section -->
                    <tr>
                        <td bgcolor="#ffffff" style="padding: 40px; background-color: #ffffff;" class="mobile-padding">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                
                                <!-- Welcome Title -->
                                <tr>
                                    <td style="padding-bottom: 30px;">
                                        <h1 style="margin: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 22px; font-weight: normal; color: #333333; line-height: 1.3;" class="dark-mode-text">
                                            Welcome to Vihara ${newUser.name}.
                                        </h1>
                                    </td>
                                </tr>
                                
                                <!-- Username Info -->
                                <tr>
                                    <td style="padding-bottom: 30px;">
                                        <p style="margin: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 16px; line-height: 1.5; color: #333333;" class="mobile-text dark-mode-text">
                                            Your username is: 
                                            <a href="mailto:${newUser.email}" style="color: #4A90E2; text-decoration: none;">${newUser.email}</a>
                                        </p>
                                    </td>
                                </tr>
                                
                                <!-- Welcome Message -->
                                <tr>
                                    <td style="padding-bottom: 40px;">
                                        <p style="margin: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 16px; line-height: 1.6; color: #333333;" class="mobile-text dark-mode-text">
                                            Now that you have registered on 
                                            <a href="https://vihara.ai" style="color: #0384FB; text-decoration: none;">vihara.ai</a>, 
                                            you have access to your own personal dashboard to save searches and properties, share your favorites, receive notifications when there is a price or status change, and more!
                                        </p>
                                    </td>
                                </tr>
                                
                                <!-- Get Started Button -->
                                <tr>
                                    <td align="center" style="padding-bottom: 40px;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                            <tr>
                                                <td align="center" bgcolor="#0384FB" style="border-radius: 4px; background-color: #0384FB;">
                                                    <a href="${clientUrl}" 
                                                       style="display: inline-block; padding: 15px 40px; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 16px; font-weight: bold; color: #ffffff; text-decoration: none; border-radius: 4px; -webkit-text-size-adjust: none; mso-padding-alt: 0; box-sizing: border-box;" 
                                                       class="mobile-button">
                                                        <!--[if mso]>
                                                        <i style="letter-spacing: 40px; mso-font-width: -100%; mso-text-raise: 20pt;">&nbsp;</i>
                                                        <![endif]-->
                                                        <span style="mso-text-raise: 10pt;">Get Started</span>
                                                        <!--[if mso]>
                                                        <i style="letter-spacing: 40px; mso-font-width: -100%;">&nbsp;</i>
                                                        <![endif]-->
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                
                                <!-- Help Section -->
                                <tr>
                                    <td style="padding-bottom: 15px;">
                                        <p style="margin: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 16px; line-height: 1.5; color: #333333;" class="mobile-text dark-mode-text">
                                            Need help? Our 
                                            <a href="mailto:trisha@vihara.ai" style="color: #0384FB; text-decoration: none;">customer service</a> 
                                            team is here to help.
                                        </p>
                                    </td>
                                </tr>
                                
                                <!-- Thank You -->
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
                    
                    <!-- Footer Section -->
                    <tr>
                        <td bgcolor="#4a5568" style="padding: 30px 40px; background-color: #4a5568;" class="mobile-padding">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                
                                <!-- Footer Logo Section -->
                                <tr>
                                    <td class="footer-logo-section" style="padding-bottom: 20px;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                            <tr>
                                                <!-- Equal Housing Logo -->
                                                <td align="left" valign="middle" style="width: 50%;">
                                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                                        <tr>
                                                            <td align="left">
                                                                <img src="https://res.cloudinary.com/my1chatapp/image/upload/v1758125574/XmHome_yfauw5.png" 
                                                                     alt="Equal Housing" 
                                                                     width="40" 
                                                                     height="40"
                                                                     style="display: block; border: 0; outline: none; text-decoration: none;">
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                                
                                                <!-- Social Icons -->
                                                <td align="right" valign="middle" style="width: 50%;">
                                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0;">
                                                        <tr class="social-icons-row">
                                                            <td style="padding: 0 5px;">
                                                                <a href="https://www.facebook.com/profile.php?id=61556248807076" style="display: inline-block; text-decoration: none;">
                                                                    <img src="https://res.cloudinary.com/my1chatapp/image/upload/v1758121455/FbIcon_edgimr.png" 
                                                                         alt="Facebook" 
                                                                         width="40" 
                                                                         height="40"
                                                                         style="display: block; border: 0; outline: none; text-decoration: none; border-radius: 50%;">
                                                                </a>
                                                            </td>
                                                            <td style="padding: 0 5px;">
                                                                <a href="https://www.instagram.com/vihara.ai/" style="display: inline-block; text-decoration: none;">
                                                                    <img src="https://res.cloudinary.com/my1chatapp/image/upload/v1768646620/insta-icon_yab7b2.webp" 
                                                                         alt="Twitter" 
                                                                         width="40" 
                                                                         height="40"
                                                                         style="display: block; border: 0; outline: none; text-decoration: none; border-radius: 50%;">
                                                                </a>
                                                            </td>
                                                            <td style="padding: 0 5px;">
                                                                <a href="https://www.linkedin.com/company/vihara-ai/" style="display: inline-block; text-decoration: none;">
                                                                    <img src="https://res.cloudinary.com/my1chatapp/image/upload/v1758121456/LdIcon_rvaqhn.png" 
                                                                         alt="LinkedIn" 
                                                                         width="40" 
                                                                         height="40"
                                                                         style="display: block; border: 0; outline: none; text-decoration: none; border-radius: 50%;">
                                                                </a>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                
                                <!-- Footer Copyright -->
                                <tr>
                                    <td style="padding-bottom: 15px;">
                                        <p style="margin: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 12px; line-height: 1.4; color: #d1d5db; text-align: center;" class="mobile-text">
                                            RL Auction Inc.
                                            <br></br>
                                             1335 S Milpitas Blvd, Milpitas, California 95035.
                                        </p>
                                    </td>
                                </tr>
                                
                                <!-- Footer Links -->
                                <!-- Privacy Notice -->
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
    
    <!-- Outlook fallback for button -->
    <!--[if mso]>
    <style>
        .mso-button-wrap {
            background-color: #0384FB;
            border-radius: 4px;
            padding: 15px 40px;
        }
        .mso-button-wrap a {
            color: #ffffff !important;
            font-family: Arial, sans-serif !important;
            font-size: 16px !important;
            font-weight: bold !important;
            text-decoration: none !important;
        }
    </style>
    <![endif]-->
    
</body>
</html>`;
};

const createRegistrationPendingEmail = (userName, propertyAddress, propertyCity, propertyState) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Registration Received - Vihara</title>
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
                <p style="margin: 0 0 15px 0; font-size: 14px; color: #333;">Hello ${userName},</p>
                <p style="margin: 0 0 25px 0; font-size: 16px; font-weight: bold; color: #333;">Your Auction Registration Has Been Received</p>
                <p style="margin: 0 0 25px 0; font-size: 14px; line-height: 1.6; color: #555;">Thank you for registering! We have received your application for:</p>
                <div style="padding: 20px; background-color: #f8f9fa; border-left: 4px solid #0384FB; margin-bottom: 25px;">
                    <p style="margin: 0 0 10px 0; font-weight: bold; color: #333;">Property Address:</p>
                    <p style="margin: 0; color: #555;">${propertyAddress}<br>${propertyCity}, ${propertyState}</p>
                </div>
                <p style="margin: 0 0 10px 0; font-size: 14px; color: #555;"><strong>Current Status: Pending Approval</strong></p>
                <p style="margin: 0 0 20px 0; font-size: 14px; color: #666;">Your registration is being reviewed. You'll receive an email once approved. Typical approval time: 24-48 hours.</p>
                <p style="margin: 0; font-size: 14px; color: #666;">Best regards,<br><strong>Vihara Team</strong></p>
            </td>
        </tr>
    </table>
</body>
</html>`;
};

const createRegistrationApprovedEmail = (userName, propertyAddress, propertyCity, propertyState, propertyId) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Registration Approved - Vihara</title>
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
                <p style="margin: 0 0 15px 0; font-size: 14px; color: #333;">Hello ${userName},</p>
                <p style="margin: 0 0 25px 0; font-size: 16px; font-weight: bold; color: #2ecc71;">✓ Your Registration Has Been Approved!</p>
                <p style="margin: 0 0 25px 0; font-size: 14px; line-height: 1.6; color: #555;">Great news! Your registration is approved. You can now bid on:</p>
                <div style="padding: 20px; background-color: #f0f8ff; border-left: 4px solid #2ecc71; margin-bottom: 25px;">
                    <p style="margin: 0 0 10px 0; font-weight: bold; color: #333;">Property Address:</p>
                    <p style="margin: 0; color: #555;">${propertyAddress}<br>${propertyCity}, ${propertyState}</p>
                </div>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    <tr>
                        <td align="center" style="padding-bottom: 25px;">
                            <a href="${process.env.CLIENT_URL || 'https://vihara.ai'}/auction-bid/${propertyId}" style="display: inline-block; background-color: #0384FB; color: white; padding: 15px 40px; text-decoration: none; border-radius: 4px; font-weight: bold;">Start Bidding Now</a>
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

module.exports = {
    createPasswordResetEmail,
    createWelcomeEmail,
    createRegistrationPendingEmail,
    createRegistrationApprovedEmail
};