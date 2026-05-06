require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD
    }
});

const recipients = [
    'asadlukman246@gmail.com',
    'noneill690@gmail.com',
    'raesumihret@gmail.com',
    'sharmavijay@sbcglobal.net',
    'highfrequencyvibezenith@gmail.com',
    'ptram7677@gmail.com',
    'trisha@vihara.ai',
    'protranlimo@yahoo.com',
    'alfred@metro-realtypros.com'
];

const getHtml = (email) => `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
  <img src="https://res.cloudinary.com/drm9blcmj/image/upload/v1768580466/vihara-new-logo_csgllk.png" 
                                             alt="Vihara.com" 
                                             width="200" 
                                             height="auto"
                                             style="display: block; max-width: 200px; height: auto; margin: 0 auto; border: 0; outline: none; text-decoration: none;">
  
  <h2 style="color: #0f172a; margin-bottom: 8px;">🏠 Auction Tomorrow — Don't Miss It!</h2>
  <p style="color: #475569; margin-bottom: 24px;">You're registered for the live auction at <strong>1496 Adeline St, Oakland</strong>. Here are your details:</p>

  <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <p style="margin: 0 0 10px 0;"><strong>📅 Date:</strong> May 7, 2026</p>
    <p style="margin: 0 0 10px 0;"><strong>⏰ Time:</strong> 9:00 AM – 6:00 PM PST</p>
    <p style="margin: 0 0 10px 0;"><strong>📧 Email:</strong> ${email}</p>
    <p style="margin: 0 0 10px 0;"><strong>🔑 Password:</strong> vihara786Aa@</p>
  </div>

  <a href="https://vihara.ai/auction-bid/69cf9ec217e006f5c4437c62"
     style="display: inline-block; background-color: #0062ff; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 700; font-size: 16px; margin-bottom: 24px;">
    👉 Start Bidding
  </a>

  <p style="color: #64748b; font-size: 14px;">We recommend logging in a few minutes early to ensure you're ready when bidding opens.</p>
  <p style="color: #64748b; font-size: 14px;">If you have any questions, reply to this email or contact our team.</p>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
  <p style="color: #94a3b8; font-size: 12px; margin: 0;">Good luck tomorrow! — The Vihara Team &nbsp;|&nbsp; <a href="https://vihara.ai" style="color: #94a3b8;">vihara.ai</a></p>
</div>
`;

const sendReminders = async () => {
    let sent = 0;
    let failed = 0;

    for (const email of recipients) {
        try {
            await transporter.sendMail({
                from: `"Vihara" <${process.env.EMAIL_USERNAME}>`,
                to: email,
                subject: '🏠 Auction Tomorrow — May 7, 2026 | 9AM–6PM PST | 1496 Adeline St, Oakland',
                html: getHtml(email)
            });
            console.log(`✅ Sent to ${email}`);
            sent++;
        } catch (err) {
            console.error(`❌ Failed for ${email}:`, err.message);
            failed++;
        }
    }

    console.log(`\nDone. Sent: ${sent}, Failed: ${failed}`);
};

sendReminders();