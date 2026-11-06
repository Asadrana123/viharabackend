// services/calcom/calcomBookingService.js
//
// Handles a Cal.com booking webhook (routes/integrations/calcomWebhookRoutes.js):
//   BOOKING_CREATED      -> save the booking, find a phone, plan its reminder texts
//   BOOKING_RESCHEDULED  -> the old booking's reminders are cancelled, the new booking gets its own
//   BOOKING_CANCELLED / BOOKING_REJECTED -> pending reminders are cancelled
// Anything else (PING, MEETING_ENDED, ...) is ignored.
//
// The phone: the walkthrough booking form asks only name + email, so the
// number comes from a lead with the same email (any lead collection, most
// recently updated first). If the form ever gets a phone question, that
// number wins. No phone -> the booking is saved with no reminders and the
// Vtext Slack channel is told.
//
// Sending is done by calcomReminderScheduler.js, not here.
const CalBooking = require("../../model/calcom/calBookingModel");
const { ALL_LEAD_SOURCES } = require("../leads/leadModelsByType");
const { normalizeInternationalPhone } = require("../../utils/internationalPhone");
const { notifyVtextAlert } = require("../shared/slackService");
const { parseBooking, planReminders, isReminderEvent } = require("./calcomPayload");

const CREATE_EVENTS = new Set(["BOOKING_CREATED", "BOOKING_RESCHEDULED"]);
const CANCEL_EVENTS = new Set(["BOOKING_CANCELLED", "BOOKING_REJECTED"]);

/** The most recently updated lead with this email and a usable phone, across every lead collection. */
async function findLeadPhoneByEmail(email) {
  if (!email) return null;
  let best = null;
  for (const [leadType, { model }] of Object.entries(ALL_LEAD_SOURCES)) {
    try {
      const leads = await model
        .find({ email })
        .select("_id phone phoneNormalized updatedAt createdAt")
        .sort({ updatedAt: -1 })
        .limit(5)
        .lean();
      for (const lead of leads) {
        const phone = normalizeInternationalPhone(lead.phoneNormalized) || normalizeInternationalPhone(lead.phone);
        if (!phone) continue;
        const at = new Date(lead.updatedAt || lead.createdAt || 0).getTime();
        if (!best || at > best.at) best = { phone, leadType, leadId: lead._id, at };
        break; // the newest usable lead in this collection is enough
      }
    } catch (err) {
      console.error(`[calcom] lead lookup failed for ${leadType}:`, err.message);
    }
  }
  return best;
}

/** Cancels the still-pending reminders of a booking. */
async function cancelPendingReminders(uid, reason) {
  const now = new Date();
  await CalBooking.updateOne(
    { uid },
    { $set: { "reminders.$[r].status": "cancelled", "reminders.$[r].reason": reason, "reminders.$[r].doneAt": now } },
    { arrayFilters: [{ "r.status": "pending" }] }
  );
}

async function alertNoPhone(b, reason, notify = notifyVtextAlert) {
  await notify({
    level: "warning",
    title: "Cal.com booking gets no reminder text",
    fields: [
      { label: "Booker", value: b.attendee.name || "(no name)" },
      { label: "Email", value: b.attendee.email || "(none)" },
      { label: "Call at", value: b.startTime ? b.startTime.toISOString().replace("T", " ").slice(0, 16) + " UTC" : "?" },
      { label: "Why", value: reason },
    ],
  }).catch((e) => console.error("[calcom] Slack alert failed:", e.message));
}

