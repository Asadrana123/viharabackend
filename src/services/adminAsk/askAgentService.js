// services/adminAsk/askAgentService.js
//
// Admin "Ask AI": answers a free-form question about the business data by
// letting Claude call read-only query tools (askQueryService) in a loop.
//
//   question ─▶ Claude ─▶ tool_use (e.g. count_records) ─▶ we run the query
//            ◀─ final answer ◀─ Claude ◀─ tool_result (the real numbers) ◀─┘
//
// Claude never talks to MongoDB itself: it can only ask for one of the tools
// below, and askQueryService validates every request before running it.
//
// Follow-ups work because the caller passes the conversation's full message
// history (including earlier tool calls and their results) back in each time.
const Anthropic = require("@anthropic-ai/sdk");
const { COLLECTIONS, catalogText } = require("./askCollections");
const { EXECUTORS, AskQueryError } = require("./askQueryService");

const MODEL = process.env.ADMIN_ASK_MODEL || "claude-opus-5-5";
const EFFORT = process.env.ADMIN_ASK_EFFORT || "medium";
// Lookups Claude may chain for one question before we stop it.
const MAX_STEPS = 10;

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set — admin Ask AI is unavailable");
  }
  if (!client) {
    // A user-level key (sk-ant-usr…) isn't tied to a workspace, so the API needs
    // to be told which workspace to bill. Workspace-scoped keys don't need this.
    const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
    client = new Anthropic({
      timeout: 120000,
      maxRetries: 2,
      ...(workspaceId && { defaultHeaders: { "anthropic-workspace-id": workspaceId } }),
    });
  }
  return client;
}

const COLLECTION_KEYS = COLLECTIONS.map((c) => c.key);

const FILTER_SCHEMA = {
  type: "object",
  description:
    'MongoDB filter. Operators allowed: $eq $ne $gt $gte $lt $lte $in $nin $exists $regex $options $and $or $nor $not $elemMatch $size $all. Dates as ISO strings, e.g. {"createdAt": {"$gte": "2026-10-01"}}. Ids as 24-char hex strings. Use {} for everything.',
};

const TOOLS = [
  {
    name: "search_records",
    description:
      "Find records anywhere by free text: a person's name, email, phone number (any format), street address, city, property name/slug, or a record id. Searches every collection at once (or only the ones listed) and returns up to 5 matches per collection. Use this first whenever the question names a specific person or property.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "What to look for, e.g. \"john smith\", \"555-123-4567\", \"georgia st\"." },
        collections: { type: "array", items: { type: "string", enum: COLLECTION_KEYS }, description: "Optional: limit the search to these collections." },
      },
      required: ["text"],
    },
  },
  {
    name: "find_records",
    description:
      "List records from one collection that match a filter, sorted and limited (max 50). Also returns totalMatching — the exact number of matching records, which can be larger than what is returned.",
    input_schema: {
      type: "object",
      properties: {
        collection: { type: "string", enum: COLLECTION_KEYS },
        filter: FILTER_SCHEMA,
        sort: { type: "object", description: 'e.g. {"createdAt": -1}. Default: newest first.' },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Default 20." },
        fields: { type: "array", items: { type: "string" }, description: "Optional: only return these fields (smaller, faster). _id is always included." },
      },
      required: ["collection"],
    },
  },
  {
    name: "count_records",
    description: "Exact count of records in one collection matching a filter. Use this for every \"how many\" question.",
    input_schema: {
      type: "object",
      properties: {
        collection: { type: "string", enum: COLLECTION_KEYS },
        filter: FILTER_SCHEMA,
      },
      required: ["collection"],
    },
  },
  {
    name: "group_count",
    description:
      "Group matching records by a field and count each group (optionally summing a numeric field). For breakdowns like \"registrations by status\", \"leads by buyerType\", \"bids per auction\", or trends over time (set date_unit to group a date field by day/week/month/year).",
    input_schema: {
      type: "object",
      properties: {
        collection: { type: "string", enum: COLLECTION_KEYS },
        filter: FILTER_SCHEMA,
        group_by: { type: "string", description: "Field to group by, e.g. \"status\" or \"createdAt\"." },
        date_unit: { type: "string", enum: ["day", "week", "month", "year"], description: "Only when group_by is a date field." },
        sum_field: { type: "string", description: "Optional numeric field to total per group, e.g. \"amount\"." },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Max groups returned (largest first). Default 50." },
      },
      required: ["collection", "group_by"],
    },
  },
  {
    name: "get_record",
    description: "Every field of one record by id, including long text such as a call transcript or property description.",
    input_schema: {
      type: "object",
      properties: {
        collection: { type: "string", enum: COLLECTION_KEYS },
        id: { type: "string", description: "24-character hex id." },
      },
      required: ["collection", "id"],
    },
  },
];

