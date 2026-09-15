const mongoose = require("mongoose");

// Tracks which Facebook leads have already been handled, so polling never
// calls the same person twice. A single sentinel doc (leadgenId "__SEEDED__")
// records that first-run seeding has happened.
const fbProcessedLeadSchema = new mongoose.Schema({
  leadgenId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  calledAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("fbProcessedLeadModel", fbProcessedLeadSchema);
