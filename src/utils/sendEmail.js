const nodemailer = require('nodemailer');
// Create a transporter
const transporter = nodemailer.createTransport({
    service: 'Gmail', // You can use other services like Yahoo, Outlook, etc.
    auth: {
        user: process.env.EMAIL_USERNAME, // Your email address
        pass: process.env.EMAIL_PASSWORD  // Your email password
    }
});
// Function to send an email
// `attachments` is optional and defaults to none, so every existing
// sendEmail(to, name, subject, html) call keeps working untouched.
const sendEmail = (to, name, subject, html, attachments = []) => {
    console.log(subject);
    const mailOptions = {
        from: `"Vihara" <${process.env.EMAIL_USERNAME}>`,
        to,                            // Recipient address
        subject,                  // Subject of the email
        html
    };

    if (Array.isArray(attachments) && attachments.length > 0) {
        mailOptions.attachments = attachments;
    }

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            return console.log(error, 'main error');
        }
        console.log('Email sent: ' + info.response);
    });
};

module.exports = sendEmail;
