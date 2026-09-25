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

// Additive sibling export for the outbound campaign feature (see
// outboundplan.md §5.2/§5.3). `sendEmail` above is deliberately left exactly
// as it was — it's a fire-and-forget callback with no way to know if a send
// succeeded, which ~30 existing call sites already depend on (an unawaited
// rejecting Promise there could crash the process with an unhandled
// rejection). This reuses the same transporter/credentials but returns a
// Promise so a bulk sender can record a real success/failure per recipient.
const sendEmailAsync = (to, subject, html, attachments = []) => {
    const mailOptions = {
        from: `"Vihara" <${process.env.EMAIL_USERNAME}>`,
        to,
        subject,
        html,
    };

    if (Array.isArray(attachments) && attachments.length > 0) {
        mailOptions.attachments = attachments;
    }

    return transporter.sendMail(mailOptions);
};

module.exports = sendEmail;
module.exports.sendEmailAsync = sendEmailAsync;