// Built once at startup. Must stay byte-identical between requests so the
// tools + system prefix is served from the prompt cache.
const SYSTEM_PROMPT = `You are the data assistant inside the Vihara admin panel. Vihara runs online real-estate auctions: it lists properties, collects buyer leads from many landing pages, registers bidders for auctions, takes bids, and calls leads with an AI voice agent. The people asking you questions are Vihara's own admins and advisors.

Answer their questions from the live database using your tools. You have read-only access; nothing you do can change data. If someone asks you to change, delete, approve or send something, explain that you can only look things up and point them to the relevant admin screen.

How to work:
- Every number, name and status in your answer must come from a tool result in this conversation. Never estimate or invent data. If the tools can't answer something, say what you could and couldn't find.
- Use count_records for "how many", group_count for breakdowns and trends, find_records to list, search_records when a specific person, email, phone or property is named, and get_record for full detail on one record.
- Run independent lookups in parallel (several tool calls in one turn), e.g. one count per lead collection.
- "Leads" are spread over several collections: propertyLeads (the current one, for every /auction/:slug page), earlyAccessLeads, georgiaStLeads, rensselaerAveLeads, partnerLeads, norCalLeads, buyerListLeads, newDealsLeads, personaLeads, landingPageLeads, renovationContractorLeads. For a question about "all leads", check each relevant collection and give per-source counts plus the total. rb2bVisitors are identified website visitors, not form leads.
- How records connect: auctionRegistrations.auctionId and bids.auctionId point to properties._id; auctionRegistrations.userId and bids.userId point to users._id; propertyLeads.propertySlug equals properties.slug; callLogs.phone matches a lead's phone; leadNotes.leadId is a lead's _id in the collection named by leadType. To answer across collections, look up the ids in one and filter the other with $in.
- When a property is named loosely ("Georgia St"), find it first with search_records, then use its _id or slug.
- Lead callStatus: pending = not called yet, no-answer = calls going unanswered, connected = they picked up, not-reached = gave up after the follow-up days.
- Text fields are case-sensitive in filters; use {"$regex": "...", "$options": "i"} for loose text matching. Phone numbers are stored in mixed formats; search_records handles that.
- Dates in the database are UTC. The current date and time is given with each question; work out relative ranges ("last week", "this month") from it and state the exact range you used.
- find_records returns at most 50 rows. When totalMatching is larger, say how many there are in total and that you're showing the first ones.
- If a question is ambiguous, pick the most reasonable reading, answer it, and briefly say which reading you used.
- The conversation continues across questions; follow-ups like "show me their emails" refer to the records from your previous answers.

Answer format: the admin panel shows your reply as plain text, so do not use Markdown headings, tables, bold or code blocks. Lead with the direct answer in one sentence. For lists, put one item per line starting with "- ", and include what identifies each record (name, email or phone, property, status, date). Keep it short.

# Collections

${catalogText()}`;

function addUsage(totals, usage) {
  if (!usage) return;
  totals.inputTokens += usage.input_tokens || 0;
  totals.outputTokens += usage.output_tokens || 0;
  totals.cacheReadTokens += usage.cache_read_input_tokens || 0;
  totals.cacheWriteTokens += usage.cache_creation_input_tokens || 0;
}

async function runTool(block) {
  const executor = EXECUTORS[block.name];
  if (!executor) {
    return { type: "tool_result", tool_use_id: block.id, is_error: true, content: `Unknown tool ${block.name}` };
  }
  try {
    const result = await executor(block.input || {});
    return { type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) };
  } catch (err) {
    // Hand the problem back to Claude so it can fix the query and retry.
    let message = err.message;
    if (err.codeName === "MaxTimeMSExpired") message = "The query took too long. Narrow the filter.";
    else if (!(err instanceof AskQueryError)) console.error(`[admin-ask] ${block.name} failed:`, err);
    return { type: "tool_result", tool_use_id: block.id, is_error: true, content: message };
  }
}

/**
 * Answer one question.
 * @param {object} opts
 * @param {Array}  opts.history  prior Claude API messages for this conversation
 * @param {string} opts.question the admin's new question
 * @returns {Promise<{answer, toolCalls, messages, usage}>}
 *   messages = history + everything appended this turn (store it as the new history)
 */
async function askQuestion({ history, question }) {
  const anthropic = getClient();
  const messages = [
    ...history,
    {
      role: "user",
      content: [
        { type: "text", text: `Current date and time (UTC): ${new Date().toISOString()}` },
        { type: "text", text: question },
      ],
    },
  ];
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let toolCalls = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      // If this model declines a request, the API retries it on a fallback model.
      fallbacks: "default",
      output_config: { effort: EFFORT },
      cache_control: { type: "ephemeral" },
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });
    addUsage(usage, response.usage);

    // Keep the full content (thinking + tool_use blocks), not just the text:
    // the next request must replay it unchanged.
    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter((b) => b.type === "tool_use");

    if (response.stop_reason === "tool_use" && toolUses.length) {
      toolCalls += toolUses.length;
      const results = await Promise.all(toolUses.map((b) => runTool(b)));
      messages.push({ role: "user", content: results });
      continue;
    }

    if (response.stop_reason === "pause_turn") continue;

    // Any tool_use left unanswered (output cut off, refusal) still needs a
    // tool_result, or the next question's request would be rejected.
    if (toolUses.length) {
      messages.push({
        role: "user",
        content: toolUses.map((b) => ({
          type: "tool_result",
          tool_use_id: b.id,
          is_error: true,
          content: "Not run: the response ended before this tool could be used.",
        })),
      });
    }

    let answer = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (response.stop_reason === "refusal" && !answer) {
      answer = "I can't help with that question.";
    } else if (response.stop_reason === "max_tokens") {
      answer = `${answer}\n\n(The answer was cut off because it got too long. Try asking for less at once.)`.trim();
    } else if (!answer) {
      answer = "I couldn't come up with an answer. Try rephrasing the question.";
    }

    return { answer, toolCalls, messages, usage };
  }

  return {
    answer: "That question needed more lookups than I'm allowed for one answer. Try splitting it into smaller questions.",
    toolCalls,
    messages,
    usage,
  };
}

module.exports = { askQuestion, MODEL };
