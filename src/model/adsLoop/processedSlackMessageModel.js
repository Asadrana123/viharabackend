const mongoose = require("mongoose");

// Listener idempotency (spec table `processed_message_ids`). A Slack message,
// reaction or button click is claimed here (unique key) before it is handled,
// so a Slack retry or a replay after a restart can never act twice, and never
// launch the same ad twice.

const processedSlackMessageSchema = new mongoose.Schema({
    // Message ts, or "<kind>:<id>" for reactions and button clicks.
    key: { type: String, required: true, unique: true },
    channel: { type: String, required: true },
    handledAt: { type: Date, required: true, default: Date.now },
});

module.exports = mongoose.model("processedSlackMessage", processedSlackMessageSchema);
