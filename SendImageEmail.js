require('dotenv').config();
const sgMail = require('@sendgrid/mail');
const fs = require('fs');
const mongoose = require('mongoose');
const users = require('./22SEP.json'); // Updated to use your current data file
const Unsubscribe = require('./model/unsubscribeModel');

// Connect to MongoDB
mongoose.connect(process.env.DB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => {
        console.error('❌ MongoDB connection failed:', err.message);
        process.exit(1);
    });

// Updated subject line to match the actual event
const subject = "Five Star 2025 Conference";
const imagePath = './1.png';
const imageBuffer = fs.readFileSync(imagePath);
const imageBase64 = imageBuffer.toString('base64');
const imageContentId = 'viharaEventImage';
const secondImagePath = './2.png';
const secondImageBuffer = fs.readFileSync(secondImagePath);
const secondImageBase64 = secondImageBuffer.toString('base64');
const secondImageContentId = 'viharaEventImage2';

function generateHtml(user) {
    return `
    <html>
      <body>
        <table style="width: 100%; max-width: 800px; margin: 0 auto;">
          <tr>
            <td style="width: 100%; padding: 10px;">
              <img src="cid:${imageContentId}" alt="Vihara is attending the Five Star Conference in Dallas next week, and we'd love to meet you! Scan the QR code to schedule some time." style="width: 100%; height: auto; display: block;" />
            </td>
          </tr>
          <tr>
            <td style="width: 100%; padding: 10px;">
              <img src="cid:${secondImageContentId}" alt="Meet the Vihara leadership team at the Five Star Conference event." style="width: 100%; height: auto; display: block;" />
            </td>
          </tr>
        </table>
        <p style="font-size: 12px; color: #888; text-align: center; margin-top: 20px;">
          <a href="https://viharabackend.onrender.com/api/unsubscribe?email=${encodeURIComponent(user['Email Address'])}" style="color: #888;">Click here to unsubscribe</a>.
        </p>
      </body>
    </html>
  `;
}

async function sendImageEmails() {
    try {
        const unsubscribed = await Unsubscribe.find({});
        const unsubscribedEmails = unsubscribed.map(entry => entry.email.toLowerCase());

        // Filter users with valid email addresses and not unsubscribed
        const filteredUsers = users.filter(user => {
            const email = user['Email Address'];
            return email && 
                   email.trim() !== '' && 
                   !unsubscribedEmails.includes(email.toLowerCase());
        });

        if (filteredUsers.length === 0) {
            console.log('🔭 No users to email. All have unsubscribed or no valid email addresses found.');
            return;
        }

        console.log(`📧 Preparing to send emails to ${filteredUsers.length} recipients`);

        sgMail.setApiKey(process.env.SENDGRID_API_KEY);

        // Add delay between emails to avoid rate limiting
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        let successCount = 0;
        let errorCount = 0;

        for (const user of filteredUsers) {
            const email = user['Email Address'];
            const html = generateHtml(user);
            
            const msg = {
                to: email,
                from: {
                    email: 'trisha@vihara.ai',
                    name: 'Trisha Gupta'
                },
                subject,
                html,
                attachments: [
                    {
                        content: imageBase64,
                        filename: '1.png',
                        type: 'image/png',
                        disposition: 'inline',
                        content_id: imageContentId
                    },
                    {
                        content: secondImageBase64,
                        filename: '2.png',
                        type: 'image/png',
                        disposition: 'inline',
                        content_id: secondImageContentId
                    }
                ]
            };

            try {
                await sgMail.send(msg);
                console.log(`✅ Image email sent to ${email} (${user['First Name']} ${user['Last Name']} - ${user.Company})`);
                successCount++;
            } catch (error) {
                console.error(`❌ Failed to send to ${email}:`, error.response?.body || error.message);
                errorCount++;
            }

            // Add small delay between sends to be respectful to email service
            await delay(100);
        }

        console.log(`\n📊 Email Campaign Summary:`);
        console.log(`✅ Successfully sent: ${successCount}`);
        console.log(`❌ Failed to send: ${errorCount}`);
        console.log(`📧 Total processed: ${filteredUsers.length}`);
        
    } catch (err) {
        console.error('❌ Error during email processing:', err.message);
    } finally {
        mongoose.connection.close();
    }
}

sendImageEmails();