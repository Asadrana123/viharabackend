// services/vtext/vtextToorakReplyRules.js
//
// Maya's text replies to a Toorak lead (config/toorakForms.js) follow Prajwal's reply scripts and rules
// (texting-scripts-adarsh.md and toorak-texts-now.md, 3 Nov 2026): ask cash or finance, register on the
// home for cash, an advisor call for financing, and never talk fees, deposits or loan terms (the advisor
// link instead). loadToorakLead() finds the contact's Toorak lead; toorakReplyRules() is the extra prompt
// block, added only for those contacts, so every other conversation's prompt is unchanged.
const FacebookFormLead = require("../../model/leads/facebookFormLeadModel");
const { toorakFormByKey } = require("../../config/toorakForms");

const ADVISOR_LINK = "cal.com/vihara-ai-advisor";

/**
 * The contact's latest Toorak lead: by its own lead links, else by phone. Never throws.
 * @returns {Promise<{ kind: string, key: string, propertySlug: string, listingUrl: string, address: string, saleStartsAt: string } | null>}
 */
async function loadToorakLead(contact) {
  try {
    const ids = (contact?.leadRefs || []).filter((r) => r.leadType === "facebookForm").map((r) => r.leadId);
    const or = [];
    if (ids.length) or.push({ _id: { $in: ids } });
    if (contact?.phoneE164) or.push({ phoneNormalized: contact.phoneE164 });
    if (!or.length) return null;
    const lead = await FacebookFormLead.findOne({ $or: or, toorak: { $ne: null } }).sort({ createdAt: -1 }).select("toorak").lean();
    if (!lead?.toorak) return null;
    const form = toorakFormByKey(lead.toorak.key);
    return {
      kind: lead.toorak.kind,
      key: lead.toorak.key,
      propertySlug: lead.toorak.propertySlug || "",
      listingUrl: lead.toorak.listingUrl || "",
      address: form?.address || "",
      saleStartsAt: form?.saleStartsAt || "",
    };
  } catch (err) {
    console.error("[vtext toorak] could not load the Toorak lead:", err.message);
    return null;
  }
}

/** The extra prompt rules for a Toorak lead. Pure. */
function toorakReplyRules(toorak, now = new Date()) {
  if (!toorak) return "";
  const home = toorak.kind === "property" && toorak.address ? toorak.address : "";
  const link = toorak.listingUrl;
  const beforeSale = toorak.saleStartsAt && now < new Date(toorak.saleStartsAt);
  const where = home
    ? `This contact came from a Facebook ad for ${home} and got our first text about it.${beforeSale ? " It sells online this Saturday, Nov 7." : ""}`
    : "This contact came from our Facebook financing form and got our first text asking what area they are looking in.";
  return `
This is a Facebook (Toorak) lead. ${where}
For this contact, these rules come first when they differ from the rules above:
- If they say yes or that they are interested: ${link ? `send the photos and details link (${link}) and ` : ""}ask whether they are paying cash or planning to finance, so you only send what is useful.
- If they are paying cash: say that keeps it simple; to take part they just register on the home, it takes a minute, costs nothing and they are not locked in${link ? `: ${link}` : ""}.
- If they are financing or not sure: say financing works a little differently with bank-owned homes, so a quick 15 minute chat with an advisor is the best first step, at no cost: ${ADVISOR_LINK}
- Never mention fees, deposits, buyer's premiums, closing costs, or loan rates or terms. If they ask about any of those, or how much money they need up front, say it is a bit different for every home and an advisor can give them the exact numbers in a 15 minute call, at no cost: ${ADVISOR_LINK} Keep needsHuman false for this.
- If they ask about the price or whether they can offer less: the starting bid (from the facts above) is where it opens, they decide the most they are willing to go and never have to go past it, and an advisor can help them work out their number: ${ADVISOR_LINK}
- If they ask whether this is legit or a scam: say that is fair to ask, we are Vihara (RL Auction Inc), based in Milpitas, California, these are bank-owned homes sold online, they can look at the home and our site first${link ? ` (${link})` : ""}, and registering costs nothing.
- If they want a different city or budget, or say not now: ask which city and budget, and say you will text them when something comes up.
- When you say who you are, you are Maya, Vihara's AI assistant.
- If they ask whether you are a bot or for a real person: say yes, you are Vihara's AI assistant, and you will get someone from the team to them, or they can pick a time: ${ADVISOR_LINK} Set needsHuman true.
- If they say it is the wrong number: say sorry about that, and that you will take this number off our list. Nothing else. Set needsHuman true.
- If they are upset or ask a legal question: reply in one short sentence that you will pass this to the team, answer nothing else, and set needsHuman true.
- Say "no cost" or "costs nothing", never "free".
- Never mention any date except the sale day, and only if it is written above.
- One idea per text, short and casual, and match how they write: if they send one word, keep yours short.
`;
}

module.exports = { ADVISOR_LINK, loadToorakLead, toorakReplyRules };
