function getNewsletterTemplate(email = '') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vihara - Smart Auction Platform</title>
    <style>
        body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #ffffff;
            color: #333;
            line-height: 1.5;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
        }
        .header {
            background-color: #ffffff;
            padding: 20px;
            text-align: center;
        }
        .logo {
            color: #333;
            font-size: 36px;
            font-weight: bold;
        }
        .logo img {
            height: 30px;
        }
        .nav {
            background-color: #ffffff;
            text-align: center;
            padding: 10px 0;
        }
        .nav a {
            color: #333;
            text-decoration: none;
            margin: 0 15px;
            font-weight: bold;
        }
        .login-btn {
            background-color: #2185ff;
            color: white !important;
            padding: 8px 20px;
            border-radius: 20px;
            text-decoration: none;
            font-weight: bold;
        }
        .hero {
            text-align: center;
            padding: 20px 20px 40px 20px;
        }
        .hero h1 {
            color: #333;
            margin: 0;
            font-size: 28px;
            margin-bottom: 5px;
        }
        .hero h1 span {
            color: #c22a3e;
        }
        .hero p {
            margin: 10px 0 20px;
            font-size: 16px;
        }
        .cta-button {
            background-color: #f4f4f4;
            color: #333;
            border: 1px solid #ddd;
            padding: 12px 40px;
            text-decoration: none;
            border-radius: 25px;
            display: inline-block;
            margin: 20px 0 0 0;
            font-size: 16px;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <table class="container" width="100%" cellpadding="0" cellspacing="0" border="0">
        <!-- Header Section -->
        <tr>
            <td>
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                        <td class="header">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td width="10%" align="left">
                                        <div class="logo">
                                            <img src="https://res.cloudinary.com/dl8ixzds4/image/upload/v1740491986/vihara-logo-b_xl6xdo.png" alt="Vihara Logo" width="100" height="30">
                                        </div>
                                    </td>
                                    <td width="80%" align="center">
                                        <div class="nav" style="display: block; text-align: center;">
                                            <a href="#" style="display: inline-block; margin: 0 15px; padding: 10px 0; font-weight: bold;">Auctions ▼</a>
                                            <a href="#" style="display: inline-block; margin: 0 15px; padding: 10px 0; font-weight: bold;">Resources ▼</a>
                                            <a href="#" style="display: inline-block; margin: 0 15px; padding: 10px 0; font-weight: bold;">About ▼</a>
                                        </div>
                                    </td>
                                    <td width="10%" align="right">
                                        <a href="https://www.vihara.ai/login" class="login-btn">LOGIN</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>

        <!-- Hero Section -->
        <tr>
            <td>
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                        <td class="hero">
                            <h1>BID. LIST. SELL. <span>ALL WITH AI.</span></h1>
                            <p>Expansive listings, remote bids, transparent transactions, and more.</p>
                            <a href="https://www.vihara.ai/" class="cta-button">Get Started</a>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>

        <!-- Footer -->
        <tr>
            <td>
                <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#2185ff">
                    <tr>
                        <td style="padding: 30px 20px; color: white;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td width="25%" valign="top" style="padding: 10px;">
                                        <p style="font-weight: bold; margin-top: 0; font-size: 16px; margin-bottom: 15px;">Auctions</p>
                                        <a href="https://www.vihara.ai/blog" style="color: white; text-decoration: none; display: block; margin-bottom: 8px; font-size: 14px;">REO Bank Owned</a>
                                        <a href="https://www.vihara.ai/help" style="color: white; text-decoration: none; display: block; margin-bottom: 8px; font-size: 14px;">Short Sale</a>
                                        <a href="https://www.vihara.ai/buying-forclosure" style="color: white; text-decoration: none; display: block; margin-bottom: 8px; font-size: 14px;">Foreclosure Homes</a>
                                        <a href="https://www.vihara.ai/event-calender" style="color: white; text-decoration: none; display: block; margin-bottom: 8px; font-size: 14px;">Auctions Calendar</a>
                                    </td>
                                    <td width="25%" valign="top" style="padding: 10px;">
                                        <p style="font-weight: bold; margin-top: 0; font-size: 16px; margin-bottom: 15px;">Resources</p>
                                        <a href="https://www.vihara.ai/faqs" style="color: white; text-decoration: none; display: block; margin-bottom: 8px; font-size: 14px;">FAQs</a>
                                        <a href="https://www.vihara.ai/buying-forclosure" style="color: white; text-decoration: none; display: block; margin-bottom: 8px; font-size: 14px;">Buying a Foreclosure</a>
                                        <a href="https://www.vihara.ai/buying-bank-owned" style="color: white; text-decoration: none; display: block; margin-bottom: 8px; font-size: 14px;">Buying a Bank Owned</a>
                                        <a href="https://www.vihara.ai/glossary" style="color: white; text-decoration: none; display: block; margin-bottom: 8px; font-size: 14px;">Glossary</a>
                                        <a href="https://www.vihara.ai/contact-us" style="color: white; text-decoration: none; display: block; margin-bottom: 8px; font-size: 14px;">Contact</a>
                                    </td>
                                    <td width="25%" valign="top" style="padding: 10px;">
                                        <p style="font-weight: bold; margin-top: 0; font-size: 16px; margin-bottom: 15px;">Company</p>
                                        <a href="https://www.vihara.ai/about-us" style="color: white; text-decoration: none; display: block; margin-bottom: 8px; font-size: 14px;">About</a>
                                        <a href="https://www.vihara.ai/team" style="color: white; text-decoration: none; display: block; margin-bottom: 8px; font-size: 14px;">Meet the Team</a>
                                        <a href="https://www.vihara.ai/career" style="color: white; text-decoration: none; display: block; margin-bottom: 8px; font-size: 14px;">Vihara Jobs</a>
                                        <a href="https://www.vihara.ai/diversity" style="color: white; text-decoration: none; display: block; margin-bottom: 8px; font-size: 14px;">Diversity</a>
                                        <a href="https://www.vihara.ai/Privacy" style="color: white; text-decoration: none; display: block; margin-bottom: 8px; font-size: 14px;">Privacy</a>
                                        <a href="https://www.vihara.ai/privacy-statement" style="color: white; text-decoration: none; display: block; margin-bottom: 8px; font-size: 14px;">Privacy Statement</a>
                                    </td>
                                    <td width="25%" valign="top" style="padding: 10px;">
                                        <div style="text-align: left; margin-top: 20px;">
                                            <a href="https://www.vihara.ai/website-terms-of-use" style="color: white; text-decoration: none; display: block; margin-bottom: 8px; font-size: 14px;">Website Terms of Use</a>
                                            <a href="https://www.vihara.ai/participation-terms" style="color: white; text-decoration: none; display: block; margin-bottom: 8px; font-size: 14px;">Participation Terms</a>
                                            <a href="https://www.vihara.ai/accessibility" style="color: white; text-decoration: none; display: block; margin-bottom: 8px; font-size: 14px;">Accessibility Statement</a>
                                            <a href="https://www.vihara.ai/privacy-choice" style="color: white; text-decoration: none; display: block; margin-bottom: 8px; font-size: 14px;">Your Privacy Choices</a>
                                        </div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
        
        <!-- Social Media Icons -->
        <tr>
            <td bgcolor="#2185ff">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                        <td width="40%">&nbsp;</td>
                        <td width="20%" align="center" style="padding: 20px 0;">
                            <table cellpadding="0" cellspacing="0" border="0" width="100%">
                                <tr>
                                    <td align="center">
                                        <a href="https://www.facebook.com/profile.php?id=61556248807076" target="_blank" style="display: inline-block; padding: 0 5px;">
                                            <img src="https://img.icons8.com/color/48/000000/facebook-new.png" alt="Facebook" width="24" height="24">
                                        </a>
                                        <a href="https://www.instagram.com/vihara.ai/" target="_blank" style="display: inline-block; padding: 0 5px;">
                                            <img src="https://img.icons8.com/color/48/000000/instagram-new.png" alt="Instagram" width="24" height="24">
                                        </a>
                                        <a href="https://www.linkedin.com/company/vihara-ai/" target="_blank" style="display: inline-block; padding: 0 5px;">
                                            <img src="https://img.icons8.com/color/48/000000/linkedin.png" alt="LinkedIn" width="24" height="24">
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                        <td width="40%">&nbsp;</td>
                    </tr>
                </table>
            </td>
        </tr>
        
        <!-- Copyright -->
        <tr>
            <td align="center" bgcolor="#2185ff" style="padding: 10px 0; color: white; font-size: 12px;">
                <p>© 2024 RL Auction Inc.</p>
            </td>
        </tr>
        <tr>
            <td align="center" bgcolor="#2185ff" style="padding: 10px 0; color: white; font-size: 12px;">
                <p><a href="https://viharabackend.onrender.com/api/unsubscribe?email=${email}" style="color: white; text-decoration: underline;">Click here to unsubscribe</a></p>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

module.exports = getNewsletterTemplate;