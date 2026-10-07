// model/vtext/vtextTemplateModel.js
//
// A reusable message template for the Send tab — written once, with
// {{variable}} placeholders, then rendered against whichever property is
// selected at send time (vtextTemplateService.js). Not property-specific
// itself (no propertyId field): the same template can be reused across many
// properties, same idea as voicePromptModel is per-property but templates
// here are deliberately the opposite — one template, any property.
const mongoose = require("mongoose");

const vtextTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    body: { type: String, required: true }, // contains {{property_...}} placeholders — see vtextTemplateService.TEMPLATE_VARIABLES
    // At most one template is ever true at a time (enforced in the controller,
    // not the schema — a unique partial index on a boolean is awkward, and this
    // field changes rarely enough that an app-level invariant is simpler).
    // vtextAutoSignupService.js looks this one up to text a new property-page
    // signup automatically, same consent basis as Brevo's own SMS checkbox.
    // Superseded by autoSignupRole below; no longer read.
    isAutoSignupTemplate: { type: Boolean, default: false },
    // Which automatic signup text this template is. At most one template holds each
    // role (enforced in the controller). The signup text picks the role by comparing the
    // lead's quoted price with the property's starting bid (vtextAutoSignupService.js).
    autoSignupRole: { type: String, enum: ["", "quote_in_range", "quote_short"], default: "" },
    createdBy: {
      adminId: { type: mongoose.Schema.Types.ObjectId },
      adminName: { type: String },
    },
  },
  { timestamps: true }
);

// Collection name pinned to its pre-rename value so the Sendify->Vtext
// rename does not orphan any data already stored in Mongo.
module.exports = mongoose.model("vtextTemplateModel", vtextTemplateSchema, "sendifytemplatemodels");
