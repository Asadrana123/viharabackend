// Import mongoose
const mongoose = require('mongoose');

// Define the schema
const contactSchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: true,
    },
    lastName: {
        type: String,
        required: true,
    },
    companyName: {
        type: String,
    },
    email: {
        type: String,
        required: true,
        // match: [/.+\@.+\..+/, 'Please fill a valid email address'],
    },
    phone: {
        type: String,
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
}, {
    timestamps: true, // Adds createdAt and updatedAt timestamps
});

// Create the model
const Contact = mongoose.model('Contact', contactSchema);

// Export the model
module.exports = Contact;
