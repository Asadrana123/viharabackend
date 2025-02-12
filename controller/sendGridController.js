require('dotenv').config();
const sgMail = require('@sendgrid/mail');
const data = require("../EmailData.json");
const content =require("../EmailContent");
const apiKey = "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";
sgMail.setApiKey(apiKey);

// Filter first 100 valid emails
const validEmails = data
  .filter(user => user["Email Address"] && user["Email Address"].trim() !== "").slice(0,1);

// Function to send emails
const sendEmails = async () => {
  for (const user of validEmails) {
    const msg = {
      to: user["Email Address"],
      from: 'trisha@vihara.ai',
      subject: content(user)[6].subject,
      html:content(user)[6].body
    };
    try {
      await sgMail.send(msg);
      console.log(`✅ Email sent to: ${user["Email Address"]}`);
    } catch (error) {
      console.error(`❌ Error sending email to ${user["Email Address"]}:`, error.response ? error.response.body : error);
    }
  }
};

// Run the function
sendEmails();
