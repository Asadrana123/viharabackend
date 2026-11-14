// services/vtext/vtextRichContentGate.js
//
// No links and no images to someone who has never written back to us.
//
// Every iMessage line provider we looked at (Linq, Photon, Blooio, and the demos with Project Blue,
// TextMaddy and Sendify) holds links, media and attachments back until the person has sent a written
// reply. A tapback ("Loved ...") is not a reply. Images and links to strangers who never answered are
// one of the strongest spam signals for Apple, and US carriers filter links on SMS the same way, so
// the rule covers every channel.
//
// Applied once, in enqueueOutbound, so every sender is covered (follow-ups, forms, Cal.com reminders,
// one-off scripts like the Toorak sale update, admin sends):
//   - an image is dropped and the message's plain `body` goes instead
//   - a body with a link is swapped for the caller's `bodyWithoutLinks` when it gave one,
//     otherwise the message is blocked with a clear reason
const VtextMessage = require("../../model/vtext/vtextMessageModel");

// http(s) links, www. links, and bare domains like vihara.ai/listing/x or cal.com
// (Messages turns those into tappable links on its own).
const LINK_RE =
  /\bhttps?:\/\/\S|\bwww\.[a-z0-9-]|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|ai|net|org|io|co|us|ly|me|link|app|gl|gle|info|biz|site|page|to)\b(?:\/\S*)?/i;

// How Messages writes a tapback as text: Loved "...", Laughed at "...", Reacted 👍 to "...",
// Removed a heart from "...". BlueBubbles hands these over as normal new messages.
const REACTION_RE =
  /^\s*(?:Loved|Liked|Disliked|Laughed at|Emphasized|Questioned|Reacted .{1,12} to|Removed an? .{1,30} from) [“"]/;

const BLOCK_REASON = "it has a link, and links only go to people who have replied to us (this lead hasn't yet)";

/** True when the text has something Messages or a carrier would treat as a link. */
function hasLink(body) {
  return LINK_RE.test(String(body || ""));
}

/** True for a tapback written out as text. */
function isReactionText(body) {
  return REACTION_RE.test(String(body || ""));
}

/**
 * Has this contact ever sent us a written reply (not just a tapback)?
 * @param {object} contact - needs _id and lastInboundAt
 */
async function hasWrittenReply(contact) {
  if (!contact?._id || !contact.lastInboundAt) return false; // never texted us at all: no query needed
  const found = await VtextMessage.exists({
    contactId: contact._id,
    direction: "in",
    body: { $regex: /\S/, $not: REACTION_RE },
  });
  return Boolean(found);
}

/**
 * Pure: what actually goes out, given whether the person has replied.
 * @param {object} p
 * @param {string} p.body
 * @param {string} [p.bodyWithoutLinks] - the caller's version with no links, used before a reply
 * @param {{file: string, label?: string}} [p.media]
 * @param {boolean} p.replied
 * @returns {{ body: string, media?: object, blockReason?: string, changes: string[] }}
 */
function decideRichContent({ body, bodyWithoutLinks, media, replied }) {
  if (replied) return { body, media, changes: [] };

  const changes = [];
  let out = body;
  if (hasLink(out)) {
    if (bodyWithoutLinks && !hasLink(bodyWithoutLinks)) {
      out = bodyWithoutLinks;
      changes.push("links left out (no reply yet)");
    } else {
      return { body, media: undefined, blockReason: BLOCK_REASON, changes };
    }
  }
  if (media?.file) changes.push("image left out (no reply yet)");
  return { body: out, media: undefined, changes };
}

/**
 * Looks the reply up only when the message carries a link or an image.
 * @returns {Promise<ReturnType<typeof decideRichContent>>}
 */
async function applyRichContentRule({ contact, body, bodyWithoutLinks, media }) {
  if (!media?.file && !hasLink(body)) return { body, media, changes: [] };
  const replied = await hasWrittenReply(contact);
  return decideRichContent({ body, bodyWithoutLinks, media, replied });
}

module.exports = { hasLink, isReactionText, hasWrittenReply, decideRichContent, applyRichContentRule, BLOCK_REASON, LINK_RE, REACTION_RE };
