// Credentials for agent sessions.
//
// The Agent SDK runs Claude Code underneath, which will happily fall back to
// whatever login exists on the machine (a developer's Claude subscription,
// or the parent session when launched from Claude Code). The worker must bill
// exactly the ANTHROPIC_API_KEY it was configured with, so:
//   1. buildAgentEnv() drops inherited Claude Code session/auth variables;
//   2. assertApiKeyAuth() checks the session's init message and aborts before
//      any model call if the credential came from anywhere else.
const INHERITED = /^(CLAUDECODE|CLAUDE_CODE_.*|CLAUDE_AGENT_SDK_.*|ANTHROPIC_AUTH_TOKEN|ANTHROPIC_BASE_URL)$/;

export function buildAgentEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!INHERITED.test(key) && value !== undefined) env[key] = value;
  }
  env.CLAUDE_AGENT_SDK_CLIENT_APP = "vihara-qa-agent/0.1";
  return env;
}

export class CredentialError extends Error {}

// Account problems the SDK would otherwise retry with backoff for minutes —
// retrying can't fix them, so fail the run straight away.
const FATAL_API_ERRORS = {
  authentication_failed: "The Anthropic API rejected ANTHROPIC_API_KEY. Check the key in qa-agent/.env.",
  billing_error: "The Anthropic account has a billing problem (out of credits?).",
  account_on_hold: "The Anthropic account is on hold.",
  oauth_org_not_allowed: "The Anthropic credentials are not allowed for this organization.",
  model_not_found: "The configured QA_MODEL is not available to this API key.",
};

/** Call with every streamed message; throws on wrong or broken credentials. */
export function assertApiKeyAuth(message) {
  if (message.type !== "system") return;
  if (message.subtype === "api_retry" && FATAL_API_ERRORS[message.error]) {
    throw new CredentialError(FATAL_API_ERRORS[message.error]);
  }
  if (message.subtype !== "init") return;
  if (message.apiKeySource !== "ANTHROPIC_API_KEY") {
    throw new CredentialError(
      `The agent was about to use "${message.apiKeySource}" credentials instead of the configured ANTHROPIC_API_KEY. ` +
        "Stopped before any model call. Check ANTHROPIC_API_KEY in qa-agent/.env."
    );
  }
}
