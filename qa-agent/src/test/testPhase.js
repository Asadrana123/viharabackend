// Test phase: run the approved checks through the worker's guarded HTTP tool
// and browser, record results live, ask the admin when needed, clean up, and report.
import crypto from "node:crypto";
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { api } from "../api.js";
import { config } from "../config.js";
import { startLease } from "../lease.js";
import { secretFileHooks } from "../guard.js";
import { buildAgentEnv, assertApiKeyAuth, CredentialError } from "../agentEnv.js";
import { createHttpClient, MAX_REQUESTS_PER_RUN } from "./httpTool.js";
import { createBrowser, MAX_BROWSER_ACTIONS } from "./browserTool.js";
import { TEST_SYSTEM_PROMPT, buildTestPrompt } from "./prompt.js";

const MAX_RUN_COST_USD = 2; // hard cap per run, matches the backend schema
const MIN_TEST_COST_USD = 0.2;
const MAX_WAIT_MINUTES = 30;
const POLL_MS = 10_000;

const textResult = (value, isError = false) => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 1) }],
  isError,
});
// Browser results: page state as text, plus a screenshot when asked for.
const browserResult = (result) => {
  if (result.blocked || result.error) return textResult(result.blocked || result.error, true);
  const content = [{ type: "text", text: JSON.stringify(result.out, null, 1) }];
  if (result.image) content.push({ type: "image", data: result.image, mimeType: "image/jpeg" });
  return { content, isError: Boolean(result.out.actionFailed) };
};
const targetSchema = z
  .object({
    role: z.string().optional().describe('ARIA role as shown in the snapshot, e.g. "button", "textbox", "link", "checkbox", "combobox"'),
    name: z.string().optional().describe("Accessible name with role, e.g. the button text"),
    label: z.string().optional(),
    placeholder: z.string().optional(),
    text: z.string().optional(),
    testId: z.string().optional(),
    css: z.string().optional().describe("Last resort"),
    exact: z.boolean().optional(),
    nth: z.number().int().min(0).optional().describe("Pick the nth match (0-based) when several match"),
  })
  .describe("Which element: prefer role+name from the snapshot, then label/placeholder/text");
const asSchema = z.enum(["visitor", "user", "admin"]).optional().describe('Who is logged in (default "visitor"); each has its own tab');
const screenshotSchema = z.enum(["viewport", "full"]).optional().describe("Also return a screenshot (use when layout or looks matter)");
const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });

// Fictional 555-0100…0199 numbers, with an area code picked per run so
// concurrent or leftover runs don't collide on the duplicate-phone rule.
export function testDataFor(runId) {
  const n = crypto.createHash("sha256").update(String(runId)).digest().readUInt32BE(0);
  const area = 201 + (n % 699); // 201-899
  const block = (n >>> 10) % 9; // 0100-0189 in blocks of 10
  const phones = Array.from({ length: 10 }, (_, i) => `(${area}) 555-01${String(block * 10 + i).padStart(2, "0")}`);
  const tag = String(runId).slice(-6);
  return { namePrefix: `QA Test ${tag}`, phones, email: `qa-agent-${tag}@example.com` };
}

/**
 * The test-phase tools. Exported separately so they can be exercised without
 * a model. ctx: { run, http, browser, lease, approvedKeys, recorded, minutesLeft, setReport }
 */
