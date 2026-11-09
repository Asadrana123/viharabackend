const express = require("express");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const { getSiteAnalytics, getPageAnalytics, getAudienceAnalytics, getMarketingPerformance } = require("../../controller/analytics/adminAnalyticsController");
const { getPropertyFunnel, getFunnelAdLinks, setFunnelAdLinks, setFunnelAdSetStage } = require("../../controller/propertyFunnel/propertyFunnelController");

const router = express.Router();

router.use(isAuthenticated, authorizeRoles("admin"));

router.get("/site", getSiteAnalytics);
router.get("/page", getPageAnalytics);
router.get("/audience", getAudienceAnalytics);
router.get("/marketing", getMarketingPerformance);
router.get("/property-funnel", getPropertyFunnel); // Prajwal's Property Funnel tab
// Funnel Ad Links tab: marketing links ads to properties and sets Cold / Warm / Hot.
router.get("/property-funnel/ad-links", getFunnelAdLinks);
router.put("/property-funnel/ad-links/:adId", setFunnelAdLinks);
router.put("/property-funnel/ad-sets/:adSetId/stage", setFunnelAdSetStage);

module.exports = router;
