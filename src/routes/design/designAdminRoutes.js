// routes/design/designAdminRoutes.js
//
// Mounted at /api/v1/design (see app.js). Admin-only: ask the design agent for
// a page design, preview it, ask for changes, approve (goes live), undo.
// The Landing Pages tab uses the same requests, started from an HTML mockup.
const express = require("express");
const router = express.Router();

const {
  listPages,
  listLandingPages,
  listRequests,
  getRequest,
  createRequest,
  createLandingRequest,
  skipAndBuild,
  sendFeedback,
  retry,
  approve,
  undo,
  discard,
} = require("../../controller/design/designAdminController");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");

router.use(isAuthenticated, authorizeRoles("admin"));

router.get("/pages", listPages);
router.get("/requests", listRequests);
router.get("/requests/:id", getRequest);
router.post("/requests", createRequest);
router.get("/landing/pages", listLandingPages);
router.post("/landing/requests", createLandingRequest);
router.post("/requests/:id/skip-and-build", skipAndBuild);
router.post("/requests/:id/feedback", sendFeedback);
router.post("/requests/:id/retry", retry);
router.post("/requests/:id/approve", approve);
router.post("/requests/:id/undo", undo);
router.post("/requests/:id/discard", discard);

module.exports = router;
