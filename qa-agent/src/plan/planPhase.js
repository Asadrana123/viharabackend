// Planning phase: explore the feature with read-only tools and produce a
// plain-language plan within the run's budget.
//
// submit_plan validates the plan here (same rules as the backend) and holds
// it; it's posted after the agent session ends, so the post can include the
// session's final cost — posting hands the run to the admin and releases the
// lock, after which this worker can't report anything more on it.
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import Anthropic from "@anthropic-ai/sdk";
import { triageRequest } from "./triage.js";
import { z } from "zod";
import { api } from "../api.js";
import { config } from "../config.js";
import { startLease } from "../lease.js";
import { secretFileHooks } from "../guard.js";
import { buildAgentEnv, assertApiKeyAuth, CredentialError } from "../agentEnv.js";
import { PLAN_SYSTEM_PROMPT, buildPlanPrompt } from "./prompt.js";

// Hard cap per run, matching the backend schema — enforced here too so a
// misconfigured or older run can never spend more.
const MAX_RUN_COST_USD = 2;
// Share of the run's money/time budget planning may use; the rest is for testing.
const PLAN_COST_SHARE = 0.4;
const PLAN_MIN_COST_USD = 0.25;
const PLAN_TIME_SHARE = 0.5;
const PLAN_MIN_MINUTES = 5;

const KINDS = ["api", "ui", "realtime", "real_world"];

const planItem = z.object({
  key: z.string().regex(/^T\d{1,3}$/).describe("T1, T2, … in priority order"),
  title: z.string().min(3).max(500).describe("Plain language: what will be checked and what a person would see"),
  why: z.string().max(1000).describe("Plain language: why this check matters"),
  kind: z.enum(KINDS),
  included: z.boolean().describe("false = left out to stay within budget"),
  skipReason: z.string().max(500).optional().describe("Required when included is false"),
});

// Same rules the backend enforces on POST /plan; returns a list of problems.
export function validatePlan(plan, budget) {
  const problems = [];
  const keys = new Set();
  for (const item of plan.items) {
    if (keys.has(item.key)) problems.push(`Duplicate key ${item.key}.`);
    keys.add(item.key);
    if (!item.included && !item.skipReason?.trim()) problems.push(`${item.key} is left out — add a skipReason.`);
  }
  const included = plan.items.filter((i) => i.included);
  if (included.length === 0) problems.push("Include at least one check.");
  if (included.length > budget.maxTests) {
    problems.push(`${included.length} checks are included but the budget allows ${budget.maxTests}. Mark the lowest-value ones included=false with a reason.`);
  }
  const ui = included.filter((i) => i.kind === "ui").length;
  if (ui > budget.maxUiTests) {
    problems.push(`${ui} ui checks are included but the budget allows ${budget.maxUiTests}. Turn some into api checks or leave them out.`);
  }
  return problems;
}

const textResult = (text, isError = false) => ({ content: [{ type: "text", text }], isError });

// Credential/account problems that make the planner fail too — stop instead of planning.
const FATAL_TRIAGE_ERRORS = [Anthropic.AuthenticationError, Anthropic.PermissionDeniedError];

