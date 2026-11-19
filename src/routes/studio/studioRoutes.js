// routes/studio/studioRoutes.js - the Video Studio (vihara.ai/studio)
const express = require("express");
const multer = require("multer");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const c = require("../../controller/studio/studioController");
const cr = require("../../controller/studio/creativeController");
const estimates = require("../../controller/studio/estimateController");

const router = express.Router();
// An editor's image of the property (D-047): held in memory, checked, then stored in the private bucket.
// A chat message's photos and documents (D-050).
const chatUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 5 } });
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
// The Estimate page's video, static or carousel: on disk, not in memory (a video can be big).
const estimateUpload = multer({ storage: multer.diskStorage({}), limits: { fileSize: 300 * 1024 * 1024, files: 10 } });

// The Creative OS, with its shared key, before the sign-in check below.
router.post("/videos/sync", c.requireSyncKey, c.syncVideos);
router.post("/videos/:coreId/cut-link", c.requireSyncKey, c.cutLink);
router.post("/videos/:coreId/cut", c.requireSyncKey, c.confirmCut);
router.post("/runs/poll", c.requireSyncKey, c.pollRuns);
router.post("/runs/:id/file-link", c.requireSyncKey, c.fileLink);
router.post("/runs/:id/file", c.requireSyncKey, c.confirmFile);
// Statics made in the Studio: the Creative OS asks for these on their own route.
router.post("/creatives/poll", c.requireSyncKey, cr.pollCreatives);
router.post("/creatives/:id/file-link", c.requireSyncKey, cr.creativeFileLink);
router.post("/creatives/:id/file", c.requireSyncKey, cr.confirmCreativeFile);

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
router.post("/runs/:id/view", c.viewForRun);
router.post("/runs/:id/frames", c.framesForRun);
router.post("/runs/:id/clip", c.clipForRun);
router.post("/runs/:id/build", c.buildForRun);
router.post("/runs/:id/cut", c.cutForRun);
// D-047: the editor's own concept, craft, hook, voiceover lines, camera moves and images.
router.post("/runs/:id/idea", c.ideaForRun);
router.post("/runs/:id/craft", c.craftForRun);
router.post("/runs/:id/sound", c.soundForRun);
// D-056: the editor checks the property's photos.
router.post("/runs/:id/photos", c.photosForRun);
// D-058: the editor confirms the property's new price.
router.post("/runs/:id/price", c.priceForRun);
router.post("/runs/:id/undo", c.undoForRun);
router.post("/runs/:id/reopen", c.reopenForRun);
router.post("/runs/:id/layers", c.layersForRun);
router.post("/runs/:id/chat", chatUpload.array("files", 5), c.chatForRun);
router.post("/runs/:id/hook", c.hookForRun);
router.post("/runs/:id/vo", c.voForRun);
router.post("/runs/:id/shot", c.shotForRun);
// Dinesh, 2026-11-12: what Maya does in a scene, and the timing on the timeline.
router.post("/runs/:id/maya", c.mayaForRun);
router.post("/runs/:id/timeline", c.timelineForRun);
// D-051: the editor's music.
router.post("/runs/:id/music", c.musicForRun);
// D-052: a music track the editor adds, and an editor's licence for a track in the library.
router.post("/runs/:id/track", imageUpload.single("track"), c.trackForRun);
router.post("/runs/:id/track-rights", c.trackRightsForRun);
router.post("/runs/:id/image", imageUpload.single("image"), c.imageForRun);
// Statics made in the Studio (vihara.ai/studio/creatives).
router.get("/creatives", cr.listCreatives);
router.post("/creatives", cr.startCreative);
router.post("/creatives/:id/hook", cr.hookForCreative);
router.post("/creatives/:id/make", cr.makeForCreative);
// A carousel's options written again by Claude, around the editor's own words (D-059).
router.post("/creatives/:id/write", cr.writeForCreative);
router.post("/creatives/:id/decide", cr.decideForCreative);
router.post("/creatives/:id/revise", cr.reviseForCreative);
router.post("/creatives/:id/photos", cr.photosForCreative);
router.post("/creatives/:id/price", cr.priceForCreative);
router.post("/creatives/:id/retry", cr.retryForCreative);
router.post("/creatives/:id/view", cr.viewForCreative);
router.get("/problems", c.listProblems);
router.post("/problems", c.reportProblem);
router.post("/problems/:id/resolve", authorizeRoles("admin"), c.resolveProblem);
// How a new video, static or carousel may do on Meta before it goes live.
router.get("/estimates", estimates.listEstimates);
router.get("/estimates/ads", estimates.listLinkableAds);
router.post("/estimates", estimateUpload.array("files", 10), estimates.createFromUpload);
router.post("/estimates/video/:coreId", estimates.createFromStudioVideo);
router.get("/estimates/:id", estimates.getEstimate);
router.post("/estimates/:id/link", estimates.linkEstimate);
router.get("/proposals", c.listProposals);
router.post("/proposals/:id/decide", c.decideStudioProposal);

// Admins only.
router.get("/editors", authorizeRoles("admin"), c.listEditors);
router.post("/editors", authorizeRoles("admin"), c.addEditor);
router.delete("/editors/:userId", authorizeRoles("admin"), c.removeEditor);
router.post("/editors/:userId/import", authorizeRoles("admin"), c.importInterview);
router.put("/questions", authorizeRoles("admin"), c.updateQuestions);

module.exports = router;
