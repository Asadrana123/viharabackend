require('dotenv').config();
const sgMail = require('@sendgrid/mail');
const mongoose = require('mongoose');
const users = require('./EmailData.json');
const emailContent = require('./EmailContentSecond.js');
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

// Choose the day index (0 = Day 1, ..., 6 = Day 7)
const dayIndex = 6;
const subject = emailContent(users[0])[dayIndex].subject;

function generateHtml(user) {
  const dailyContent = emailContent(user)[dayIndex];
  return dailyContent.body;
}

// Main function to send emails
async function sendEmails() {
  try {
    const unsubscribed = await Unsubscribe.find({});
    const unsubscribedEmails = unsubscribed.map(entry => entry.email.toLowerCase());

    const filteredUsers = users.filter(
      user => !unsubscribedEmails.includes(user.Email.toLowerCase())
    );

    if (filteredUsers.length === 0) {
      console.log('📭 No users to email. All have unsubscribed.');
      return;
    }

    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    for (const user of filteredUsers) {
      const html = generateHtml(user);
      const msg = {
        to: user.Email,
        from: {
          email: 'trisha@vihara.ai',
          name: 'Trisha Gupta'
        },
        subject,
        html
      };

      try {
        await sgMail.send(msg);
        console.log(`✅ Email sent to ${user.Email}`);
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

sendEmails();
