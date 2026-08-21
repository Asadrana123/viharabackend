// routes/stopCallingRoutes.js
//
// Mounted at /api/v1/lead-calling (see app.js).
//   PATCH /  → admin-only, toggles the daily-sweep "stop calling" kill-switch
//              for one lead: body { leadType, leadId, stopped }.
//
// Named distinctly from leadCallRoutes.js (the public persona-1 /register
// endpoint) to avoid confusion — this file is admin-only call control.
//
// Guard matches the other admin lead endpoints: isAuthenticated + admin role.

const express = require("express");
const router = express.Router();

const { setLeadCalling } = require("../controller/stopCallingController");
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");

router.patch("/", isAuthenticated, authorizeRoles("admin"), setLeadCalling);

module.exports = router;
