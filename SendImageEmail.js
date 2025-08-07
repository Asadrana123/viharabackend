require('dotenv').config();
const sgMail = require('@sendgrid/mail');
const fs = require('fs');
const mongoose = require('mongoose');
const users = require('./CMBA11AUG.json').slice(0, 2);
console.log(users);
const Unsubscribe = require('./model/unsubscribeModel');

// Connect to MongoDB
mongoose.connect(process.env.DB_URI,  {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => {
        console.error('❌ MongoDB connection failed:', err.message);
        process.exit(1);
    });

const subject = "Vihara is Attending the California MBA in Palos Verdes Next Week!";
const imagePath = './1.png'; // Adjust to your image file path
const imageBuffer = fs.readFileSync(imagePath);
const imageBase64 = imageBuffer.toString('base64');
const imageContentId = 'viharaEventImage';
const secondImagePath = './2.png'; // Adjust to your second image file path
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
              <img src="cid:${imageContentId}" alt="Vihara is attending the California MBA in Palos Verdes next week, and we'd love to meet you! Scan the QR code to schedule some time." style="width: 100%; height: auto; display: block;" />
            </td>
          </tr>
          <tr>
            <td style="width: 100%; padding: 10px;">
              <img src="cid:${secondImageContentId}" alt="Meet the Vihara leadership team at the California MBA event." style="width: 100%; height: auto; display: block;" />
            </td>
          </tr>
        </table>
        <p style="font-size: 12px; color: #888; text-align: center; margin-top: 20px;">
          <a href="https://viharabackend.onrender.com/api/unsubscribe?email=${user.Email}" style="color: #888;">Click here to unsubscribe</a>.
        </p>
      </body>
    </html>
  `;
}
async function sendImageEmails() {
    try {
        const unsubscribed = await Unsubscribe.find({});
        const unsubscribedEmails = unsubscribed.map(entry => entry.email.toLowerCase());

        const filteredUsers = users.filter(
            user => !unsubscribedEmails.includes((user.Email || '').toLowerCase())
        );

        if (filteredUsers.length === 0) {
            console.log('📭 No users to email. All have unsubscribed.');
            return;
        }

        sgMail.setApiKey(process.env.SENDGRID_API_KEY);

        for (const user of filteredUsers) {
            const html = generateHtml(user);
            const msg = {
                to: user.Email, // Changed from user["Email Address"] to user.Email
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
                console.log(`✅ Image email sent to ${user.Email}`); // Updated to user.Email
            } catch (error) {
                console.error(`❌ Failed to send to ${user.Email}:`, error.response?.body || error.message);
            }
        }
    } catch (err) {
        console.error('❌ Error during email processing:', err.message);
    } finally {
        mongoose.connection.close();
    }
}

sendImageEmails();