// services/leads/crossFunnelLeads.js
//
// Shared by the cross-funnel admin lists (Interested, Test): every lead of the
// given collections, tagged with its funnel, filtered by `keep`, newest
// activity first. Honours the leadListView params — ?view=summary returns light
// rows, ?id= returns that one lead fully loaded (whatever funnel it is in).

const { getEmailEventsForEmails } = require("../integrations/emailEventsService");
const { getNotesForLeads } = require("./leadNotesService");
const { getVtextMessagesForPhones } = require("../vtext/vtextLeadMessagesService");
const { normalisePhone } = require("../calling/vapiCallsService");
const { listView, unlessSummary, listSelect, callsForList, shapeLeads } = require("./leadListView");

/**
 * @param {object[]} sources  [{ model, leadType, label }]
 * @param {function} keep     (lead) => boolean — which leads belong in the list
 * @param {boolean}  [notesInSummary]  load notes in summary mode too (when
 *                                     `keep` reads them); they're not returned
 */
async function sendCrossFunnelList(req, res, { sources, keep, notesInSummary = false }) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  // limit=all → the whole list in one response (the admin Leads tab scrolls
  // through everything; this list is rebuilt in full on every request anyway).
  const all = req.query.limit === "all";
  const limit = all ? 0 : Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const view = listView(req);
  if (view.badId) return res.status(400).json({ success: false, message: "Invalid id" });

  const perSource = await Promise.all(
    sources.map(async ({ model, leadType, label }) => {
      const leads = await model.find(view.id ? { _id: view.id } : {}).select(listSelect(view)).sort({ createdAt: -1 }).lean();

      const phones = leads.map((l) => l.phone).filter(Boolean);
      const emailAddresses = leads.map((l) => l.email).filter(Boolean);
      const leadIds = leads.map((l) => l._id);

      const [messagesByPhone, callsFor, eventsByEmail, notesByLead] = await Promise.all([
        getVtextMessagesForPhones(unlessSummary(view, phones)),
        callsForList(view, phones),
        getEmailEventsForEmails(unlessSummary(view, emailAddresses)),
        getNotesForLeads(leadType, notesInSummary ? leadIds : unlessSummary(view, leadIds)),
      ]);

      return leads.map((lead) => ({
        ...lead,
        // Unify partner (firstName + lastName) and renovation-contractor (name)
        // with the rest (fullName).
        fullName: lead.fullName || lead.name || [lead.firstName, lead.lastName].filter(Boolean).join(" "),
        leadType,              // drives note edit/delete on the right collection
        leadTypeLabel: label,  // human label for the Source column
        ...callsFor(lead.phone),
        emails: eventsByEmail[String(lead.email || "").toLowerCase()] || [],
        notes: notesByLead[String(lead._id)] || [],
        messages: messagesByPhone[normalisePhone(lead.phone)] || [],
      }));
    })
  );

  // An opened lead is shown whatever list it was opened from.
  const leads = view.id ? perSource.flat() : perSource.flat().filter(keep);

  // Newest activity first — latest call, else when the lead came in.
  const activityAt = (lead) => {
    const latest = lead.calls[0]; // calls are newest-first
    const callTs = latest?.startedAt ? new Date(latest.startedAt).getTime() : 0;
    const createdTs = lead.createdAt ? new Date(lead.createdAt).getTime() : 0;
    return Math.max(callTs, createdTs);
  };
  leads.sort((a, b) => activityAt(b) - activityAt(a));

  const total = leads.length;
  const start = all ? 0 : (page - 1) * limit;
  const pageLeads = all ? leads : leads.slice(start, start + limit);

  res.status(200).json({
    success: true,
    leads: shapeLeads(view, pageLeads),
    pagination: all
      ? { page: 1, limit: total, total, pages: 1 }
      : { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

module.exports = { sendCrossFunnelList };
