const express = require("express");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const { getSiteAnalytics, getPageAnalytics, getAudienceAnalytics, getMarketingPerformance } = require("../../controller/analytics/adminAnalyticsController");
const { getPropertyFunnel } = require("../../controller/propertyFunnel/propertyFunnelController");

const router = express.Router();

router.use(isAuthenticated, authorizeRoles("admin"));

router.get("/site", getSiteAnalytics);
router.get("/page", getPageAnalytics);
router.get("/audience", getAudienceAnalytics);
router.get("/marketing", getMarketingPerformance);
router.get("/property-funnel", getPropertyFunnel); // Prajwal's Property Funnel tab

module.exports = router;
