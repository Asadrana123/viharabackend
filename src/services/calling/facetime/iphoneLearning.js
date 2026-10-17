// services/calling/facetime/iphoneLearning.js
//
// Learns "is this number on iPhone?" from our own iMessages, for the FaceTime
// test. BlueBubbles has no way to ask Apple directly (its checkReachability
// returns null), but every iMessage we send tells us afterwards:
//   - Delivered / Read → the number is registered with iMessage → iPhone
//   - error 22         → not an iMessage user → not iPhone
// Writes only contact.iphone, never channelReachability, so the vText router
// behaves exactly as before. Never throws: it rides along on the webhook path.
const VtextContact = require("../../../model/vtext/vtextContactModel");

/**
 * @param {object} message - the vtextMessage the status update was for (after the update)
 * @param {object} event - the parsed status event ({ status, errorCode })
 */
async function learnFromMessageStatus(message, event) {
  try {
    if (!message || message.direction !== "out" || message.channelType !== "imessage-bluebubbles") return;

    let isIphone = null;
    if (event.status === "delivered" || event.status === "read") isIphone = true;
    else if (event.status === "failed" && String(event.errorCode) === "22") isIphone = false;
    if (isIphone === null) return;

    await VtextContact.updateOne(
      { _id: message.contactId, "iphone.isIphone": { $ne: isIphone } },
      { $set: { "iphone.isIphone": isIphone, "iphone.learnedAt": new Date(), "iphone.fromMessageId": message._id } }
    );
  } catch (err) {
    console.error("[facetime] iPhone learning failed (non-fatal):", err.message);
  }
}

module.exports = { learnFromMessageStatus };
