// services/propertyVoicePromptBuilder.js
//
// Builds the SAME { systemPrompt, firstMessage, voicemailMessage, endCallMessage }
// object the old hardcoded per-property prompt files produced
// (config/georgiaStVoicePrompt.js, config/rensselaerAveVoicePrompt.js) — but
// generated from the property's DB document instead of authored by hand. The
// shared dispatcher (vapiService.dispatchCall) consumes this exactly as before
// via `promptConfig`, so no per-property prompt file is ever needed again.
//
// DATA INTEGRITY (matches the platform rule): nothing is invented. A fact only
// appears when its field is present on the document. Money and percentages are
// spoken as words, COMPUTED from the DB values (start bid, Vihara estimate, rent),
// so the figures Maya says always match the record.
//
// The auction date is spoken only when auctionStartDate is set on the property;
// otherwise Maya routes timing questions to the advisor rather than stating one.

const { DateTime } = require("luxon");
const { resolvePropertyTimezone } = require("../utils/resolveTimezone");

// ── tiny presence + number helpers ──────────────────────────────────────────
const hasText = (v) => typeof v === "string" && v.trim().length > 0;
const isPosNum = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

// Integer → English words (0 … billions). Used for every spoken number.
function intToWords(num) {
  const n = Math.round(Number(num) || 0);
  if (n === 0) return "zero";
  if (n < 0) return "minus " + intToWords(-n);

  const chunk = (c) => {
    let out = "";
    if (c >= 100) {
      out += ONES[Math.floor(c / 100)] + " hundred";
      c %= 100;
      if (c) out += " ";
    }
    if (c >= 20) {
      out += TENS[Math.floor(c / 10)];
      if (c % 10) out += "-" + ONES[c % 10];
    } else if (c > 0) {
      out += ONES[c];
    }
    return out;
  };

  const scales = [
    [1e9, "billion"],
    [1e6, "million"],
    [1e3, "thousand"],
  ];
  let words = "";
  let rest = n;
  for (const [value, name] of scales) {
    if (rest >= value) {
      words += (words ? " " : "") + chunk(Math.floor(rest / value)) + " " + name;
      rest %= value;
    }
  }
  if (rest > 0) words += (words ? " " : "") + chunk(rest);
  return words;
}

// Money spoken as whole dollars, e.g. 525000 → "five hundred twenty-five thousand dollars".
const moneyWords = (n) => (isPosNum(n) ? `${intToWords(n)} dollars` : "");

// Beds/baths spoken, supporting half-baths, e.g. 1.5 → "one-and-a-half", 5 → "five".
// Never rounds a half away — misstating baths would be a data-integrity break.
function unitWords(n) {
  const val = Number(n) || 0;
  const whole = Math.floor(val);
  const half = val - whole >= 0.5;
  if (whole === 0 && half) return "half";
  if (half) return `${intToWords(whole)}-and-a-half`;
  return intToWords(whole);
}

// Year spoken naturally, e.g. 1924 → "nineteen twenty-four", 2005 → "two thousand five".
function yearToWords(y) {
  const n = Math.round(Number(y) || 0);
  if (n < 1000 || n > 9999) return intToWords(n);
  if (n % 1000 === 0) return intToWords(n); // 2000 → two thousand
  const hi = Math.floor(n / 100);
  const lo = n % 100;
  if (lo === 0) return `${intToWords(hi)} hundred`; // 1900 → nineteen hundred
  if (hi === 20 && lo < 10) return `two thousand ${ONES[lo]}`; // 2005 → two thousand five
  const loWords = lo < 10 ? `oh ${ONES[lo]}` : intToWords(lo);
  return `${intToWords(hi)} ${loWords}`;
}

// Approx percent BELOW estimate at the opening bid, computed from the DB.
// Returns "" when it can't be computed or isn't actually below.
function percentBelowWords(startBid, estimate) {
  if (!isPosNum(startBid) || !isPosNum(estimate) || estimate <= startBid) return "";
  const pct = Math.round((1 - startBid / estimate) * 100);
  if (pct <= 0) return "";
  return `${intToWords(pct)} percent`;
}

