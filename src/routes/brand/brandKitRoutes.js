// routes/brand/brandKitRoutes.js
//
// Mounted at /api/v1/brand-kit (see app.js). Reading is public (every page
// applies the brand colours/fonts); changing it is admin-only.
const express = require("express");
const router = express.Router();

const {
  getBrandKit,
  updateBrandKit,
  resetBrandKit,
} = require("../../controller/brand/brandKitController");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");

router.get("/", getBrandKit);
router.put("/", isAuthenticated, authorizeRoles("admin"), updateBrandKit);
router.post("/reset", isAuthenticated, authorizeRoles("admin"), resetBrandKit);

module.exports = router;
