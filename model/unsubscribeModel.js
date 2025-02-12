const mongoose = require("mongoose");

const unsubscribeSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    unsubscribedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Unsubscribe", unsubscribeSchema);