async function handleCreated(b, { now, deps }) {
  if (b.rescheduleUid && b.rescheduleUid !== b.uid) {
    await CalBooking.updateOne(
      { uid: b.rescheduleUid, status: "booked" },
      { $set: { status: "rescheduled", rescheduledToUid: b.uid, lastEvent: b.event, lastEventAt: now } }
    );
    await cancelPendingReminders(b.rescheduleUid, "rescheduled");
  }

  const existing = await CalBooking.findOne({ uid: b.uid }).select("status").lean();
  if (existing) {
    // A repeat delivery, or the booking was cancelled before this arrived. Either way nothing new to plan.
    console.log(`[calcom] ${b.event} ${b.uid}: already on file (${existing.status}), nothing to do`);
    return { action: "exists" };
  }

  let phone = b.formPhone;
  let phoneSource = phone ? "booking-form" : null;
  let leadRef;
  if (!phone) {
    const match = await (deps.findLeadPhoneByEmail || findLeadPhoneByEmail)(b.attendee.email);
    if (match) {
      phone = match.phone;
      phoneSource = "lead-email";
      leadRef = { leadType: match.leadType, leadId: match.leadId };
    }
  }

  const noPhoneReason = phone
    ? undefined
    : b.attendee.email ? "no phone on the booking and no lead with this email" : "no phone and no email on the booking";

  const reminders = phone ? planReminders(b.startTime, now).map((r) => ({ ...r, status: "pending" })) : [];
  try {
    await CalBooking.create({
      uid: b.uid,
      bookingId: b.bookingId,
      eventTitle: b.eventTitle,
      eventSlug: b.eventSlug,
      status: "booked",
      startTime: b.startTime,
      endTime: b.endTime,
      meetingUrl: b.meetingUrl || undefined,
      rescheduledFromUid: b.rescheduleUid || undefined,
      attendee: b.attendee,
      phoneE164: phone || undefined,
      phoneSource,
      leadRef,
      noPhoneReason,
      reminders,
      lastEvent: b.event,
      lastEventAt: now,
    });
  } catch (err) {
    if (err?.code === 11000) return { action: "exists" }; // the same delivery arrived twice at once
    throw err;
  }

  if (!phone) await alertNoPhone(b, noPhoneReason, deps.notify);
  console.log(`[calcom] ${b.event} ${b.uid}: saved, ${reminders.length} reminder(s)${phone ? ` (phone from ${phoneSource})` : ", no phone"}`);
  return { action: "saved", reminders: reminders.length, phoneSource };
}

async function handleCancelled(b, { now }) {
  const result = await CalBooking.updateOne(
    { uid: b.uid, status: "booked" },
    { $set: { status: "cancelled", cancelledAt: now, lastEvent: b.event, lastEventAt: now } }
  );
  if (result.matchedCount) {
    await cancelPendingReminders(b.uid, "booking cancelled");
    console.log(`[calcom] ${b.event} ${b.uid}: cancelled its reminders`);
    return { action: "cancelled" };
  }
  // Not on file yet (the cancel arrived first): keep a cancelled row so a late BOOKING_CREATED can't plan reminders.
  await CalBooking.updateOne(
    { uid: b.uid },
    { $setOnInsert: { uid: b.uid, status: "cancelled", cancelledAt: now, attendee: b.attendee, startTime: b.startTime, lastEvent: b.event, lastEventAt: now } },
    { upsert: true }
  ).catch((err) => {
    if (err?.code !== 11000) throw err;
  });
  return { action: "cancelled-unknown" };
}

/**
 * Processes one verified webhook body. Never throws (it runs after Cal.com already got its 200).
 * @param {object} body - { triggerEvent, payload }
 * Bookings of events not in CALCOM_REMINDER_EVENTS are ignored (nothing saved, no alert).
 * @param {object} [deps] - for tests: { now, findLeadPhoneByEmail, notify, events }
 */
async function handleCalWebhook(body, deps = {}) {
  const now = deps.now || new Date();
  try {
    const b = parseBooking(body);
    if (!b || !b.uid) return { action: "ignored" };
    if (!isReminderEvent(b.eventSlug, deps.events)) {
      console.log(`[calcom] ${b.event} ${b.uid}: event "${b.eventSlug || "?"}" gets no reminders, ignored`);
      return { action: "ignored-event" };
    }
    if (CREATE_EVENTS.has(b.event)) return await handleCreated(b, { now, deps });
    if (CANCEL_EVENTS.has(b.event)) return await handleCancelled(b, { now });
    return { action: "ignored" };
  } catch (err) {
    console.error(`[calcom] webhook ${body?.triggerEvent} failed:`, err.message);
    return { action: "error", error: err.message };
  }
}

module.exports = { handleCalWebhook, findLeadPhoneByEmail };
