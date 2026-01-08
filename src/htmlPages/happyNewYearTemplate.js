function getHappyNewYearTemplate(email = '') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Happy New Year 2026 - Vihara</title>
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
            padding: 40px 20px;
            background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
            border-top: 3px solid #2185ff;
        }
        .hero h1 {
            color: #333;
            margin: 0 0 10px 0;
            font-size: 48px;
            font-weight: bold;
            letter-spacing: 2px;
        }
        .hero h1 span {
            color: #c22a3e;
        }
        .hero p {
            margin: 15px 0;
            font-size: 16px;
            color: #666;
        }
        .year-badge {
            display: inline-block;
            background-color: #c22a3e;
            color: white;
            padding: 10px 25px;
            border-radius: 30px;
            font-size: 18px;
            font-weight: bold;
            margin: 10px 0;
        }
        .content-section {
            padding: 30px 20px;
            background-color: #ffffff;
            border-bottom: 1px solid #f0f0f0;
        }
        .content-section h2 {
            color: #2185ff;
            font-size: 24px;
            margin: 0 0 15px 0;
            text-align: center;
        }
        .content-section p {
            font-size: 15px;
            color: #555;
            line-height: 1.8;
            margin: 10px 0;
        }
        .highlights {
            display: block;
            margin: 20px 0;
        }
        .highlight-item {
            display: block;
            margin: 12px 0;
            padding: 12px 15px;
            background-color: #f8f9fa;
            border-left: 4px solid #2185ff;
            border-radius: 4px;
        }
        .highlight-item strong {
            color: #c22a3e;
        }
        .cta-button {
            background-color: #2185ff;
            color: white !important;
            border: none;
            padding: 15px 40px;
            text-decoration: none;
            border-radius: 25px;
            display: inline-block;
            margin: 25px 0;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
        }
        .cta-button:hover {
            background-color: #1a6fd9;
        }
        .divider {
            height: 2px;
            background-color: #e0e0e0;
            margin: 30px 0;
        }
        .footer {
            background-color: #2185ff;
            padding: 30px 20px;
            color: white;
        }
        .footer-column {
            margin: 20px 0;
        }
        .footer-column p {
            font-weight: bold;
            font-size: 16px;
            margin: 0 0 15px 0;
        }
        .footer-column a {
            color: white;
            text-decoration: none;
            display: block;
            margin-bottom: 8px;
            font-size: 14px;
        }
        .footer-column a:hover {
            text-decoration: underline;
        }
        .social-icons {
            text-align: center;
            padding: 20px 0;
        }
        .social-icons a {
            display: inline-block;
            padding: 0 8px;
            margin: 0 3px;
        }
        .social-icons img {
            width: 24px;
            height: 24px;
        }
        .copyright {
            background-color: #2185ff;
            text-align: center;
            padding: 15px;
            color: white;
            font-size: 12px;
            border-top: 1px solid rgba(255, 255, 255, 0.2);
        }
        .unsubscribe {
            background-color: #2185ff;
            text-align: center;
            padding: 15px;
            color: white;
            font-size: 12px;
        }
        .unsubscribe a {
            color: white;
            text-decoration: underline;
        }
        @media only screen and (max-width: 600px) {
            .hero h1 {
                font-size: 36px;
            }
            .content-section {
                padding: 20px 15px;
            }
            .footer-column {
                margin: 15px 0;
            }
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
                                            <a href="https://www.vihara.ai/" style="text-decoration: none; display: inline-block;">
                                                <img src="https://res.cloudinary.com/dl8ixzds4/image/upload/v1740491986/vihara-logo-b_xl6xdo.png" alt="Vihara Logo" width="100" height="30">
                                            </a>
                                        </div>
                                    </td>

                                    <td width="10%" align="right">
                                        <a href="https://www.vihara.ai//auth/login" class="login-btn">LOGIN</a>
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
                            <h1>HAPPY <span>NEW YEAR</span></h1>
                            <div class="year-badge">2026</div>
                            <p>A New Chapter in Real Estate Excellence</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>

        <!-- Content Section 1 -->
        <tr>
            <td>
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                        <td class="content-section">
                            <h2>Cheers to New Beginnings!</h2>
                            <p>As we step into 2026, we at Vihara are excited to bring you even more innovations in the world of real estate auctions. Thank you for being part of our journey in 2025!</p>
                            <p>This year, we're committed to enhancing your auction experience with cutting-edge AI tools, transparent transactions, and unparalleled market insights.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>

        <!-- Highlights Section -->
        <tr>
            <td>
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                        <td class="content-section">
                            <h2>What's New in 2026</h2>
                            <div class="highlights">
                                <div class="highlight-item">
                                    <strong>Enhanced Auction Features:</strong> Smarter bidding strategies and real-time market updates.
                                </div>
                                <div class="highlight-item">
                                    <strong>AI-Powered Insights:</strong> Get personalized property recommendations and market analysis.
                                </div>
                                <div class="highlight-item">
                                    <strong>Better Mobile Experience:</strong> Seamless bidding on any device, anytime, anywhere.
                                </div>
                                <div class="highlight-item">
                                    <strong>Enhanced Security:</strong> Your data and transactions are more secure than ever.
                                </div>
                            </div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>

        <!-- Divider -->
        <tr>
            <td style="padding: 0 20px;">
                <div class="divider"></div>
            </td>
        </tr>

        <!-- CTA Section -->
        <tr>
            <td>
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                        <td class="content-section" align="center">
                            <p style="font-size: 16px; color: #555; margin-bottom: 20px;">Ready to explore amazing property opportunities this year?</p>
                            <a href="https://www.vihara.ai/" class="cta-button">Start Bidding Today</a>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>

        <!-- Unsubscribe -->
        <tr>
            <td align="center" style="padding: 10px 0; color: white; font-size: 12px; background-color: #2185ff;">
                <p><a href="https://viharabackend.onrender.com/api/unsubscribe?email=${email}" style="color: white; text-decoration: underline;">Click here to unsubscribe</a></p>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

module.exports = getHappyNewYearTemplate;