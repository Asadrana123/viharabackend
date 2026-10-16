// services/design/githubService.js
//
// The few GitHub calls the design agent needs, on the website repo:
// read files, save changes to a branch as one commit, find the Vercel preview
// link for a commit, merge to go live, and delete branches.
//
// createGithubClient() gives the same calls for another repo / token (the
// repair agent uses it for both the website and the backend repo).
//
// ENV:
//   DESIGN_GITHUB_TOKEN — fine-grained token with Contents, Pull requests and
//                         Deployments (read) access to the website repo
//   DESIGN_GITHUB_REPO  — "owner/name" (default Asadrana123/vihara-new-website)
//   DESIGN_BASE_BRANCH  — the branch the live site deploys from (default main)
const axios = require("axios");

class GithubError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Commit trees and blobs never change for a sha, so these caches are shared by every client.
const treeCache = new Map();
const blobCache = new Map();

// The website's "Design preview" GitHub Action builds each design branch and
// reports the preview under this environment. Vercel's own Git builds can't
// prerender (no Chrome) and always fail, so they're ignored.
const previewEnvironment = () => process.env.DESIGN_PREVIEW_ENVIRONMENT || "Design Preview";

/**
 * @param {Object} opts
 * @param {() => string} opts.repo        "owner/name"
 * @param {() => string} opts.token       GitHub token
 * @param {() => string} opts.baseBranch  the live branch
 * @param {string} [opts.label]           who is calling, for the missing-token error
 * @param {string} [opts.tokenName]       env var that holds the token, for the same error
 */
function createGithubClient({ repo, token, baseBranch, label = "the agent", tokenName = "The GitHub token" }) {
  let client = null;
  let clientKey = "";
  function gh() {
    const t = token();
    if (!t) throw new GithubError(`${tokenName} is not set — ${label} can't reach GitHub`);
    const key = `${repo()}|${t}`;
    if (!client || clientKey !== key) {
      clientKey = key;
      client = axios.create({
        baseURL: `https://api.github.com/repos/${repo()}`,
        timeout: 30000,
        headers: {
          Authorization: `Bearer ${t}`,
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

  // Every file in the repo at `ref` as { path, sha } (one request, cached by commit sha).
  async function listTree(ref) {
    const sha = /^[0-9a-f]{40}$/.test(ref) ? ref : await branchSha(ref);
    if (!treeCache.has(sha)) {
      const tree = await call("get", `/git/trees/${sha}`, null, { params: { recursive: 1 } });
      treeCache.set(
        sha,
        tree.tree.filter((e) => e.type === "blob").map((e) => ({ path: e.path, sha: e.sha }))
      );
      if (treeCache.size > 20) treeCache.delete(treeCache.keys().next().value);
    }
    return treeCache.get(sha);
  }

  // Every file path in the repo at `ref`.
  async function listFiles(ref) {
    return (await listTree(ref)).map((e) => e.path);
  }

  // File text by blob sha. Blobs never change, so they're cached for good
  // (bounded), which keeps re-scanning the site cheap after small changes.
  async function readBlob(sha) {
    if (!blobCache.has(sha)) {
      const blob = await call("get", `/git/blobs/${sha}`);
      blobCache.set(sha, Buffer.from(blob.content, "base64").toString("utf8"));
      if (blobCache.size > 3000) blobCache.delete(blobCache.keys().next().value);
    }
    return blobCache.get(sha);
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

  /**
   * The preview for a commit, from the deployment the preview Action reports to GitHub.
   * @returns {Promise<{state: "pending"|"success"|"failure", url?: string}>}
   */
  async function previewForCommit(sha) {
    if (!sha) throw new GithubError("previewForCommit needs a commit sha");
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

  /** True when `head` is `base` or comes after it (i.e. `head` contains `base`). */
  async function includesCommit(head, base) {
    const result = await call("get", `/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`);
    return result.status === "identical" || result.status === "ahead";
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

  /** Recent commits on the live branch, newest first (optionally only those touching `path`). */
  async function listCommits({ since, until, path, perPage = 30 } = {}) {
    return call("get", "/commits", null, {
      params: { sha: baseBranch(), per_page: perPage, ...(since && { since }), ...(until && { until }), ...(path && { path }) },
    });
  }

  /** One commit with its changed files and their patches. */
  const getCommit = (sha) => call("get", `/commits/${encodeURIComponent(sha)}`);

  return {
    repo,
    baseBranch,
    branchSha,
    listTree,
    listFiles,
    readBlob,
    readFile,
    createBranch,
    deleteBranch,
    commitFiles,
    previewForCommit,
    includesCommit,
    mergeBranch,
    commitFilesChanged,
    listCommits,
    getCommit,
  };
}

// The design agent's client: the website repo with the design token.
const website = createGithubClient({
  repo: () => process.env.DESIGN_GITHUB_REPO || "Asadrana123/vihara-new-website",
  token: () => process.env.DESIGN_GITHUB_TOKEN,
  baseBranch: () => process.env.DESIGN_BASE_BRANCH || "main",
  label: "the design agent",
  tokenName: "DESIGN_GITHUB_TOKEN",
});

module.exports = {
  GithubError,
  createGithubClient,
  baseBranch: website.baseBranch,
  branchSha: website.branchSha,
  listTree: website.listTree,
  listFiles: website.listFiles,
  readBlob: website.readBlob,
  readFile: website.readFile,
  createBranch: website.createBranch,
  deleteBranch: website.deleteBranch,
  commitFiles: website.commitFiles,
  previewForCommit: website.previewForCommit,
  mergeBranch: website.mergeBranch,
  commitFilesChanged: website.commitFilesChanged,
};
