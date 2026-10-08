const express = require("express");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const {
  globalSearch,
  ask,
  listConversations,
  getConversation,
  deleteConversation,
} = require("../../controller/adminAsk/adminAskController");

const router = express.Router();

router.use(isAuthenticated, authorizeRoles("admin"));

router.get("/search", globalSearch);
router.post("/ask", ask);
router.get("/conversations", listConversations);
router.get("/conversations/:id", getConversation);
router.delete("/conversations/:id", deleteConversation);

module.exports = router;
