// Thin client for the backend's worker API (/api/v1/qa-agent).
import { config } from "./config.js";

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function call(method, path, body) {
  const res = await fetch(`${config.apiUrl}/api/v1/qa-agent${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-qa-agent-token": config.agentToken,
      "x-qa-worker-id": config.workerId,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.message || `HTTP ${res.status}`);
  return data;
}

export const api = {
  claim: (phases) => call("POST", "/claim", { phases }),
  knowledge: () => call("GET", "/knowledge"),
  heartbeat: (runId, costUsd) => call("POST", `/runs/${runId}/heartbeat`, { costUsd }),
  submitPlan: (runId, plan) => call("POST", `/runs/${runId}/plan`, plan),
  clarify: (runId, body) => call("POST", `/runs/${runId}/clarify`, body),
  postMessage: (runId, text) => call("POST", `/runs/${runId}/messages`, { text }),
  askQuestion: (runId, question) => call("POST", `/runs/${runId}/questions`, question),
  getQuestion: (runId, key) => call("GET", `/runs/${runId}/questions/${encodeURIComponent(key)}`),
  submitResults: (runId, results) => call("POST", `/runs/${runId}/results`, { results }),
  finish: (runId, body) => call("POST", `/runs/${runId}/finish`, body),
  cleanupTestData: () => call("POST", "/test-data/cleanup", {}),
  testSession: (role) => call("POST", "/test-sessions", { role }),
};
