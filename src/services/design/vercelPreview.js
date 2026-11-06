// services/design/vercelPreview.js
//
// Finds the Vercel preview of a website commit by asking Vercel directly.
// The design and repair agents used to read GitHub "deployments" for this, but
// the Next.js site (vihara-next) is built by Vercel without creating any, so
// they never saw a preview and timed out.
//
// ENV:
//   VERCEL_TOKEN    — a Vercel access token that can see the website project
//   VERCEL_PROJECT  — project id or name (default vihara-next)
//   VERCEL_TEAM     — team slug (default nodifys-projects)
const axios = require("axios");

const isEnabled = () => Boolean(process.env.VERCEL_TOKEN);

/**
 * Turns Vercel's deployments for a commit into the agents' preview result.
 * @param {Array<Object>} deployments from GET /v7/deployments?sha=…
 * @param {string} sha the commit
 * @returns {{state: "pending"|"success"|"failure", url?: string}}
 */
function previewFromDeployments(deployments, sha) {
  const forCommit = (deployments || []).filter(
    (d) => d && d.target !== "production" && (!d.meta?.githubCommitSha || d.meta.githubCommitSha === sha)
  );
  // Newest first, so a rebuild of the same commit wins over an older failed one.
  forCommit.sort((a, b) => (b.createdAt || b.created || 0) - (a.createdAt || a.created || 0));
  const latest = forCommit[0];
  if (!latest) return { state: "pending" };
  const state = latest.readyState || latest.state;
  if (state === "READY" && latest.url) return { state: "success", url: `https://${latest.url}` };
  if (state === "ERROR" || state === "CANCELED") return { state: "failure", url: latest.inspectorUrl || undefined };
  return { state: "pending" };
}

/** The preview for a website commit, from Vercel's API. */
async function vercelPreviewForCommit(sha) {
  try {
    const res = await axios.get("https://api.vercel.com/v7/deployments", {
      timeout: 30000,
      headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
      params: {
        projectId: process.env.VERCEL_PROJECT || "vihara-next",
        slug: process.env.VERCEL_TEAM || "nodifys-projects",
        sha,
        limit: 10,
      },
    });
    return previewFromDeployments(res.data?.deployments, sha);
  } catch (err) {
    const message = err.response?.data?.error?.message || err.message;
    throw new Error(`Vercel GET /v7/deployments: ${message}`);
  }
}

module.exports = { isEnabled, previewFromDeployments, vercelPreviewForCommit };
