// routes/studio/studioRoutes.js - the Video Studio (vihara.ai/studio)
const express = require("express");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const c = require("../../controller/studio/studioController");

const router = express.Router();

// Editors and admins.
router.use(isAuthenticated, authorizeRoles("editor", "admin"));
router.get("/me", c.me);
router.post("/interview/start", c.start);
router.post("/interview/answer", c.answer);
router.put("/profile/name", c.updateName);
router.put("/profile/sections/:key", c.updateSection);
router.post("/profile/notes", c.addNote);

// Admins only.
router.get("/editors", authorizeRoles("admin"), c.listEditors);
router.post("/editors", authorizeRoles("admin"), c.addEditor);
router.delete("/editors/:userId", authorizeRoles("admin"), c.removeEditor);
router.post("/editors/:userId/import", authorizeRoles("admin"), c.importInterview);
router.put("/questions", authorizeRoles("admin"), c.updateQuestions);

module.exports = router;
