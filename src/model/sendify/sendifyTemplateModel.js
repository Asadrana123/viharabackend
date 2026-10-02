// model/sendify/sendifyTemplateModel.js
//
// A reusable message template for the Send tab — written once, with
// {{variable}} placeholders, then rendered against whichever property is
// selected at send time (sendifyTemplateService.js). Not property-specific
// itself (no propertyId field): the same template can be reused across many
// properties, same idea as voicePromptModel is per-property but templates
// here are deliberately the opposite — one template, any property.
const mongoose = require("mongoose");

const sendifyTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    body: { type: String, required: true }, // contains {{property_...}} placeholders — see sendifyTemplateService.TEMPLATE_VARIABLES
    createdBy: {
      adminId: { type: mongoose.Schema.Types.ObjectId },
      adminName: { type: String },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("sendifyTemplateModel", sendifyTemplateSchema);
