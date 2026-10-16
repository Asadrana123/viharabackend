// routes/adsLoop/adsLoopRoutes.js
//
// Mounted at /api/v1/ads-loop (see app.js).
//   /slack/*  called by Slack; open, but every request's signature is checked
//   /health   open, for an uptime monitor (no secrets in the answer)
//   the rest  admin only
const express = require("express");
const router = express.Router();
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const c = require("../../controller/adsLoop/adsLoopController");

// Slack sends button clicks and slash commands form-encoded; keep the raw body
// for the signature check (JSON events get it from the app-wide parser).
const slackForm = express.urlencoded({
    extended: false,
    limit: "1mb",
    verify: (req, res, buf) => {
        req.rawBody = buf;
    },
});

router.post("/slack/events", c.slackEvents);
router.post("/slack/interactions", slackForm, c.slackInteractions);
router.post("/slack/commands", slackForm, c.slackCommand);
router.get("/health", c.health);

router.use(isAuthenticated, authorizeRoles("admin"));

router.get("/creatives", c.listCreatives);
router.get("/creatives/:coreId", c.getCreative);
router.post("/creatives", c.createCreative);
router.get("/design-rules.md", c.designRulesMarkdown);
router.get("/design-rules/queue.md", c.designRulesQueue);
router.post("/design-rules/:id/recorded", c.markDesignRuleRecorded);
router.delete("/design-rules/:id", c.removeDesignRule);
router.post("/library/reference", c.addReferenceExample);
router.post("/run/pull", c.runPull);
router.post("/run/weekly", c.runWeekly);
router.get("/zernio/accounts", c.zernioAccounts);

module.exports = router;
