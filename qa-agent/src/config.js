// Worker configuration from qa-agent/.env. Fails fast with a clear message
// instead of starting a worker that can't do anything.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const errors = [];

const required = (name) => {
  const value = (process.env[name] || "").trim();
  if (!value) errors.push(`${name} is required`);
  return value;
};

const httpUrl = (name, fallback) => {
  const value = (process.env[name] || fallback).trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^/\s]+$/.test(value)) errors.push(`${name}=${value} must be an http(s) origin with no path, e.g. http://localhost:3000`);
  return value;
};

const repoDir = (name) => {
  const value = required(name);
  if (value && !fs.existsSync(path.join(value, "package.json"))) {
    errors.push(`${name}=${value} does not look like a repo checkout (no package.json)`);
  }
  return value ? path.resolve(value) : value;
};

export const config = {
  apiUrl: required("QA_API_URL").replace(/\/+$/, ""),
  agentToken: required("QA_AGENT_TOKEN"),
  // The website the browser opens for ui checks. It must call the backend at
  // QA_API_URL (in development the frontend uses http://localhost:5000).
  frontendUrl: httpUrl("QA_FRONTEND_URL", "http://localhost:3000"),
  workerId: (process.env.QA_WORKER_ID || "qa-worker-1").trim(),
  model: (process.env.QA_MODEL || "claude-opus-5-5").trim(),
  // Small, fast model for the first look at a request (is it a test request at all?).
  triageModel: (process.env.QA_TRIAGE_MODEL || "claude-haiku-4-5").trim(),
  backendRepo: repoDir("QA_BACKEND_REPO"),
  frontendRepo: repoDir("QA_FRONTEND_REPO"),
  pollSeconds: Math.max(5, Number(process.env.QA_POLL_SECONDS) || 15),
  heartbeatSeconds: 30,
};

required("ANTHROPIC_API_KEY");
if (config.agentToken && config.agentToken.length < 32) errors.push("QA_AGENT_TOKEN must be at least 32 characters");
if (!/^[\w.:-]{1,64}$/.test(config.workerId)) errors.push("QA_WORKER_ID may only contain letters, numbers, _ . : -");

if (errors.length) {
  console.error("QA worker config problems:\n  - " + errors.join("\n  - ") + "\nSee qa-agent/.env.example");
  process.exit(1);
}