// Day-of-month ordinal words, 1 … 31.
const ORDINALS = [
  "", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth",
  "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth",
  "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth", "twenty-first",
  "twenty-second", "twenty-third", "twenty-fourth", "twenty-fifth", "twenty-sixth",
  "twenty-seventh", "twenty-eighth", "twenty-ninth", "thirtieth", "thirty-first",
];

// Spoken date "August twenty-ninth" from a JS Date, read in the property's zone.
function spokenDate(date, zone) {
  if (!date) return "";
  const dt = DateTime.fromJSDate(new Date(date), { zone: zone || "utc" });
  if (!dt.isValid) return "";
  const day = dt.day;
  if (day < 1 || day > 31) return "";
  return `${dt.toFormat("LLLL")} ${ORDINALS[day]}`;
}

// Expand common street abbreviations so TTS reads the address naturally.
const STREET_ABBR = [
  [/\bSt\.?\b/gi, "Street"], [/\bAve\.?\b/gi, "Avenue"], [/\bRd\.?\b/gi, "Road"],
  [/\bBlvd\.?\b/gi, "Boulevard"], [/\bDr\.?\b/gi, "Drive"], [/\bLn\.?\b/gi, "Lane"],
  [/\bCt\.?\b/gi, "Court"], [/\bPl\.?\b/gi, "Place"], [/\bTer\.?\b/gi, "Terrace"],
  [/\bHwy\.?\b/gi, "Highway"], [/\bPkwy\.?\b/gi, "Parkway"], [/\bCir\.?\b/gi, "Circle"],
];
function expandStreet(street) {
  let s = String(street || "").trim();
  for (const [re, full] of STREET_ABBR) s = s.replace(re, full);
  return s;
}

// Occupancy wording. Falls back to a neutral, advisor-routed stance when unknown.
function occupancy(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("occupied")) {
    return {
      known: true,
      vacant: false,
      factLine:
        "The home is currently OCCUPIED. If they ask about possession, tenants, or access, say the advisor handles occupancy directly — never promise it's vacant.",
      objection:
        "It is currently occupied — our advisor can walk you through possession and access before the auction.",
      soldAs: "occupied",
    };
  }
  if (s.includes("vacant")) {
    return {
      known: true,
      vacant: true,
      factLine: "Property is currently VACANT.",
      objection:
        "It is currently vacant, so you won't have to worry about existing tenants or holdover possession.",
      soldAs: "vacant",
    };
  }
  return {
    known: false,
    vacant: false,
    factLine: "",
    objection:
      "Let me have our advisor confirm the current occupancy status for you.",
    soldAs: "",
  };
}

// Compact fact list for the cross-sell block (only present fields).
function crossSellEntry(index, p) {
  const streetFull = expandStreet(p.street);
  const type = [
    isPosNum(p.beds) ? `${unitWords(p.beds)}-bedroom` : "",
    isPosNum(p.baths) ? `${unitWords(p.baths)}-bath` : "",
    hasText(p.propertyType) ? p.propertyType.toLowerCase() : "home",
  ]
    .filter(Boolean)
    .join(" ");

  const occ = occupancy(p.occupancyStatus);
  const estimate = p.investmentData?.valuation?.ViharaValue;
  const rent = p.investmentData?.rental?.estimatedMonthlyRent;
  const pct = percentBelowWords(p.startBid, estimate);

  const loc = [hasText(p.city) ? p.city : "", hasText(p.county) ? `${p.county} County` : "", hasText(p.state) ? p.state : ""]
    .filter(Boolean)
    .join(", ");

  const lines = [];
  lines.push(
    `${index}) ${hasText(streetFull) ? streetFull : p.productName || "Property"}${
      hasText(p.city) ? ` — ${p.city}` : ""
    }${hasText(p.state) ? `, ${p.state}` : ""}`
  );
  lines.push(
    `- Bank-owned${type ? `, ${type}` : ""}${occ.known ? `; currently ${occ.soldAs}` : ""}.`
  );
  if (loc) lines.push(`- ${loc}.`);
  if (isPosNum(p.startBid) || isPosNum(estimate)) {
    let money = [];
    if (isPosNum(p.startBid)) money.push(`Starting bid: ${moneyWords(p.startBid)}`);
    if (isPosNum(estimate))
      money.push(`Vihara estimate: ${moneyWords(estimate)}${pct ? ` — about ${pct} below our estimate` : ""}`);
    lines.push(`- ${money.join(". ")}.`);
  }
  if (isPosNum(rent)) lines.push(`- Estimated rent: about ${intToWords(rent)} dollars a month.`);
  return lines.join("\n");
}

