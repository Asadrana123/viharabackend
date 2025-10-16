require('dotenv').config();
const { Resend } = require('resend');
const mongoose = require('mongoose');
const users = require('./EmailData.json').slice(0,1);
const emailContent = require('./EmailContentSecond.js');
const Unsubscribe = require('./model/unsubscribeModel');

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Configuration
const CONFIG = {
  dayIndex: 10, // Choose the day index (0 = Day 1, ..., 10 = Day 11)
  fromEmail: 'trisha@vihara.ai',
  fromName: 'Trisha Gupta',
  batchSize: 10, // Send emails in batches to avoid rate limits
  delayBetweenBatches: 1000 // 1 second delay between batches
};

/**
 * Connect to MongoDB
 */
async function connectDB() {
  try {
    await mongoose.connect(process.env.DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

/**
 * Generate HTML content for a specific user
 * @param {Object} user - User object containing email and other details
 * @returns {string} HTML content for the email
 */
function generateHtml(user) {
  const dailyContent = emailContent(user)[CONFIG.dayIndex];
  return dailyContent.body;
}

/**
 * Get email subject from content
 * @returns {string} Email subject
 */
function getEmailSubject() {
  return emailContent(users[0])[CONFIG.dayIndex].subject;
}

/**
 * Get list of unsubscribed emails
 * @returns {Promise<string[]>} Array of unsubscribed email addresses
 */
async function getUnsubscribedEmails() {
  try {
    const unsubscribed = await Unsubscribe.find({});
    return unsubscribed.map(entry => entry.email.toLowerCase());
  } catch (err) {
    console.error('❌ Error fetching unsubscribed emails:', err.message);
    return [];
  }
}

/**
 * Filter out unsubscribed users
 * @param {string[]} unsubscribedEmails - Array of unsubscribed email addresses
 * @returns {Array} Filtered users array
 */
function filterUsers(unsubscribedEmails) {
  return users.filter(
    user => !unsubscribedEmails.includes(user.Email.toLowerCase())
  );
}

/**
 * Send a single email using Resend
 * @param {Object} user - User object containing email details
 * @param {string} subject - Email subject
 * @returns {Promise<Object>} Response from Resend API
 */
async function sendSingleEmail(user, subject) {
  const html = generateHtml(user);
  
  const emailData = {
    from: `${CONFIG.fromName} <${CONFIG.fromEmail}>`,
    to: [user.Email],
    subject: subject,
    html: html
  };

  try {
    const data = await resend.emails.send(emailData);
    console.log(`✅ Email sent to ${user.Email} | ID: ${data.id}`);
    return { success: true, email: user.Email, id: data.id };
  } catch (error) {
    console.error(`❌ Failed to send to ${user.Email}:`, error.message);
    return { success: false, email: user.Email, error: error.message };
  }
}

/**
 * Sleep function for delays between batches
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Send emails in batches to avoid rate limits
 * @param {Array} filteredUsers - Array of users to send emails to
 * @param {string} subject - Email subject
 * @returns {Promise<Object>} Summary of sent emails
 */
async function sendEmailsInBatches(filteredUsers, subject) {
  const results = {
    total: filteredUsers.length,
    successful: 0,
    failed: 0,
    errors: []
  };

  // Split users into batches
  for (let i = 0; i < filteredUsers.length; i += CONFIG.batchSize) {
    const batch = filteredUsers.slice(i, i + CONFIG.batchSize);
    const batchNumber = Math.floor(i / CONFIG.batchSize) + 1;
    const totalBatches = Math.ceil(filteredUsers.length / CONFIG.batchSize);
    
    console.log(`\n📧 Processing batch ${batchNumber}/${totalBatches} (${batch.length} emails)...`);
    
    // Send all emails in current batch concurrently
    const batchPromises = batch.map(user => sendSingleEmail(user, subject));
    const batchResults = await Promise.all(batchPromises);
    
    // Count successes and failures
    batchResults.forEach(result => {
      if (result.success) {
        results.successful++;
      } else {
        results.failed++;
        results.errors.push({
          email: result.email,
          error: result.error
        });
      }
    });
    
    // Add delay between batches (except for the last batch)
    if (i + CONFIG.batchSize < filteredUsers.length) {
      console.log(`⏳ Waiting ${CONFIG.delayBetweenBatches}ms before next batch...`);
      await sleep(CONFIG.delayBetweenBatches);
    }
  }

  return results;
}

/**
 * Main function to send emails
 */
async function sendEmails() {
  console.log('🚀 Starting email campaign with Resend...\n');
  
  try {
    // Connect to database
    await connectDB();
    
    // Get unsubscribed emails
    console.log('📋 Fetching unsubscribed emails...');
    const unsubscribedEmails = await getUnsubscribedEmails();
    console.log(`📊 Found ${unsubscribedEmails.length} unsubscribed emails\n`);
    
    // Filter users
    const filteredUsers = filterUsers(unsubscribedEmails);
    
    if (filteredUsers.length === 0) {
      console.log('📭 No users to email. All have unsubscribed.');
      return;
    }
    
    console.log(`✉️  Total users to email: ${filteredUsers.length}`);
    console.log(`📅 Day Index: ${CONFIG.dayIndex}`);
    
    // Get subject
    const subject = getEmailSubject();
    console.log(`📌 Subject: ${subject}\n`);
    
    // Send emails in batches
    const results = await sendEmailsInBatches(filteredUsers, subject);
    
    // Print summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 EMAIL CAMPAIGN SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Successfully sent: ${results.successful}/${results.total}`);
    console.log(`❌ Failed: ${results.failed}/${results.total}`);
    
    if (results.errors.length > 0) {
      console.log('\n❌ Failed emails:');
      results.errors.forEach(err => {
        console.log(`   - ${err.email}: ${err.error}`);
      });
    }
    
    console.log('='.repeat(50) + '\n');
    
  } catch (err) {
    console.error('❌ Error during email processing:', err.message);
    console.error(err.stack);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
  }
}

// Run the script
sendEmails();