// services/calcom/calcomReminderScheduler.js
//
// Every minute: sends the Cal.com call reminders that are due, through Vtext.
// Off unless CALCOM_REMINDERS_ENABLED=true and VTEXT_ENABLED=true.
//
// Why not Vtext's own scheduledFor: a message queued for later sits as
// "queued", and the stuck-message sweep re-routes any queued message older
// than 2 minutes, so it would go out early. Here the reminder stays in Mongo
// (calBookingModel) and is handed to Vtext only when it is due.
//
// Consent follows the Vtext consent switch, like every other automatic text
// (enqueueOutbound's gate). A reminder is never sent once the call is less
// than LAST_CALL_MINUTES away.
const cron = require("node-cron");
const CalBooking = require("../../model/calcom/calBookingModel");
const { enqueueOutbound } = require("../vtext/vtextMessageService");
const { reminderText, isTooLate } = require("./calcomPayload");

const ENABLED = () => process.env.VTEXT_ENABLED === "true" && process.env.CALCOM_REMINDERS_ENABLED === "true";
const BATCH = 50;

const keyFor = (uid, minutesBefore) => `calcom-reminder-${uid}-${minutesBefore}`;

/** Sets one reminder's fields, only if it is still in `fromStatus`. Returns true when it changed. */
async function setReminder(bookingId, minutesBefore, fromStatus, fields) {
  const $set = {};
  for (const [k, v] of Object.entries(fields)) $set[`reminders.$[r].${k}`] = v;
  const res = await CalBooking.updateOne(
    { _id: bookingId },
    { $set },
    { arrayFilters: [{ "r.minutesBefore": minutesBefore, "r.status": fromStatus }] }
  );
  return res.modifiedCount > 0;
}

async function sendOne(booking, reminder, now, send) {
  const m = reminder.minutesBefore;
  if (isTooLate(booking.startTime, now)) {
    await setReminder(booking._id, m, "pending", { status: "skipped", reason: "too close to the call", doneAt: now });
    console.warn(`[calcom reminder] ${booking.uid} ${m}min skipped: too close to the call`);
    return "skipped";
  }
  // Claim it, so an overlapping sweep (or a second server) can't send it too.
  if (!(await setReminder(booking._id, m, "pending", { status: "sending" }))) return "taken";

  const body = reminderText({
    name: booking.attendee?.name,
    startTime: booking.startTime,
    timeZone: booking.attendee?.timeZone,
    phoneE164: booking.phoneE164,
    meetingUrl: booking.meetingUrl,
    uid: booking.uid,
    now,
  });

  try {
    const { message, blocked, reason } = await send({
      to: booking.phoneE164,
      body,
      origin: { kind: "automation", templateKey: `calcom-reminder-${m}`, ...(booking.leadRef?.leadId ? { leadRef: booking.leadRef } : {}) },
      contactName: booking.attendee?.name || undefined,
      idempotencyKey: keyFor(booking.uid, m),
    });
    if (blocked) {
      await setReminder(booking._id, m, "sending", { status: "blocked", reason: `blocked by Vtext: ${reason}`, messageId: message?._id, doneAt: now });
      console.log(`[calcom reminder] ${booking.uid} ${m}min blocked: ${reason}`);
      return "blocked";
    }
    await setReminder(booking._id, m, "sending", { status: "queued", messageId: message?._id, doneAt: now });
    console.log(`[calcom reminder] ${booking.uid} ${m}min queued (message ${message?._id})`);
    return "queued";
  } catch (err) {
    if (err?.code === 11000) {
      // Already handed to Vtext on an earlier try; Vtext's own sweep delivers it.
      await setReminder(booking._id, m, "sending", { status: "queued", reason: "already queued", doneAt: now });
      return "queued";
    }
    // Put it back so the next minute retries (until it is too close to the call).
    console.error(`[calcom reminder] ${booking.uid} ${m}min failed, will retry:`, err.message);
    await setReminder(booking._id, m, "sending", { status: "pending", reason: `retrying: ${err.message}` });
    return "retry";
  }
}

let sweeping = false;

/**
 * One sweep. Exported for tests and a manual run.
 * @param {object} [opts] - { now, enqueueOutbound } (tests inject both)
 * @returns {Promise<Record<string, number>>} counts by outcome
 */
async function sendDueReminders({ now = new Date(), enqueueOutbound: send = enqueueOutbound, force = false } = {}) {
  const counts = {};
  if (!force && !ENABLED()) return counts;
  if (sweeping) return counts;
  sweeping = true;
  try {
    const due = await CalBooking.find({
      status: "booked",
      reminders: { $elemMatch: { status: "pending", sendAt: { $lte: now } } },
    })
      .sort({ startTime: 1 })
      .limit(BATCH)
      .lean();

    for (const booking of due) {
      const pending = (booking.reminders || []).filter((r) => r.status === "pending" && new Date(r.sendAt) <= now);
      // Two offsets due at once (the worker was down): only the latest one is worth sending.
      pending.sort((a, b) => a.minutesBefore - b.minutesBefore);
      for (const [i, r] of pending.entries()) {
        try {
          let outcome;
          if (i > 0) {
            await setReminder(booking._id, r.minutesBefore, "pending", { status: "skipped", reason: "a later reminder went instead", doneAt: now });
            outcome = "skipped";
          } else {
            outcome = await sendOne(booking, r, now, send);
          }
          counts[outcome] = (counts[outcome] || 0) + 1;
        } catch (err) {
          console.error(`[calcom reminder] ${booking.uid} ${r.minutesBefore}min:`, err.message);
        }
      }
    }
  } finally {
    sweeping = false;
  }
  return counts;
}

function startCalcomReminderScheduler() {
  if (!ENABLED()) {
    console.log("[calcom reminder] off (CALCOM_REMINDERS_ENABLED / VTEXT_ENABLED not both true)");
    return;
  }
  cron.schedule("* * * * *", () => {
    sendDueReminders().catch((err) => console.error("[calcom reminder] sweep failed:", err.message));
  });
  console.log("[calcom reminder] sweep started (every minute)");
}

module.exports = { startCalcomReminderScheduler, sendDueReminders };
