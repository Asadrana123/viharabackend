const mongoose = require('mongoose');

const formSchema = new mongoose.Schema({
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
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    default: '',
  },
  contactMethods: {
    type: [String],
    required: true,
  },
}, {
  timestamps: true, // This will add createdAt and updatedAt fields automatically
});

const Form = mongoose.model('Form', formSchema);

module.exports = Form;
