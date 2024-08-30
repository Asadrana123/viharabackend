const express = require("express");
const { CreateUser, Login, LogOut, saveProperty, allsavedProperties, getUser, removeProperty, getAllEmailandPhone } = require("../controller/userController");
const { isAuthenticated } = require("../middleware/auth");
const router = express.Router();
router.post("/registerUser", CreateUser);
router.post("/login", Login);
router.get("/logout", LogOut);
router.put("/save-property", saveProperty);
router.put("/rempve-property", removeProperty);
router.get("/save-property/get", allsavedProperties);
router.get("/get", isAuthenticated, getUser)
router.get("/getEmails", getAllEmailandPhone);
module.exports = router;