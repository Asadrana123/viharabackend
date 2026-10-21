const express = require("express");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const { getSiteAnalytics, getPageAnalytics, getAudienceAnalytics } = require("../../controller/analytics/adminAnalyticsController");

const router = express.Router();

router.use(isAuthenticated, authorizeRoles("admin"));

router.get("/site", getSiteAnalytics);
router.get("/page", getPageAnalytics);
router.get("/audience", getAudienceAnalytics);

module.exports = router;
