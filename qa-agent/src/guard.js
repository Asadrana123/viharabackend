// Secret-file guard for the agent's file tools.
//
// Repo-wide Grep/Glob already skip .env files (both repos gitignore them), but
// an explicit path — Read(".env") or Grep(path: ".env") — bypasses gitignore.
// This PreToolUse hook denies any file tool call that points at a secret file,
// so keys never reach the model, the plan, or the admin thread.
import path from "node:path";

const SECRET_NAME = /^\.env(\..+)?$|\.pem$|\.key$|^id_(rsa|ed25519)/i;
const ALLOWED_NAMES = new Set([".env.example", ".env.sample", ".env.template"]);
const PATH_FIELDS = ["file_path", "path", "glob", "pattern", "notebook_path"];

export function isSecretPath(value) {
  if (typeof value !== "string" || !value) return false;
  // Check every path segment and glob piece, e.g. "src/**/.env*" or "config/.env.local".
  return value.split(/[\\/]+/).some((part) => {
    const name = part.trim();
    if (ALLOWED_NAMES.has(name.toLowerCase())) return false;
    return SECRET_NAME.test(name) || /^\.env\*?$/.test(name) || /^\.env[.*]/.test(name);
  });
}

const deny = (reason) => ({
  hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
});

async function secretFileHook(input) {
  if (input.hook_event_name !== "PreToolUse") return {};
  const toolInput = input.tool_input && typeof input.tool_input === "object" ? input.tool_input : {};
  for (const field of PATH_FIELDS) {
    // Glob's `pattern` is a path pattern; Grep's `pattern` is a regex over contents — only check it for Glob.
    if (field === "pattern" && input.tool_name !== "Glob") continue;
    if (isSecretPath(toolInput[field])) {
      return deny(`Access to secret files (${path.basename(String(toolInput[field]))}) is blocked for the QA agent. Work from code and .env.example instead.`);
    }
  }
  return {};
}

export const secretFileHooks = {
  PreToolUse: [{ matcher: "Read|Grep|Glob|Edit|Write|NotebookEdit", hooks: [secretFileHook] }],
};
