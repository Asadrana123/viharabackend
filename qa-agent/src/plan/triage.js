// First look at a new request, before any (expensive) planning: is this
// something the QA agent can test? One fast call to a small model.
//   test        → plan it
//   too_broad   → plan it, but start with the most important part (focus)
//   unclear     → ask the admin one short question (reply)
//   not_a_test  → friendly reply explaining what the agent does (reply)
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { config } from "../config.js";

// Claude Haiku 4.5 list price, $ per token — for the run's cost total.
const PRICE = { input: 1 / 1e6, output: 5 / 1e6 };

const VERDICTS = ["test", "too_broad", "unclear", "not_a_test"];

const TriageSchema = z.object({
  verdict: z.enum(VERDICTS),
  reply: z.string().describe("For unclear / not_a_test: the message to show the admin. Empty otherwise."),
  focus: z.string().describe("For too_broad: what to test first and what to leave for separate runs. Empty otherwise."),
});

const SYSTEM = `You screen requests sent to Vihara's QA agent before it starts work. Vihara is a real-estate auction platform. The QA agent reads the code and runs safe checks to find out whether a feature works; it never changes code, design or data, and never contacts real people.

Areas of the platform it can test: sign-up/login and accounts, property listings and search, saved searches, auction registration, bidding (manual, auto-bid, live updates), auction closing and the emails that follow, seller and realtor flows, lead forms and property landing pages (/auction/<property>, early access, partner, new deals, buyer list…), AI phone calls and callbacks, outbound SMS/email campaigns, Vtext texting, enrichment lists, buyer match, marketing engine, content studio, careers, investment calculator, renovation estimates, the admin panel and who can access what.

Classify the admin's request (taking any follow-up replies into account):
- test: asks to check, test or verify something on Vihara — even briefly ("test login", "is bidding working?", "check the leads tab"). Be generous: if a feature or flow can be identified, it's a test.
- too_broad: a real test request, but far too much for one run ("test the whole website", "check everything", or many unrelated features at once). Write focus: the one or two most important areas to start with — money/bidding, security and lead capture come first — and which areas to leave for separate runs.
- unclear: probably wants a test, but you can't tell what to test ("test it", "check this", "leads"). Write reply: one short question offering 2-3 concrete options.
- not_a_test: anything else — greetings or chat ("are you ready?"), requests to change or build something ("make every button red", "add a feature", "fix this"), things outside Vihara, or harmful/impossible requests (attacking or overloading the site). Write reply: briefly and kindly say what you can do instead, with one example request based on what they typed (e.g. for "fix the login bug": offer to test login and pinpoint the bug).

Replies are read by a non-technical admin: plain words, at most 3 short sentences, no jargon, in the admin's language.`;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000 });

/** Builds the request + any clarification back-and-forth as one transcript. */
function conversation(run) {
  const lines = [`Admin's request: ${run.request}`];
  for (const m of run.messages) {
    if (m.type === "clarification") lines.push(`QA agent replied: ${m.text}`);
    if (m.type === "feedback") lines.push(`Admin answered: ${m.text}`);
  }
  return lines.join("\n");
}

/** Returns { verdict, reply, focus, costUsd }. */
export async function triageRequest(run) {
  const response = await client.messages.parse({
    model: config.triageModel,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: "user", content: conversation(run) }],
    output_config: { format: zodOutputFormat(TriageSchema) },
  });

  const costUsd = response.usage.input_tokens * PRICE.input + response.usage.output_tokens * PRICE.output;
  const out = response.parsed_output;
  if (response.stop_reason === "refusal" || !out || !VERDICTS.includes(out.verdict)) {
    // Couldn't classify — let the planner deal with it rather than block a real request.
    return { verdict: "test", reply: "", focus: "", costUsd };
  }
  const reply = out.reply.trim();
  // A clarifying verdict with no reply would leave the admin with nothing to answer.
  if ((out.verdict === "unclear" || out.verdict === "not_a_test") && !reply) {
    return { verdict: "test", reply: "", focus: "", costUsd };
  }
  return { verdict: out.verdict, reply, focus: out.focus.trim(), costUsd };
}

export { conversation, TriageSchema };
