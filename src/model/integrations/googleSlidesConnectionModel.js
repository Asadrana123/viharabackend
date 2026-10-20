// model/integrations/googleSlidesConnectionModel.js
//
// The one Google account the Slides agent uses (key "default"). An admin
// connects it from the admin panel; decks are created in that account's Drive.
// The refresh token is stored encrypted (utils/secretBox), never in plain text.
const mongoose = require("mongoose");

const googleSlidesConnectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    googleEmail: { type: String, default: "", trim: true },
    scopes: { type: [String], default: [] },
    refreshToken: {
      iv: { type: String, required: true },
      tag: { type: String, required: true },
      ciphertext: { type: String, required: true },
    },
    connectedById: { type: mongoose.Schema.Types.ObjectId },
    connectedByName: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("googleSlidesConnectionModel", googleSlidesConnectionSchema);
