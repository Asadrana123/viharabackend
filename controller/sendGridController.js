require('dotenv').config();
const sgMail = require('@sendgrid/mail');
const data = require("../EmailData.json");
const contentFunction = require("../EmailContentSecond.js"); 
const apiKey = "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";
const Unsubscribe = require("../model/unsubscribeModel");
const mongoose = require('mongoose');
sgMail.setApiKey(apiKey);
const fs = require('fs');
const htmlTemplate = fs.readFileSync('News-letter-template.html', 'utf-8');

const validEmails = data
  .filter(user => user["Email"] && user["Email"].trim() !== "");

// Function to send emails
const sendEmails = async () => {
  // Array to store failed emails
  const failedEmails = [];
  
  try {
    // Get all unsubscribed emails
    await mongoose.connect("mongodb+srv://asadlukman246:LIKDqLwFSRduMu3W@cluster0.aezmvdu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0", {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB successfully');
    const unsubscribedEmails = await Unsubscribe.find().select('email -_id');
    const unsubscribedEmailSet = new Set(unsubscribedEmails.map(doc => doc.email.toLowerCase()));

    // Filter out unsubscribed users
    const subscribedUsers = validEmails.filter(user => 
      !unsubscribedEmailSet.has(user["Email"].toLowerCase())
    );

    console.log(`Found ${unsubscribedEmails.length} unsubscribed emails`);
    console.log(`Sending emails to ${subscribedUsers.length} subscribed users`);

    for (const user of subscribedUsers) {
      // Get content by passing the user to the content function
      const contentTemplates = contentFunction(user);
      
      const msg = {
        to: user["Email"],
        from: {
          email: 'trisha@vihara.ai',
          name: 'Trisha Gupta'
        },
        subject: contentTemplates[7].subject,
        html: contentTemplates[7].body
      };
      
      try {
        await sgMail.send(msg);
        console.log(`✅ Email sent to: ${user["Email"]}`);
      } catch (error) {
        console.error(`❌ Error sending email to ${user["Email"]}:`, 
          error.response ? error.response.body : error);
        
        // Save failed email
        failedEmails.push({
          email: user["Email"],
          name: user["First Name"],
          error: error.response ? JSON.stringify(error.response.body) : error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Save failed emails to a file if there are any
    if (failedEmails.length > 0) {
      const failedEmailsFile = 'failed_emails.json';
      let existingFailedEmails = [];
      
      // Check if the file already exists
      if (fs.existsSync(failedEmailsFile)) {
        try {
          // Read existing file
          const fileContent = fs.readFileSync(failedEmailsFile, 'utf-8');
          existingFailedEmails = JSON.parse(fileContent);
        } catch (err) {
          console.error('Error reading existing failed emails file:', err);
        }
      }
      
      // Combine existing and new failed emails
      const updatedFailedEmails = [...existingFailedEmails, ...failedEmails];
      
      // Write to file
      fs.writeFileSync(failedEmailsFile, JSON.stringify(updatedFailedEmails, null, 2), 'utf-8');
      console.log(`📝 Saved ${failedEmails.length} failed emails to ${failedEmailsFile}`);
    }
  } catch (error) {
    console.error('Error fetching unsubscribed emails:', error);
  }
};

// Run the function
sendEmails();