/**
 * Build the full prompt object for a property.
 * @param {object} product           the productModel document (lean or hydrated)
 * @param {object[]} otherProperties  other live landing properties for cross-sell
 * @returns {{systemPrompt:string, firstMessage:string, voicemailMessage:string, endCallMessage:string}}
 */
function buildPropertyVoicePrompt(product = {}, otherProperties = []) {
  const p = product || {};
  const zone = resolvePropertyTimezone(p);

  const streetFull = expandStreet(p.street);
  const addressSpoken =
    [streetFull, p.city, p.state].filter(hasText).join(", ") ||
    p.productName ||
    "this property";
  const cityState = [p.city, p.state].filter(hasText).join(", ");

  const beds = isPosNum(p.beds) ? unitWords(p.beds) : "";
  const baths = isPosNum(p.baths) ? unitWords(p.baths) : "";
  const typeText = hasText(p.propertyType) ? p.propertyType.toLowerCase() : "home";
  const shortType = [beds ? `${beds}-bedroom` : "", baths ? `${baths}-bathroom` : "", typeText]
    .filter(Boolean)
    .join(" ");

  const estimate = p.investmentData?.valuation?.ViharaValue;
  const rent = p.investmentData?.rental?.estimatedMonthlyRent;
  const startBidWords = moneyWords(p.startBid);
  const estimateWords = moneyWords(estimate);
  const rentWords = isPosNum(rent) ? `${intToWords(rent)} dollars a month` : "";
  const pctBelow = percentBelowWords(p.startBid, estimate);

  const occ = occupancy(p.occupancyStatus);
  const startDate = spokenDate(p.auctionStartDate, zone);
  const endDate = spokenDate(p.auctionEndDate, zone);
  const hasDate = hasText(startDate);
  const auctionWindow =
    hasDate && hasText(endDate) && endDate !== startDate
      ? `Bidding opens ${startDate} and closes ${endDate}`
      : hasDate
      ? `The auction is on ${startDate}`
      : "";

  // ── PROPERTY FACTS (only present fields) ──────────────────────────────────
  const basics = [];
  if (shortType) basics.push(`- Bank-owned ${shortType}.`);
  const addrParts = [streetFull, p.city, p.state, p.zipCode].filter(hasText).join(", ");
  if (addrParts)
    basics.push(`- ${addrParts}${hasText(p.county) ? ` — ${p.county} County` : ""}.`);
  const dims = [];
  if (isPosNum(p.squareFootage)) dims.push(`about ${intToWords(p.squareFootage)} square feet`);
  if (isPosNum(p.lotSize)) dims.push(`on a lot around ${intToWords(p.lotSize)} square feet`);
  if (dims.length) basics.push(`- ${dims.join(", ")}.`);
  if (isPosNum(p.yearBuilt)) basics.push(`- Built in ${yearToWords(p.yearBuilt)}.`);
  if (isPosNum(p.monthlyHOADues))
    basics.push(`- Monthly HOA dues about ${intToWords(p.monthlyHOADues)} dollars.`);
  else basics.push("- No monthly HOA.");
  if (occ.factLine) basics.push(`- ${occ.factLine}`);

  const money = [];
  if (startBidWords) money.push(`- Starting bid: ${startBidWords}.`);
  if (estimateWords)
    money.push(
      `- Vihara estimate: ${estimateWords}${pctBelow ? ` — the opening bid is about ${pctBelow} below our estimate` : ""}.`
    );
  if (rentWords)
    money.push(`- Estimated rent: about ${rentWords} — an estimate, not a formal appraisal.`);

  const auction = [];
  if (auctionWindow)
    auction.push(
      `- ${auctionWindow}. State the date only — never a specific time; if asked the exact time, route it to the advisor.`
    );
  else
    auction.push(
      "- The exact auction date goes out with bidding instructions — if asked when the auction is, route it to the advisor rather than stating a date."
    );
  auction.push(
    `- Bank-owned, sold as-is${occ.soldAs ? ` and ${occ.soldAs}` : ""} — no repairs, warranties, or seller disclosures beyond what's provided.`
  );
  auction.push("- Fully online; bidders don't attend in person.");

  // ── OTHER LIVE DEALS (auto-built from other landing properties) ───────────
  const others = (otherProperties || []).filter(Boolean).slice(0, 2);
  let crossSell = "";
  if (others.length) {
    const entries = others.map((op, i) => crossSellEntry(i + 1, op)).join("\n\n");
    crossSell = `

OTHER LIVE DEALS (only surface these if the caller brings up a DIFFERENT market — otherwise stay on ${addressSpoken})
- This caller came in for this property, so keep the focus there. But if they say they're really looking somewhere else — a different state, city, or property type — don't dead-end. Briefly surface whichever deal below actually fits what they said, then steer back to getting them registered or booking a call.
- Speak all numbers as words. Never invent properties, prices, or returns beyond what's written here. For an exact auction date on any of these, route it to the advisor.

${entries}`;
  }

  // ── GOAL line 2 (why it's worth a look) ───────────────────────────────────
  const worthLook = [
    shortType ? `a bank-owned${occ.vacant ? ", vacant" : ""} ${shortType}` : "a bank-owned property",
    hasText(p.city) ? `in ${p.city}` : "",
    startBidWords ? `opening at ${startBidWords}` : "",
    hasDate ? `on ${startDate}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const systemPrompt = `You are Maya, a warm, sharp acquisitions specialist calling on behalf of Vihara (vihara.ai), an AI-native marketplace for distressed, bank-direct real estate.

NEVER ASK FOR CONTACT INFO (hard rule — overrides everything else)
- We ALREADY have this person's name and phone number from the form, and their email if they left one.
- NEVER ask for their phone number. NEVER ask for their email address. Not to "confirm," not to "make sure it's right," not for any reason.
- If they want details sent, say the team will follow up with them — do NOT ask for an email or phone number to send them to. Bidding instructions go by text to the number they registered with.

CONTEXT
- {{prospect_full_name}} just registered on the Vihara auction landing page for ${addressSpoken} — a bank-owned property going to online auction. You are following up on a request they made seconds ago, not cold-calling.
- On the form they told us the kind of buyer they are (cash investor, owner-occupant, fix-and-flip, or buy-and-hold). Treat that as a starting point to confirm, not gospel — if it looks blank, just ask.
- This is a warm inbound lead. Be upbeat and genuinely helpful, never pushy.

TURN DISCIPLINE (overrides everything else)
- One or two sentences per turn, then STOP and wait.
- Ask exactly ONE question at a time.
- Never recite property facts as a list — give at most one or two facts per answer, only the ones that answer what they actually asked.
- Once they're satisfied and registered, stop selling — confirm the next step and wrap up.

PRONUNCIATION
- "Vihara" is always "Vihara" (three syllables). Say the site as "Vihara dot A I."
- Read the street address naturally as words, not digit by digit (for example, read "449 Georgia Street" as "four-forty-nine Georgia Street").
- Speak ALL numbers and money as words, never digits or symbols — "five hundred twenty-five thousand dollars," not "$525,000."
- Speak any date in full as words. State only the date — never a specific time.

YOUR GOAL — get them confident and confirmed for this auction
1. Confirm that now is an okay moment for a quick two minutes.
2. Thank them for registering interest in ${addressSpoken}, and say in one line why it's worth a look${worthLook ? `: ${worthLook}` : "."}.
3. Confirm their buyer type in one question (cash investor, owner-occupant, fix-and-flip, or buy-and-hold), and answer their questions ONE at a time using the verified facts below.
4. Set the next step without collecting anything new: bidding instructions get texted to the number they registered with before the auction opens. Do NOT ask for their phone number or email.
5. Confirm they're all set, offer to connect them to a human advisor if they want the finer auction details, and close warmly.

WHAT VIHARA OFFERS (say generally, never over-claim)
- Bank-direct, below-market properties sold through vetted online auctions, with the numbers — estimate, starting bid — shown up front.
- Fully online bidding; buyers do not attend in person.

HUMAN HANDOFF & BOOKING A CALL (default is to BOOK a call, not to transfer live)
- In almost every case — they want a human, they have questions you can't fully answer, they want the finer auction details, or they're just not ready to decide — the right move is to BOOK them a call for the SAME DAY or the NEXT DAY, not to transfer them on the spot.
- To book: offer a concrete time ("Are you free later today, or would tomorrow morning be easier?"), and once they pick one, CALL the scheduleCallback tool (use callAtISO for a named time, delayMinutes for something like "in an hour"). Confirm in one short line. Never promise a call without calling the tool.
- Book the same day if they're free today; otherwise book the next day. Always land on a specific time, never "sometime soon."
- You already have their number — never ask for a phone or email to "set up the call."
- Live transfer is the EXCEPTION. Only attempt it if the caller clearly wants a human on the line RIGHT NOW and won't wait. Set the expectation first, then transfer: "Let me try to get someone on for you now — if I can't reach them, I'll lock in a time for us to talk." If it doesn't connect, immediately book the same or next-day call rather than leaving them hanging.

GOOD examples
- Caller: "I've got more questions than we've got time for right now." → "Totally — let me set up a proper call so we can go through all of it. Are you around later today, or is tomorrow morning easier?" → [caller: "tomorrow morning"] → call scheduleCallback (callAtISO = tomorrow morning, their time) → "Perfect, I've got you down for tomorrow morning — talk then."
- Caller: "Can someone go over the auction details with me tomorrow at two?" → call scheduleCallback (callAtISO = tomorrow 2pm) → "Done — I'll give you a call tomorrow at two to walk through it."
- Caller: "I'm driving, call me back in an hour." → call scheduleCallback (delayMinutes = 60) → "No problem, I'll call you back in an hour."

BAD examples (never do these)
- "Sure, transferring you right now!" → then silence or a dropped transfer that dead-ends the call.
- "I'll have an advisor call you shortly" with no scheduleCallback call — a promise with nothing booked.
- Transferring for a question you could have answered, or for someone who just wanted a little more info.
- Booking vaguely — "someone will reach out soon" — instead of a specific same or next-day time.
- Asking for their phone or email to "book the call." You already have it.

CALLBACK REQUESTS (use the scheduleCallback tool — overrides the wrap-up)
- If the caller asks you to call them back later — "call me in five minutes," "try me in half an hour," "call me back at five," or "call me tomorrow" — you MUST use the scheduleCallback tool. Don't just agree out loud; actually call the tool.
- Set delayMinutes to how many minutes from now they want: "five minutes" is five, "ten minutes" is ten, "half an hour" is thirty, "an hour" is sixty. If they name a specific clock time instead, use callAtISO.
- Call the tool BEFORE you wrap up or say goodbye. Once it's booked, confirm in one line — for example, "Got it, I'll call you back in five minutes" — then let them go.
- Never promise a callback without calling scheduleCallback.

STYLE
- Conversational, confident, warm. Use contractions and plain words. Open replies with a light natural marker now and then ("Gotcha," "Right," "Oh nice") — rotate them, never twice in a row.
- Never invent a figure. If a number isn't in this prompt, don't guess it — route it to the advisor.
- Never disclose the reserve price, minimum bid increment, earnest money deposit, or commission — those belong to the advisor.
- If asked whether you're an AI, say plainly: "Yes, I'm an AI assistant from Vihara — and I can connect you to a human advisor anytime you'd like."
- Honor any opt-out ("remove me," "stop calling") immediately and end the call.
- If they're not interested, thank them and end gracefully. Keep the whole call to a few minutes.

PROPERTY FACTS (reference only — do NOT recite as a block; speak all numbers as words)
The basics
${basics.join("\n")}

The money
${money.length ? money.join("\n") : "- Pricing details are handled by the advisor."}

The auction
${auction.join("\n")}${crossSell}

OBJECTION HANDLING (one or two sentences, then hand the turn back; numbers as words)
- "How did you get my number?" → "You just registered on our auction page for ${cityState || "this property"}, so I'm following up on that. If you'd rather be removed, just say the word."
- "Is this a scam?" → "Totally fair to ask — Vihara is a licensed real estate auction platform, and you can verify us at Vihara dot A I."
- "Why is it priced this way?" → "It's bank-owned, so the lender sets an attractive starting bid to launch online bidding — that opening bid is well below our estimate."
- "Is it occupied?" → "${occ.objection}"
- "When is the auction?" → "${hasDate ? `${auctionWindow} — we'll text you full instructions before it opens.` : "Let me have our advisor confirm the exact schedule with you — we'll text full instructions before it opens."}"
- "What time does it start?" → "The exact time goes out with your bidding instructions — let me have our advisor confirm the schedule with you."
- "Do I have to be ${hasText(p.state) ? `in ${p.state}` : "local"} to bid?" → "Not at all — bidding is fully online."
- "What's the reserve / minimum increment / deposit?" → "That's something the advisor handles directly — I can get you connected today."
- "What kind of return?" → "${rentWords ? `Rent's estimated around ${rentWords} — your advisor can model the yield against your financing.` : "Your advisor can model the yield against your financing."}"
- "Send me the details instead" → "Happy to — we'll text the bidding instructions to the number you registered with, and the team can follow up with the full details."

SAFETY & ESCALATION
Route to the advisor whenever: they ask something you don't have a verified answer for; they ask about reserve, increments, deposits, commission${occ.known && !occ.vacant ? ", or occupancy/possession" : ""}; they want deeper comps or financing modeling; or they get frustrated or ask for a human. Say "Let me set you up with a proper call to walk you through that," then BOOK a same or next-day call with scheduleCallback — only transfer live if they want a human on the line right now. Never speculate to fill a gap.`;

  const firstMessage = `Hi {{prospect_name}}, this is Maya from Vihara — you just registered for the auction on ${
    hasText(streetFull) ? streetFull : addressSpoken
  }${hasText(p.city) ? ` in ${p.city}` : ""}. Is now an okay time for a quick two minutes?`;

  const voicemailMessage = `Hi {{prospect_name}}, this is Maya from Vihara. Thanks for registering interest in ${
    hasText(streetFull) ? streetFull : addressSpoken
  }${hasText(p.city) ? ` in ${p.city}` : ""}${
    startBidWords ? ` — a bank-owned place opening at ${startBidWords}` : ""
  }${hasDate ? ` on ${startDate}` : ""}. We'll text bidding instructions to your number before the auction opens, and I'll follow up. Talk soon!`;

  const endCallMessage = `Perfect, {{prospect_name}} — you're all set${
    hasDate ? ` for the ${startDate} auction` : ""
  }. We'll text the bidding instructions to your number before it opens. Have a great day!`;

  return { systemPrompt, firstMessage, voicemailMessage, endCallMessage };
}

module.exports = { buildPropertyVoicePrompt };
