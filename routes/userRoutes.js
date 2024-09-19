const express = require("express");
const { updateUserDetails,CreateUser, Login, LogOut, saveProperty, allsavedProperties, getUser, removeProperty, getAllEmailandPhone,forgotPassword,resetPassword } = require("../controller/userController");
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
router.post("/forgot/password",forgotPassword);
router.post("/password/reset/:token",resetPassword);
router.put('/update/:userId', updateUserDetails);
module.exports = router;