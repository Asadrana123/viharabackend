// routes/calling/facetimeRoutes.js
//
// FaceTime test. Mounted at /api/v1/facetime (see app.js).
//   /agent/*  the Mac agent, signed in with its own key (no admin login)
//   /admin/*  the admin panel
// Everything except GET /admin/overview answers 503 unless FACETIME_ENABLED=true.
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const { isServerEnabled } = require("../../services/calling/facetime/facetimeSettingsService");
const { requireAgent, heartbeat, nextJob, jobStatus, jobAnswered } = require("../../controller/calling/facetimeAgentController");
const { getOverview, patchSettings, patchLine, createAgentKey } = require("../../controller/calling/facetimeAdminController");

function requireFacetimeEnabled(req, res, next) {
  if (!isServerEnabled()) {
    return res.status(503).json({ success: false, message: "FaceTime test is off on this server (FACETIME_ENABLED is not 'true')" });
  }
  next();
}

const agent = express.Router();
agent.use(requireFacetimeEnabled, requireAgent);
agent.param("id", (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid job id" });
  next();
});
agent.post("/heartbeat", heartbeat);
agent.post("/jobs/next", nextJob);
agent.post("/jobs/:id/status", jobStatus);
agent.post("/jobs/:id/answered", jobAnswered);

const admin = express.Router();
admin.use(isAuthenticated, authorizeRoles("admin"));
admin.get("/overview", getOverview);
admin.use(requireFacetimeEnabled);
admin.patch("/settings", patchSettings);
admin.patch("/lines/:id", patchLine);
admin.post("/lines/:id/agent-key", createAgentKey);

router.use("/agent", agent);
router.use("/admin", admin);

module.exports = router;
