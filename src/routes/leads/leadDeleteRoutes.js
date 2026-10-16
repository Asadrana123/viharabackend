// routes/leads/leadDeleteRoutes.js
//
// Mounted at /api/v1/admin-leads (see app.js).
//   DELETE /:leadType/:leadId  → admin-only, permanently deletes one lead.

const express = require("express");
const router = express.Router();

const { deleteLead } = require("../../controller/leads/leadDeleteController");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");

router.delete("/:leadType/:leadId", isAuthenticated, authorizeRoles("admin"), deleteLead);

module.exports = router;
