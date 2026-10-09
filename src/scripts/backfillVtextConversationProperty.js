// scripts/backfillVtextConversationProperty.js
//
// One-off: sets `propertyId` on existing Vtext conversations that don't have one, so the
// inbox property pill and filter cover threads created before that field existed.
//
// A conversation's property comes from its contact, in this order:
//   1. contact.followUp.propertyId  (set when the contact signed up on /auction/:slug)
//   2. the contact's "property" lead -> propertySlug -> the property with that slug
//   3. otherwise, the street address named in the conversation's own texts (the signup text and
//      follow-ups say "... interest in 100 Pedras Rd, Turlock, CA ..."): the newest text that names
//      exactly one known street wins. If two properties share a street, the newest listing is used.
// Conversations with none of these stay blank. Never overwrites an existing propertyId.
//
//   node src/scripts/backfillVtextConversationProperty.js           # dry run, writes nothing
//   node src/scripts/backfillVtextConversationProperty.js --apply   # writes

try { require("dotenv").config(); } catch (_) { /* env already set on Render */ }

const mongoose = require("mongoose");
const VtextConversation = require("../model/vtext/vtextConversationModel");
const VtextContact = require("../model/vtext/vtextContactModel");
const PropertyLead = require("../model/leads/propertyLeadModel");
const VtextMessage = require("../model/vtext/vtextMessageModel");
const Product = require("../model/property/productModel");

const APPLY = process.argv.includes("--apply");

// Needs a house number so a street like "Main St" alone can't match by accident.
const usableStreet = (street) => typeof street === "string" && street.trim().length >= 5 && /\d/.test(street);
const normalize = (text) => String(text || "").toLowerCase().replace(/\s+/g, " ");

/** The property whose street the newest matching text names, or undefined. */
function propertyFromMessages(bodies, streets) {
  for (const body of bodies) {
    const text = normalize(body);
    const hits = new Set(streets.filter((s) => text.includes(s.street)).map((s) => String(s.id)));
    if (hits.size === 1) return streets.find((s) => String(s.id) === [...hits][0]).id;
  }
  return undefined;
}

async function run() {
  await mongoose.connect(process.env.DB_URI);
  console.log(`[backfill] connected. mode: ${APPLY ? "APPLY" : "dry run"}`);

  const conversations = await VtextConversation.find({ propertyId: { $exists: false } }).select("contactId").lean();
  const contacts = await VtextContact.find({ _id: { $in: conversations.map((c) => c.contactId) } })
    .select("followUp.propertyId leadRefs")
    .lean();
  const contactById = new Map(contacts.map((c) => [String(c._id), c]));

  // Contacts with no follow-up property: resolve through their property lead.
  const leadIds = [];
  for (const c of contacts) {
    if (c.followUp?.propertyId) continue;
    for (const ref of c.leadRefs || []) if (ref.leadType === "property") leadIds.push(ref.leadId);
  }
  const leads = await PropertyLead.find({ _id: { $in: leadIds } }).select("propertySlug").lean();
  const slugByLeadId = new Map(leads.map((l) => [String(l._id), l.propertySlug]));
  const products = await Product.find({ slug: { $in: [...new Set(leads.map((l) => l.propertySlug))] } }).select("slug").lean();
  const productIdBySlug = new Map(products.map((p) => [p.slug, p._id]));

  // Streets of every property, newest listing first so a re-listed street resolves to the latest one.
  const allProducts = await Product.find({ street: { $exists: true, $ne: "" } }).select("street createdAt").sort({ createdAt: -1 }).lean();
  const streetToId = new Map();
  for (const p of allProducts) {
    const street = normalize(p.street);
    if (usableStreet(street) && !streetToId.has(street)) streetToId.set(street, p._id);
  }
  const streets = [...streetToId].map(([street, id]) => ({ street, id }));

  const ops = [];
  let fromText = 0;
  for (const conv of conversations) {
    const contact = contactById.get(String(conv.contactId));
    if (!contact) continue;
    let propertyId = contact.followUp?.propertyId;
    if (!propertyId) {
      for (const ref of contact.leadRefs || []) {
        if (ref.leadType !== "property") continue;
        propertyId = productIdBySlug.get(slugByLeadId.get(String(ref.leadId)));
        if (propertyId) break;
      }
    }
    if (!propertyId) {
      const messages = await VtextMessage.find({ contactId: conv.contactId, direction: "out" }).sort({ createdAt: -1 }).limit(20).select("body").lean();
      propertyId = propertyFromMessages(messages.map((m) => m.body), streets);
      if (propertyId) fromText++;
    }
    if (propertyId) ops.push({ updateOne: { filter: { _id: conv._id, propertyId: { $exists: false } }, update: { $set: { propertyId } } } });
  }

  console.log(`[backfill] ${conversations.length} conversations without a property; ${ops.length} can be matched (${fromText} by message text), ${conversations.length - ops.length} stay blank`);
  if (APPLY && ops.length) {
    const result = await VtextConversation.bulkWrite(ops);
    console.log(`[backfill] updated ${result.modifiedCount}`);
  }
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("[backfill] failed:", err);
  process.exit(1);
});
