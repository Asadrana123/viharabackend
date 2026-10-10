// services/design/githubService.js
//
// The few GitHub calls the design agent needs, on the website repo:
// read files, save changes to a branch as one commit, find the Vercel preview
// link for a commit, merge to go live, and delete branches.
//
// ENV:
//   DESIGN_GITHUB_TOKEN — fine-grained token with Contents, Pull requests and
//                         Deployments (read) access to the website repo
//   DESIGN_GITHUB_REPO  — "owner/name" (default Asadrana123/vihara-new-website)
//   DESIGN_BASE_BRANCH  — the branch the live site deploys from (default main)
const axios = require("axios");

const repo = () => process.env.DESIGN_GITHUB_REPO || "Asadrana123/vihara-new-website";
const baseBranch = () => process.env.DESIGN_BASE_BRANCH || "main";

class GithubError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

let client = null;
function gh() {
  if (!process.env.DESIGN_GITHUB_TOKEN) {
    throw new GithubError("DESIGN_GITHUB_TOKEN is not set — the design agent can't reach GitHub");
  }
  if (!client) {
    client = axios.create({
      baseURL: `https://api.github.com/repos/${repo()}`,
      timeout: 30000,
      headers: {
        Authorization: `Bearer ${process.env.DESIGN_GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  }
  return client;
}

// Wraps a GitHub call so failures carry GitHub's own message and status.
async function call(method, url, data, config) {
  try {
    const res = await gh().request({ method, url, data, ...config });
    return res.data;
  } catch (err) {
    if (err instanceof GithubError) throw err;
    const status = err.response?.status;
    const message = err.response?.data?.message || err.message;
    throw new GithubError(`GitHub ${method.toUpperCase()} ${url}: ${message}`, status);
  }
}

const branchSha = async (branch) => (await call("get", `/git/ref/heads/${encodeURIComponent(branch)}`)).object.sha;

// Every file path in the repo at `ref` (one request, cached by commit sha).
const treeCache = new Map();
async function listFiles(ref) {
  const sha = /^[0-9a-f]{40}$/.test(ref) ? ref : await branchSha(ref);
  if (!treeCache.has(sha)) {
    const tree = await call("get", `/git/trees/${sha}`, null, { params: { recursive: 1 } });
    treeCache.set(
      sha,
      tree.tree.filter((e) => e.type === "blob").map((e) => e.path)
    );
    if (treeCache.size > 20) treeCache.delete(treeCache.keys().next().value);
  }
  return treeCache.get(sha);
}

// File text at `ref`, or null if it doesn't exist there.
async function readFile(path, ref) {
  try {
    const data = await call("get", `/contents/${path.split("/").map(encodeURIComponent).join("/")}`, null, {
      params: { ref },
    });
    if (Array.isArray(data) || data.type !== "file") return null;
    if (data.encoding === "base64" && data.content) return Buffer.from(data.content, "base64").toString("utf8");
    // Files over 1 MB come back without content; fetch the blob instead.
    const blob = await call("get", `/git/blobs/${data.sha}`);
    return Buffer.from(blob.content, "base64").toString("utf8");
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

async function createBranch(name, fromSha) {
  await call("post", "/git/refs", { ref: `refs/heads/${name}`, sha: fromSha });
}

async function deleteBranch(name) {
  try {
    await call("delete", `/git/refs/heads/${encodeURIComponent(name)}`);
  } catch (err) {
    if (err.status !== 404 && err.status !== 422) throw err;
  }
}

/**
 * Saves file changes to `branch` as one commit.
 * @param {Object<string, string|null>} files path → new text, or null to delete
 * @returns {Promise<string>} the new commit sha
 */
async function commitFiles(branch, files, message) {
  const parentSha = await branchSha(branch);
  const parent = await call("get", `/git/commits/${parentSha}`);
  const tree = await Promise.all(
    Object.entries(files).map(async ([path, content]) => {
      if (content === null) return { path, mode: "100644", type: "blob", sha: null };
      const blob = await call("post", "/git/blobs", { content, encoding: "utf-8" });
      return { path, mode: "100644", type: "blob", sha: blob.sha };
    })
  );
  const newTree = await call("post", "/git/trees", { base_tree: parent.tree.sha, tree });
  const commit = await call("post", "/git/commits", { message, tree: newTree.sha, parents: [parentSha] });
  // Not forced: fails if someone else moved the branch meanwhile.
  await call("patch", `/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit.sha, force: false });
  return commit.sha;
}

// The website's "Design preview" GitHub Action builds each design branch and
// reports the preview under this environment. Vercel's own Git builds can't
// prerender (no Chrome) and always fail, so they're ignored.
const previewEnvironment = () => process.env.DESIGN_PREVIEW_ENVIRONMENT || "Design Preview";

/**
 * The preview for a commit, from the deployment the preview Action reports to GitHub.
 * @returns {Promise<{state: "pending"|"success"|"failure", url?: string}>}
 */
async function previewForCommit(sha) {
  const deployments = await call("get", "/deployments", null, {
    params: { sha, environment: previewEnvironment(), per_page: 10 },
  });
  if (!deployments.length) return { state: "pending" };
  for (const d of deployments) {
    const statuses = await call("get", `/deployments/${d.id}/statuses`, null, { params: { per_page: 5 } });
    const latest = statuses[0];
    if (!latest) continue;
    if (latest.state === "success") {
      return { state: "success", url: latest.environment_url || latest.target_url };
    }
    if (latest.state === "failure" || latest.state === "error") {
      return { state: "failure", url: latest.target_url || latest.log_url };
    }
  }
  return { state: "pending" };
}

// Opens a pull request for `branch` and squash-merges it into the live branch.
// @returns {Promise<{prNumber: number, mergeSha: string}>}
async function mergeBranch(branch, title, body) {
  const pr = await call("post", "/pulls", { title, head: branch, base: baseBranch(), body });
  try {
    const merged = await call("put", `/pulls/${pr.number}/merge`, { merge_method: "squash", commit_title: title });
    return { prNumber: pr.number, mergeSha: merged.sha };
  } catch (err) {
    await call("patch", `/pulls/${pr.number}`, { state: "closed" }).catch(() => {});
    throw err;
  }
}

// Files a commit changed, with status added / modified / removed / renamed.
async function commitFilesChanged(sha) {
  const commit = await call("get", `/commits/${sha}`);
  return { parentSha: commit.parents[0]?.sha, files: commit.files || [] };
}

module.exports = {
  GithubError,
  baseBranch,
  branchSha,
  listFiles,
  readFile,
  createBranch,
  deleteBranch,
  commitFiles,
  previewForCommit,
  mergeBranch,
  commitFilesChanged,
};