export function createTestTools(ctx) {
  const { run, http, browser, lease, approvedKeys, recorded, minutesLeft } = ctx;
  return [
    tool(
      "http_request",
      "Send a request to the Vihara backend. Returns status, timing and the response body (or `blocked` with a reason if the request isn't allowed).",
      {
        method: z.enum(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]),
        path: z.string().describe('Path starting with /api/, e.g. "/api/v1/property-lead/123-main-st/register"'),
        query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
        body: z.unknown().optional().describe("JSON body"),
        as: z.enum(["visitor", "user", "admin"]).optional().describe('Who to act as (default "visitor")'),
        parallel: z.number().int().min(1).max(5).optional().describe("Send this many identical requests at the same moment"),
      },
      async (args) => {
        const result = await http.request(args);
        return textResult(result, Boolean(result.blocked));
      }
    ),
    tool(
      "browser_open",
      "Open a page of the Vihara website in a real browser and return what's on it (accessibility snapshot) plus notable events: blocked requests, failed backend calls, console errors, dialogs.",
      {
        path: z.string().describe('Website path, e.g. "/", "/listing/123-main-st", "/admin/dashboard"'),
        as: asSchema,
      },
      async (args) => browserResult(await browser.open(args))
    ),
    tool(
      "browser_act",
      "Do one thing on the open page — click, fill, select, check, uncheck, hover, press a key, scroll, wait, back — and return the page afterwards.",
      {
        action: z.enum(["click", "fill", "select", "check", "uncheck", "hover", "press", "scroll", "wait", "back"]),
        target: targetSchema.optional().describe("The element (not needed for scroll, back, or a plain wait/press)"),
        value: z.union([z.string(), z.number()]).optional().describe("Text for fill, option for select, key for press (default Enter), pixels for scroll, ms for wait"),
        as: asSchema,
        screenshot: screenshotSchema,
      },
      async (args) => browserResult(await browser.act(args))
    ),
    tool(
      "browser_look",
      "Look at the open page again without doing anything: snapshot of the whole page or one part, optionally a screenshot.",
      {
        within: targetSchema.optional().describe("Only this part of the page, e.g. a form or dialog"),
        as: asSchema,
        screenshot: screenshotSchema,
      },
      async (args) => browserResult(await browser.look(args))
    ),
    tool(
      "record_result",
      "Record the result of one approved check. Call as soon as you know it; calling again for the same key replaces it.",
      {
        key: z.string().describe("The check's key, e.g. T3"),
        status: z.enum(["pass", "fail", "not_verified", "skipped"]),
        detail: z.string().min(5).max(2000).describe("Plain language for a non-technical reader: what happened (fail/pass) or why you couldn't check it (not_verified)"),
        expected: z.string().max(1000).optional().describe("fail only: what should have happened instead"),
        steps: z.array(z.string().max(300)).max(10).optional()
          .describe("fail and not_verified: short steps a non-technical person can follow on the website to see it themselves, e.g. [\"Open any property page\", \"Click Register\", \"Leave the phone empty and press Submit\"]"),
        severity: z.enum(["critical", "major", "minor"]).optional()
          .describe("fail only: critical = money, bids, security or data loss, or people can't complete the main task; major = a real problem many users would hit; minor = small or rare"),
        location: z.string().max(300).optional().describe("file:line of the cause, for failures you traced (shown only to developers)"),
      },
      async ({ key, status, detail, expected, steps, severity, location }) => {
        if (!approvedKeys.has(key)) return textResult(`${key} is not an approved check. Approved: ${[...approvedKeys].join(", ")}`, true);
        if (status === "fail" && !severity) return textResult("Failures need a severity (critical, major or minor).", true);
        await api.submitResults(run._id, [{ key, status, detail, expected: expected || "", steps: steps || [], severity: severity || "", location: location || "" }]);
        recorded.set(key, status);
        const left = [...approvedKeys].filter((k) => !recorded.has(k));
        return textResult(`Recorded ${key}: ${status}. ${left.length ? `Still to record: ${left.join(", ")}.` : "All checks recorded."} About ${minutesLeft()} min left.`);
      }
    ),
    tool(
      "post_progress",
      "Post a short plain-language progress note to the admin's thread (use sparingly).",
      { text: z.string().min(1).max(1000) },
      async ({ text }) => {
        await api.postMessage(run._id, text);
        return textResult("Posted.");
      }
    ),
    tool(
      "ask_admin",
      "Ask the admin a question. Returns immediately with a question key; keep working on other checks, then call wait_for_answer.",
      {
        text: z.string().min(5).max(1000),
        kind: z.enum(["yes_no", "text", "allow_skip", "number"]),
        rememberKey: z.string().regex(/^[a-z0-9_.-]{1,80}$/).optional().describe("Save the answer for future runs under this key"),
        timeoutMinutes: z.number().int().min(1).max(MAX_WAIT_MINUTES).optional(),
      },
      async ({ text, kind, rememberKey, timeoutMinutes }) => {
        const wait = Math.min(timeoutMinutes || 15, Math.max(1, minutesLeft() - 2));
        const { question } = await api.askQuestion(run._id, { text, kind, rememberKey, timeoutMinutes: wait });
        return textResult(`Asked as ${question.key}; it expires in ${wait} min. Continue with other checks, then call wait_for_answer.`);
      }
    ),
    tool(
      "wait_for_answer",
      "Wait for the admin's answer to a question (checks every 10 seconds).",
      { key: z.string(), maxWaitMinutes: z.number().int().min(1).max(MAX_WAIT_MINUTES).optional() },
      async ({ key, maxWaitMinutes }) => {
        const until = Date.now() + Math.min(maxWaitMinutes || MAX_WAIT_MINUTES, Math.max(1, minutesLeft() - 1)) * 60_000;
        while (!lease.signal.aborted) {
          const { question } = await api.getQuestion(run._id, key);
          if (question.status !== "pending") return textResult({ key, status: question.status, answer: question.answer || null });
          if (Date.now() >= until) return textResult({ key, status: "pending", note: "No answer yet. Record dependent checks as not_verified, or wait again if time allows." });
          await sleep(POLL_MS, lease.signal);
        }
        return textResult("The run was stopped.", true);
      }
    ),
    tool(
      "finish_testing",
      "Finish the run with the plain-language report for the admin. Call once, after recording results.",
      { report: z.string().min(20).max(6000) },
      async ({ report: text }) => {
        const missing = [...approvedKeys].filter((k) => !recorded.has(k));
        ctx.setReport(text);
        return textResult(missing.length
          ? `Report saved. These checks have no result and will show as skipped: ${missing.join(", ")}. You can still record them before stopping.`
          : "Report saved. You are done — stop now.");
      }
    ),
  ];
}

