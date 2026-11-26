// routes/leads/homePopupLeadRoutes.js
const express = require("express");
const router = express.Router();
const {
  submitHomePopupLead,
  sendHomePopupCode,
  verifyHomePopupCode,
  getAllHomePopupLeads,
} = require("../../controller/leads/homePopupLeadController");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const formRateLimit = require("../../middleware/formRateLimit");
const { verifyRecaptcha } = require("../../middleware/recaptcha");

// Public — the home page popup form.
router.post("/submit", formRateLimit(), verifyRecaptcha, submitHomePopupLead);
// Public — the phone code step after submit (needs the key /submit returned).
router.post("/:id/phone/send", formRateLimit({ name: "home-popup-phone", max: 6 }), sendHomePopupCode);
router.post("/:id/phone/verify", formRateLimit({ name: "home-popup-verify", max: 12 }), verifyHomePopupCode);

// Admin — paginated home popup leads.
router.get("/", isAuthenticated, authorizeRoles("admin"), getAllHomePopupLeads);

module.exports = router;
