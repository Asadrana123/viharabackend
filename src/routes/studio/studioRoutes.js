// routes/studio/studioRoutes.js - the Video Studio (vihara.ai/studio)
const express = require("express");
const multer = require("multer");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const c = require("../../controller/studio/studioController");

const router = express.Router();
// An editor's image of the property (D-047): held in memory, checked, then stored in the private bucket.
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

// The Creative OS, with its shared key, before the sign-in check below.
router.post("/videos/sync", c.requireSyncKey, c.syncVideos);
router.post("/videos/:coreId/cut-link", c.requireSyncKey, c.cutLink);
router.post("/videos/:coreId/cut", c.requireSyncKey, c.confirmCut);
router.post("/runs/poll", c.requireSyncKey, c.pollRuns);
router.post("/runs/:id/file-link", c.requireSyncKey, c.fileLink);
router.post("/runs/:id/file", c.requireSyncKey, c.confirmFile);

// Editors and admins.
router.use(isAuthenticated, authorizeRoles("editor", "admin"));
router.get("/me", c.me);
router.post("/interview/start", c.start);
router.post("/interview/answer", c.answer);
router.put("/profile/name", c.updateName);
router.put("/profile/sections/:key", c.updateSection);
router.post("/profile/notes", c.addNote);
router.get("/videos", c.listVideos);
router.post("/videos/:coreId/feedback", c.addVideoFeedback);
router.get("/runs", c.listRuns);
router.post("/runs", c.startRun);
router.post("/runs/:id/model", c.setRunModel);
router.post("/runs/:id/pick", c.pickForRun);
router.post("/runs/:id/gate", c.gateForRun);
router.post("/runs/:id/generate", c.generateForRun);
router.post("/runs/:id/remake", c.remakeForRun);
// A stopped writing step (concepts, hooks, plan) run again, e.g. after the credits were topped up.
router.post("/runs/:id/retry", c.retryForRun);
router.post("/runs/:id/frames", c.framesForRun);
router.post("/runs/:id/clip", c.clipForRun);
router.post("/runs/:id/build", c.buildForRun);
router.post("/runs/:id/cut", c.cutForRun);
// D-047: the editor's own concept, craft, hook, voiceover lines, camera moves and images.
router.post("/runs/:id/idea", c.ideaForRun);
router.post("/runs/:id/craft", c.craftForRun);
router.post("/runs/:id/hook", c.hookForRun);
router.post("/runs/:id/vo", c.voForRun);
router.post("/runs/:id/shot", c.shotForRun);
router.post("/runs/:id/image", imageUpload.single("image"), c.imageForRun);
router.get("/problems", c.listProblems);
router.post("/problems", c.reportProblem);
router.post("/problems/:id/resolve", authorizeRoles("admin"), c.resolveProblem);
router.get("/proposals", c.listProposals);
router.post("/proposals/:id/decide", c.decideStudioProposal);

// Admins only.
router.get("/editors", authorizeRoles("admin"), c.listEditors);
router.post("/editors", authorizeRoles("admin"), c.addEditor);
router.delete("/editors/:userId", authorizeRoles("admin"), c.removeEditor);
router.post("/editors/:userId/import", authorizeRoles("admin"), c.importInterview);
router.put("/questions", authorizeRoles("admin"), c.updateQuestions);

module.exports = router;
