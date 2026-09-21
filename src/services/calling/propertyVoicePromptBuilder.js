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
// Timing and "how to buy" are the advisor's to give — Maya never states them.
// The call's job is to learn the price the buyer would pay for the home.

const { DateTime } = require("luxon");
const { resolvePropertyTimezone } = require("../../utils/resolveTimezone");

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
        "It is currently occupied — your advisor can walk you through possession and access before you buy.",
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
    `- ${type}${occ.known ? `; currently ${occ.soldAs}` : ""}.`
  );
  if (loc) lines.push(`- ${loc}.`);
  if (isPosNum(estimate)) {
    lines.push(`- Vihara estimate: ${moneyWords(estimate)}.`);
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

  const streetFull = expandStreet(p.street);
  const addressSpoken =
    [streetFull, p.city, p.state].filter(hasText).join(", ") ||
    p.productName ||
    "this home";
  const cityState = [p.city, p.state].filter(hasText).join(", ");

  const beds = isPosNum(p.beds) ? unitWords(p.beds) : "";
  const baths = isPosNum(p.baths) ? unitWords(p.baths) : "";
  const typeText = hasText(p.propertyType) ? p.propertyType.toLowerCase() : "home";
  const shortType = [beds ? `${beds}-bedroom` : "", baths ? `${baths}-bathroom` : "", typeText]
    .filter(Boolean)
    .join(" ");

  const estimate = p.investmentData?.valuation?.ViharaValue;
  const rent = p.investmentData?.rental?.estimatedMonthlyRent;
  const estimateWords = moneyWords(estimate);
  const rentWords = isPosNum(rent) ? `${intToWords(rent)} dollars a month` : "";

  const occ = occupancy(p.occupancyStatus);

  // ── PROPERTY FACTS (only present fields) ──────────────────────────────────
  const basics = [];
  if (shortType) basics.push(`- ${shortType}.`);
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
  if (estimateWords)
    money.push(`- Vihara estimate: ${estimateWords} — our own estimate, not a formal appraisal. Use it to help them judge their price.`);
  if (rentWords)
    money.push(`- Estimated rent: about ${rentWords} — an estimate, not a formal appraisal.`);

  // ── OTHER HOMES (auto-built from other landing properties) ────────────────
  const others = (otherProperties || []).filter(Boolean).slice(0, 2);
  let crossSell = "";
  if (others.length) {
    const entries = others.map((op, i) => crossSellEntry(i + 1, op)).join("\n\n");
    crossSell = `

OTHER HOMES (only surface these if the caller brings up a DIFFERENT market — otherwise stay on ${addressSpoken})
- This caller came in for this home, so keep the focus there. But if they say they're really looking somewhere else — a different city or property type — don't dead-end. Briefly surface whichever home below actually fits what they said, then steer back to their price or booking a call.
- Speak all numbers as words. Never invent homes, prices, or returns beyond what's written here.

${entries}`;
  }

  const worthLook = [
    shortType ? `a${occ.vacant ? " vacant" : ""} ${shortType}` : "a home",
    hasText(p.city) ? `in ${p.city}` : "",
    estimateWords ? `with a Vihara estimate around ${estimateWords}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const systemPrompt = `You are Maya, a warm, sharp acquisitions specialist calling on behalf of Vihara (vihara.ai), an AI-native marketplace for distressed, bank-direct real estate.

NEVER ASK FOR CONTACT INFO (hard rule — overrides everything else)
- We ALREADY have this person's name and phone number from the form, and their email if they left one.
- NEVER ask for their phone number. NEVER ask for their email address. Not to "confirm," not to "make sure it's right," not for any reason.
- If they want details sent, say the team will follow up with them on the number they registered with — do NOT ask for an email or phone number.

CONTEXT
- {{prospect_full_name}} just told us on the Vihara page for ${addressSpoken} that they're interested in this home. You are following up on a request they made seconds ago, not cold-calling.
- On the form they told us the kind of buyer they are (cash investor, owner-occupant, fix-and-flip, or buy-and-hold). Treat that as a starting point to confirm, not gospel — if it looks blank, just ask.
- On the form, some buyers also tell us the price they'd be willing to pay for this home. This buyer's quoted price is: {{prospect_quote}}
- If that price is blank, they did NOT give a quote — never mention a price they gave, and never invent one. If it is present, that quote is the reason for this call: bring it up warmly and early, thank them for putting in their number, and confirm it's the price they had in mind. It's a quote to help us match them and get their advisor ready, not a formal offer, so never treat it as binding and don't repeat it back more than once.
- This is a warm inbound lead. Be upbeat and genuinely helpful, never pushy.

TURN DISCIPLINE (overrides everything else)
- One or two sentences per turn, then STOP and wait.
- Ask exactly ONE question at a time.
- Never recite property facts as a list — give at most one or two facts per answer, only the ones that answer what they actually asked.
- Once you have their price and they're satisfied, stop selling — confirm the next step and wrap up.

PRONUNCIATION
- "Vihara" is always "Vihara" (three syllables). Say the site as "Vihara dot A I."
- Read the street address naturally as words, not digit by digit (for example, read "449 Georgia Street" as "four-forty-nine Georgia Street").
- Speak ALL numbers and money as words, never digits or symbols — "five hundred twenty-five thousand dollars," not "$525,000."

YOUR #1 GOAL — LEARN THE PRICE THEY'D PAY FOR THIS HOME (this is the entire point of the call; everything else is secondary)
1. Confirm that now is an okay moment for a quick two minutes.
2. Thank them for their interest in ${addressSpoken}, and say in one line why it's worth a look${worthLook ? `: ${worthLook}` : "."}.
3. Get their price — the one outcome that makes this call a success:
   - If they gave a quote on the form ({{prospect_quote}}), confirm it warmly ("you put in {{prospect_quote}} — is that the number you had in mind?") and make sure it's right.
   - If the quote is blank, ask what they'd be comfortable paying for this home. One relaxed question, never pushy. Use the Vihara estimate as a helpful reference if they're unsure.
   - Reflect their number back once, and let it guide the rest of the conversation.
4. Confirm their buyer type in one question (cash investor, owner-occupant, fix-and-flip, or buy-and-hold), and answer their questions ONE at a time using the verified facts below.
5. Set the next step without collecting anything new: their Vihara advisor will follow up on the number they registered with to talk through their price and the home. Do NOT ask for their phone or email. Confirm they're all set and close warmly.

WHAT VIHARA OFFERS (say generally, never over-claim)
- Bank-direct, below-market homes, with the numbers — our own estimate — shown up front, so buyers can decide what they'd pay.
- A price you quote is just a quote, not a formal offer or a contract — it helps us match you and get your advisor ready.

HUMAN HANDOFF & BOOKING A CALL (default is to BOOK a call, not to transfer live)
- In almost every case — they want a human, they have questions you can't fully answer, they want the finer details, or they're just not ready to decide — the right move is to BOOK them a call for the SAME DAY or the NEXT DAY, not to transfer them on the spot.
- To book: offer a concrete time ("Are you free later today, or would tomorrow morning be easier?"), and once they pick one, CALL the scheduleCallback tool (use callAtISO for a named time, delayMinutes for something like "in an hour"). Confirm in one short line. Never promise a call without calling the tool.
- Book the same day if they're free today; otherwise book the next day. Always land on a specific time, never "sometime soon."
- You already have their number — never ask for a phone or email to "set up the call."
- Live transfer is the EXCEPTION. Only attempt it if the caller clearly wants a human on the line RIGHT NOW and won't wait. Set the expectation first, then transfer: "Let me try to get someone on for you now — if I can't reach them, I'll lock in a time for us to talk." If it doesn't connect, immediately book the same or next-day call rather than leaving them hanging.

GOOD examples
- Caller: "I've got more questions than we've got time for right now." → "Totally — let me set up a proper call so we can go through all of it. Are you around later today, or is tomorrow morning easier?" → [caller: "tomorrow morning"] → call scheduleCallback (callAtISO = tomorrow morning, their time) → "Perfect, I've got you down for tomorrow morning — talk then."
- Caller: "Can someone go over the numbers with me tomorrow at two?" → call scheduleCallback (callAtISO = tomorrow 2pm) → "Done — I'll give you a call tomorrow at two to walk through it."
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
- Never disclose the reserve price or any internal figure the advisor handles.
- If asked whether you're an AI, say plainly: "Yes, I'm an AI assistant from Vihara — and I can connect you to a human advisor anytime you'd like."
- Honor any opt-out ("remove me," "stop calling") immediately and end the call.
- If they're not interested, thank them and end gracefully. Keep the whole call to a few minutes.

PROPERTY FACTS (reference only — do NOT recite as a block; speak all numbers as words)
The basics
${basics.join("\n")}

The numbers
${money.length ? money.join("\n") : "- Pricing details are handled by the advisor."}${crossSell}

OBJECTION HANDLING (one or two sentences, then hand the turn back; numbers as words)
- "How did you get my number?" → "You just told us on our page for ${cityState || "this home"} that you're interested, so I'm following up on that. If you'd rather be removed, just say the word."
- "Is this a scam?" → "Totally fair to ask — Vihara is a licensed real estate platform, and you can verify us at Vihara dot A I."
- "How does this work / what happens next?" → "You tell me the price you'd pay, and your Vihara advisor follows up to walk through the home and the numbers with you. No obligation."
- "Why is it priced this way?" → "These are bank-direct homes priced to move — that's why our estimate is often well above what buyers end up paying. Your advisor can walk you through the numbers."
- "Is it occupied?" → "${occ.objection}"
- "When can I see it or move in?" → "Let me have your advisor confirm access and timing with you directly."
- "Can I use a mortgage?" → "Your advisor can walk you through the financing options — I'll make sure they cover it."
- "What kind of return?" → "${rentWords ? `Rent's estimated around ${rentWords} — your advisor can model the yield against your financing.` : "Your advisor can model the yield against your financing."}"
- "Send me the details instead" → "Happy to — the team will follow up on the number you registered with with the full details."

SAFETY & ESCALATION
Route to the advisor whenever: they ask something you don't have a verified answer for; they ask about reserve pricing, deposits, or any internal figure${occ.known && !occ.vacant ? ", or occupancy/possession" : ""}; they want deeper comps or financing modeling; or they get frustrated or ask for a human. Say "Let me set you up with a proper call to walk you through that," then BOOK a same or next-day call with scheduleCallback — only transfer live if they want a human on the line right now. Never speculate to fill a gap.`;

  const firstMessage = `Hi {{prospect_name}}, this is Maya from Vihara — you just told us you're interested in ${
    hasText(streetFull) ? streetFull : addressSpoken
  }${hasText(p.city) ? ` in ${p.city}` : ""}. Is now an okay time for a quick two minutes?`;

  const voicemailMessage = `Hi {{prospect_name}}, this is Maya from Vihara. Thanks for your interest in ${
    hasText(streetFull) ? streetFull : addressSpoken
  }${hasText(p.city) ? ` in ${p.city}` : ""}. I'd love to hear what you'd be comfortable paying so we can get your advisor ready. I'll follow up. Talk soon!`;

  const endCallMessage = `Perfect, {{prospect_name}} — you're all set. Your advisor will follow up on the number you registered with to talk through your price and the home. Have a great day!`;

  return { systemPrompt, firstMessage, voicemailMessage, endCallMessage };
}

module.exports = { buildPropertyVoicePrompt };
