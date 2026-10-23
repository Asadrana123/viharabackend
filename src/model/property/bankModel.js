const mongoose = require("mongoose");

// A bank (or other institution) that owns properties. Admin-only bookkeeping:
// a property points at its bank through productModel.bankId, and the admin
// Leads / Auction Registrations / Buyer Match pages can then be viewed by bank.
// Banks have no login — unlike sellers, they're just a name to group by.
const bankSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Please enter the bank name"],
        maxLength: [100, "Bank name cannot exceed 100 characters"],
        trim: true
    },
    // Lower-cased, single-spaced name — keeps "Chase" and " chase " one bank.
    nameKey: {
        type: String,
        required: true,
        unique: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

bankSchema.statics.keyOf = (name) =>
    String(name || "").trim().replace(/\s+/g, " ").toLowerCase();

module.exports = mongoose.model("bankModel", bankSchema);
