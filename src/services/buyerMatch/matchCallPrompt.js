// services/buyerMatch/matchCallPrompt.js
//
// The script for a Buyer Match call: "a property just came up that fits what
// you told us". Different from every other script, because this buyer never
// asked about this property — the signup / property-page scripts ("you just
// told us you're interested in this home") would be false here.
//
// Property facts are written into the text (not {{variables}}) so the SAME
// script works on the callback path, which dials without property variables.
// The shared blocks (tone, objections, callbacks, AI disclosure, opt-out, the
// caller's local time) and call memory are appended by vapiService on every call.

const { CALLBACK_MARKER } = require("../../config/voicePromptFollowUp");

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

// Engagement notes ("Answered our call") explain the score, not why the
// PROPERTY fits — keep them out of the pitch.
const ENGAGEMENT_REASON = /answered our call|signed up|opens our emails|registered for|calls stopped/i;
const quote = (s) => clean(s).replace(/"/g, "'");

/** "Where: Sacramento · Budget: Up to $450K" lines from what the buyer told us. */
function wantsLines(wants = {}) {
  const rows = [
    ["Where they want to buy", wants.location],
    ["Budget", wants.budget],
    ["Kind of buyer", wants.buyerType],
    ["Bedrooms", wants.beds],
    ["When they want to buy", wants.timing],
  ].filter(([, v]) => clean(v));
  return rows.length ? rows.map(([k, v]) => `  - ${k}: ${quote(v)}`).join("\n") : "  - (They didn't tell us much — ask one easy question about what they're looking for.)";
}

function propertyLines(p = {}) {
  return [
    ["Address", p.address],
    ["Type", p.type],
    ["Starting bid", p.starting_bid],
    ["Vihara estimate of value", p.estimate],
    ["Estimated monthly rent", p.monthly_rent],
    // Filled per call in the buyer's own timezone (vapiPromptService).
    ...(p.auctionWindow
      ? [
          ["Online auction — bidding opens", "{{auction_start_local}}"],
          ["Bidding closes", "{{auction_end_local}}"],
        ]
      : []),
    ["Listing", p.listing_url],
  ]
    .filter(([, v]) => clean(v))
    .map(([k, v]) => `  - ${k}: ${clean(v)}`)
    .join("\n");
}

/**
 * @param {object} args
 *   property    resolved spoken facts (vapiPropertyService.resolveProperty)
 *   wants       { location, budget, buyerType, beds, timing } — buyer's answers
 *   reasons     why it fits (Buyer Match green notes)
 *   concerns    what may not fit (orange notes)
 *   background  short note from enrichment we already have (never fetched here)
 *   mode        "first" | "followup" | "callback"
 *   leaveVoicemail  only the first unanswered call leaves a voicemail
 *   note        what they said when they asked for a callback
 * @returns {{ systemPrompt, firstMessage, voicemailMessage, endCallMessage }}
 */
function buildMatchCallPrompt({
  property = {},
  wants = {},
  reasons = [],
  concerns = [],
  background = "",
  mode = "first",
  leaveVoicemail = false,
  note = "",
} = {}) {
  const address = clean(property.address) || "a property we just listed";
  reasons = reasons.filter((r) => !ENGAGEMENT_REASON.test(r));
  concerns = concerns.filter((c) => !ENGAGEMENT_REASON.test(c));

  const callbackBlock =
    mode === "callback"
      ? `${CALLBACK_MARKER}overrides the opening below)
- The buyer ASKED you to call them back at this time, during an earlier call about this property. Open by saying you're calling back like they asked, and pick up where you left off (see what you already know about this caller).${
          note ? `\n- When they asked for the callback they said: "${quote(note)}".` : ""
        }

`
      : "";

  const followUpLine =
    mode === "followup"
      ? "\n- You've tried them before about this property and didn't reach them. Don't apologise at length — one light line, then get to the point."
      : "";

  const systemPrompt = `${callbackBlock}You are Maya, a warm, sharp acquisitions specialist calling on behalf of Vihara (vihara.ai), an AI-native marketplace for distressed, bank-direct real estate.

WHY YOU ARE CALLING (read carefully)
- {{prospect_full_name}} signed up with Vihara earlier and told us what kind of property they're looking for.
- A property just came up that matches what they told us, and you're calling to let them know.
- They have NOT asked about this property, registered for it, or shown interest in it. Never say or suggest they did.${followUpLine}

WHAT THEY TOLD US THEY'RE LOOKING FOR
${wantsLines(wants)}

WHY THIS PROPERTY FITS THEM (use one or two of these in your own words — never read them as a list)
${reasons.length ? reasons.map((r) => `  - ${quote(r)}`).join("\n") : "  - It matches the area and kind of property they asked for."}
${
  concerns.length
    ? `
POSSIBLE DOWNSIDES (don't volunteer them, but be honest if they come up)
${concerns.map((c) => `  - ${quote(c)}`).join("\n")}
`
    : ""
}${background ? `\nBACKGROUND ON THE BUYER (only to sound informed — never quote it back)\n  - ${quote(background)}\n` : ""}
THE PROPERTY (only use these facts — if they ask something not here, say their Vihara advisor will follow up with the details)
${propertyLines(property)}

YOUR GOAL
1. Check it's an okay moment for two minutes.
2. In one or two sentences, say why you thought of them — tie it to what THEY told us (area, budget, kind of buyer).
3. Ask if it sounds interesting.
4. If it does: offer to book a time with their Vihara advisor (use scheduleCallback for a time that suits them), or point them to the listing to register for the auction.
5. If it doesn't: ask ONE question about what would fit better (area, budget, or type of property), thank them, and wrap up warmly.
6. If they ask not to be called again, respect it right away.

RULES
- One or two sentences per turn, then stop and listen. One question at a time.
- Never ask for their phone number or email — we already have them.
- Never promise a price, a discount, or that they'll win the auction.
- You may share the Vihara estimate and the auction times above. The times are already in the buyer's own timezone — say them naturally ("Saturday, October seventeenth at eleven A M your time"), and skip any that are blank.`;

  const firstMessage = {
    first: `Hi {{prospect_name}}, this is Maya from Vihara. You told us what you're looking for, and a property just came up that I think fits — have you got a quick minute?`,
    followup: `Hi {{prospect_name}}, it's Maya from Vihara again — I tried you earlier about a property that fits what you told us you're looking for. Got a quick minute?`,
    callback: `Hi {{prospect_name}}, it's Maya from Vihara, calling you back like you asked about the property at ${address}. Is now a better time?`,
  }[mode];

  return {
    systemPrompt,
    firstMessage,
    // Only the first unanswered call leaves a message; ten voicemails feel like spam.
    voicemailMessage: leaveVoicemail
      ? `Hi {{prospect_name}}, this is Maya from Vihara. A property just came up at ${address} that fits what you told us you're looking for. I'll try you again soon${
          clean(property.listing_url) ? `, or you can take a look at ${clean(property.listing_url)}` : ""
        }. Talk soon!`
      : "",
    endCallMessage: "Thanks so much, {{prospect_name}} — talk soon!",
    // Carried to the dial so {{auction_*_local}} are filled in this buyer's time.
    auctionWindow: property.auctionWindow || null,
  };
}

module.exports = { buildMatchCallPrompt };
