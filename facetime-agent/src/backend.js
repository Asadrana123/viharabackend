// The backend's agent API (routes/calling/facetimeRoutes.js, /api/v1/facetime/agent).
// Shared by the mock agent now and the real Mac agent later.
import "dotenv/config";

const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
const AGENT_KEY = process.env.FACETIME_AGENT_KEY || "";

async function post(path, body = {}) {
  if (!AGENT_KEY) {
    throw new Error("FACETIME_AGENT_KEY is missing. Make one in the admin panel (FaceTime Test → Macs → Get agent key) and put it in facetime-agent/.env");
  }
  const res = await fetch(`${BACKEND_URL}/api/v1/facetime/agent${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${AGENT_KEY}` },
    body: JSON.stringify(body),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    // an empty or non-JSON answer still has a status code worth reporting
  }
  if (!res.ok) {
    const err = new Error(data.message || `backend answered ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const heartbeat = (agentVersion) => post("/heartbeat", { agentVersion });
export const nextJob = async () => (await post("/jobs/next")).job;
export const reportStatus = (jobId, status, note = "") => post(`/jobs/${jobId}/status`, { status, note });
export const answered = (jobId) => post(`/jobs/${jobId}/answered`);
export { BACKEND_URL };
