// model/calcom/calBookingModel.js
//
// One row per Cal.com booking (by Cal.com's booking uid), written by the
// Cal.com webhook (services/calcom/calcomBookingService.js). Holds the
// reminder texts for the booking; a per-minute sweep sends the ones that are
// due through Vtext (services/calcom/calcomReminderScheduler.js).
//
// A reschedule is a NEW booking in Cal.com (new uid). The old row is marked
// "rescheduled" (its pending reminders cancelled) and the new row keeps the
// old uid in rescheduledFromUid.
const mongoose = require("mongoose");

const reminderSchema = new mongoose.Schema(
  {
    minutesBefore: { type: Number, required: true },
    sendAt: { type: Date, required: true },
    // pending -> sending -> queued (handed to Vtext) | blocked | skipped | failed; cancelled when the booking moves or is cancelled.
    status: { type: String, enum: ["pending", "sending", "queued", "blocked", "skipped", "failed", "cancelled"], default: "pending" },
    messageId: { type: mongoose.Schema.Types.ObjectId },
    reason: { type: String },
    doneAt: { type: Date },
  },
  { _id: false }
);

const calBookingSchema = new mongoose.Schema(
  {
    uid: { type: String, required: true, unique: true },
    bookingId: { type: Number },
    eventTitle: { type: String },
    eventSlug: { type: String },
    status: { type: String, enum: ["booked", "rescheduled", "cancelled"], default: "booked", index: true },
    startTime: { type: Date },
    endTime: { type: Date },
    meetingUrl: { type: String },
    rescheduledFromUid: { type: String },
    rescheduledToUid: { type: String },

    attendee: {
      name: { type: String },
      email: { type: String, lowercase: true, trim: true },
      timeZone: { type: String },
    },
    // Where the number came from: the booking form itself, or a lead found by the booker's email.
    phoneE164: { type: String },
    phoneSource: { type: String, enum: ["booking-form", "lead-email", null], default: null },
    leadRef: {
      leadType: { type: String },
      leadId: { type: mongoose.Schema.Types.ObjectId },
    },
    noPhoneReason: { type: String },

    reminders: { type: [reminderSchema], default: [] },
    lastEvent: { type: String },
    lastEventAt: { type: Date },
    cancelledAt: { type: Date },
  },
  { timestamps: true }
);

// The reminder sweep looks up pending reminders that are due.
calBookingSchema.index({ "reminders.status": 1, "reminders.sendAt": 1 });

module.exports = mongoose.model("calBookingModel", calBookingSchema);