export async function runPlanPhase(run, log) {
  // First look (cheap model) at a request that has no plan yet: chit-chat,
  // change requests and vague requests get a reply instead of a plan.
  let triageCost = 0;
  let focus = "";
  if (!run.plan?.version) {
    let triage = null;
    try {
      triage = await triageRequest(run);
    } catch (err) {
      if (FATAL_TRIAGE_ERRORS.some((E) => err instanceof E)) {
        await api.finish(run._id, { status: "failed", error: `The Anthropic API refused the request check (${err.status}). Check ANTHROPIC_API_KEY in qa-agent/.env.` });
        return;
      }
      log(`request check failed (${err.message}) — planning anyway`);
    }
    if (triage) {
      triageCost = triage.costUsd;
      log(`request check: ${triage.verdict} ($${triageCost.toFixed(4)})`);
      if (triage.verdict === "unclear" || triage.verdict === "not_a_test") {
        await api.clarify(run._id, { text: triage.reply, costUsd: (run.costUsd || 0) + triageCost });
        return;
      }
      if (triage.verdict === "too_broad") focus = triage.focus;
    }
  }

  const spentBefore = (run.costUsd || 0) + triageCost;
  const runCap = Math.min(run.budget.maxCostUsd, MAX_RUN_COST_USD);
  const remaining = runCap - spentBefore;
  if (remaining < PLAN_MIN_COST_USD) {
    await api.finish(run._id, {
      status: "failed",
      error: `The run's cost budget is used up ($${spentBefore.toFixed(2)} of $${runCap}). Start a new run (max $2) or narrow the request.`,
    });
    return;
  }
  const maxBudgetUsd = Math.max(PLAN_MIN_COST_USD, Math.min(remaining, runCap * PLAN_COST_SHARE));
  const timeLimitMs = Math.max(PLAN_MIN_MINUTES, run.budget.maxMinutes * PLAN_TIME_SHARE) * 60_000;

  const { facts } = await api.knowledge();
  let sessionCost = 0;
  let pendingPlan = null;

  const lease = startLease(run._id, { getCostUsd: () => spentBefore + sessionCost, timeLimitMs, log });

  const qaTools = createSdkMcpServer({
    name: "qa",
    version: "1.0.0",
    tools: [
      tool(
        "post_progress",
        "Post a short plain-language progress note to the admin's thread. Use once or twice at real milestones.",
        { text: z.string().min(1).max(1000) },
        async ({ text }) => {
          await api.postMessage(run._id, text);
          return textResult("Posted.");
        }
      ),
      tool(
        "submit_plan",
        "Submit the test plan for the admin to approve. Call once when the plan is ready; if problems are reported, fix them and call again.",
        {
          summary: z.string().min(20).max(1200).describe("At most 5 short plain-language sentences: what the feature does end to end, and what this plan focuses on and why. No warnings here — those go in headsUp."),
          headsUp: z
            .array(z.string().min(5).max(300))
            .max(6)
            .describe("Things the admin must know before approving: real-world side effects the tests will cause, data that won't be cleaned up, assumptions. One short sentence each. Empty if none."),
          items: z.array(planItem).min(1).max(40),
        },
        async (plan) => {
          const problems = validatePlan(plan, run.budget);
          if (problems.length) return textResult(`The plan was not accepted:\n- ${problems.join("\n- ")}`, true);
          pendingPlan = plan;
          return textResult("Plan accepted. It will be sent to the admin for approval when you finish. You are done — stop now.");
        }
      ),
    ],
  });

  log(`planning (model ${config.model}, up to $${maxBudgetUsd.toFixed(2)}, ${Math.round(timeLimitMs / 60000)} min)`);
  let result = null;
  try {
    const session = query({
      prompt: buildPlanPrompt(run, facts, focus),
      options: {
        model: config.model,
        effort: "high",
        cwd: config.backendRepo,
        additionalDirectories: [config.frontendRepo],
        systemPrompt: { type: "preset", preset: "claude_code", append: PLAN_SYSTEM_PROMPT },
        // Read-only: built-in file readers plus our two tools. Anything else is denied.
        tools: ["Read", "Grep", "Glob"],
        allowedTools: ["Read", "Grep", "Glob", "mcp__qa__post_progress", "mcp__qa__submit_plan"],
        permissionMode: "dontAsk",
        mcpServers: { qa: qaTools },
        hooks: secretFileHooks,
        // Don't pick up the host machine's ~/.claude settings, hooks or CLAUDE.md files.
        settingSources: [],
        persistSession: false,
        maxBudgetUsd,
        maxTurns: 80,
        abortController: lease.abortController,
        env: buildAgentEnv(),
      },
    });

    for await (const message of session) {
      assertApiKeyAuth(message);
      if (message.type === "result") {
        result = message;
        sessionCost = message.total_cost_usd || 0;
      }
    }
  } catch (err) {
    if (err instanceof CredentialError) {
      lease.abortController.abort("wrong credentials");
      lease.release();
      log(err.message);
      await api.finish(run._id, { status: "failed", error: err.message, costUsd: spentBefore });
      return;
    }
    if (!lease.stopReason) throw err;
  } finally {
    lease.release();
  }

  const totalCost = spentBefore + sessionCost;
  if (lease.stopReason && !pendingPlan) {
    log(`planning stopped: ${lease.stopReason}`);
    // Cancelled/lost runs need nothing more; a timeout is reported as a failure.
    if (lease.stopReason === "time limit reached") {
      await api.finish(run._id, {
        status: "failed",
        error: `Planning took longer than its ${Math.round(timeLimitMs / 60000)}-minute share of the time budget. Try a narrower request or a higher max minutes.`,
        costUsd: totalCost,
      });
    }
    return;
  }

  if (!pendingPlan) {
    const why = result?.subtype === "error_max_budget_usd"
      ? `Planning used its share of the cost budget ($${maxBudgetUsd.toFixed(2)}) before finishing a plan. Try a narrower request or a higher max cost.`
      : `The agent finished without submitting a plan (${result?.subtype || "no result"}).`;
    await api.finish(run._id, { status: "failed", error: why, costUsd: totalCost });
    log(`planning failed: ${why}`);
    return;
  }

  await api.submitPlan(run._id, { ...pendingPlan, costUsd: totalCost });
  log(`plan posted: ${pendingPlan.items.filter((i) => i.included).length} checks, cost $${sessionCost.toFixed(2)}`);
}