export async function runTestPhase(run, log) {
  const spentBefore = run.costUsd || 0;
  const remaining = Math.min(run.budget.maxCostUsd, MAX_RUN_COST_USD) - spentBefore;
  if (remaining < MIN_TEST_COST_USD) {
    await api.finish(run._id, {
      status: "failed",
      error: `Not enough budget left to run tests ($${Math.max(0, remaining).toFixed(2)} of the $${MAX_RUN_COST_USD} cap remains after planning).`,
    });
    return;
  }
  const timeLimitMs = run.budget.maxMinutes * 60_000;
  const deadline = Date.now() + timeLimitMs;
  const minutesLeft = () => Math.max(0, Math.round((deadline - Date.now()) / 60_000));

  // Leftovers from an earlier crashed run would trip the duplicate-phone rule.
  await api.cleanupTestData().catch((e) => log(`pre-run cleanup failed: ${e.message}`));

  const { facts } = await api.knowledge();
  const data = testDataFor(run._id);
  const approvedKeys = new Set(run.plan.items.filter((i) => i.included).map((i) => i.key));
  const recorded = new Map();
  let report = null;
  let sessionCost = 0;

  const lease = startLease(run._id, { getCostUsd: () => spentBefore + sessionCost, timeLimitMs, log });
  const http = createHttpClient(log);
  const browser = createBrowser(log);

  const tools = createSdkMcpServer({
    name: "qa",
    version: "1.0.0",
    tools: createTestTools({ run, http, browser, lease, approvedKeys, recorded, minutesLeft, setReport: (text) => { report = text; } }),
  });

  const maxBudgetUsd = remaining;
  log(`testing ${approvedKeys.size} checks (up to $${maxBudgetUsd.toFixed(2)}, ${run.budget.maxMinutes} min)`);
  let result = null;
  try {
    const session = query({
      prompt: buildTestPrompt(run, facts, data, {
        minutes: run.budget.maxMinutes, costUsd: maxBudgetUsd, requests: MAX_REQUESTS_PER_RUN, browserActions: MAX_BROWSER_ACTIONS,
      }),
      options: {
        model: config.model,
        effort: "high",
        cwd: config.backendRepo,
        additionalDirectories: [config.frontendRepo],
        systemPrompt: { type: "preset", preset: "claude_code", append: TEST_SYSTEM_PROMPT },
        // No shell, no file writes, no network except through http_request and the guarded browser.
        tools: ["Read", "Grep", "Glob"],
        allowedTools: ["Read", "Grep", "Glob", ...["http_request", "browser_open", "browser_act", "browser_look", "record_result", "post_progress", "ask_admin", "wait_for_answer", "finish_testing"].map((t) => `mcp__qa__${t}`)],
        permissionMode: "dontAsk",
        mcpServers: { qa: tools },
        hooks: secretFileHooks,
        settingSources: [],
        persistSession: false,
        maxBudgetUsd,
        maxTurns: 200,
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
    if (!lease.stopReason) {
      lease.release();
      await api.cleanupTestData().catch(() => {});
      throw err;
    }
  } finally {
    lease.release();
    await browser.close();
  }

  const cleanup = await api.cleanupTestData().catch((e) => ({ error: e.message }));
  log(`cleanup: ${JSON.stringify(cleanup.deleted || cleanup)}`);

  const totalCost = spentBefore + sessionCost;
  const cancelled = lease.stopReason && lease.stopReason !== "time limit reached";
  if (cancelled) {
    log(`testing stopped: ${lease.stopReason}`);
    return; // admin cancelled or lock lost — the run is already closed
  }

  if (!report) {
    const why = lease.stopReason === "time limit reached"
      ? `the ${run.budget.maxMinutes}-minute time limit was reached`
      : result?.subtype === "error_max_budget_usd"
        ? `the $${MAX_RUN_COST_USD} cost cap was reached`
        : "the agent stopped without writing a report";
    const counts = [...recorded.values()].reduce((acc, s) => ({ ...acc, [s]: (acc[s] || 0) + 1 }), {});
    report = `Testing ended early because ${why}. Results recorded so far: ${
      Object.entries(counts).map(([s, n]) => `${n} ${s.replace("_", " ")}`).join(", ") || "none"
    }. Checks without a result are marked skipped.`;
  }

  await api.finish(run._id, { status: "done", reportSummary: report, costUsd: totalCost });
  log(`run done: ${[...recorded.values()].join(", ") || "no results"} — session cost $${sessionCost.toFixed(2)}, ${http.requestCount} requests, ${browser.actionCount} browser actions`);
}
