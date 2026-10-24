const express = require("express");
const { submitForm, updateUserDetails, CreateUser, Login, LogOut,
    saveProperty, allsavedProperties, getUser, removeProperty,
    getAllEmailandPhone, forgotPassword, resetPassword, sendOTP, recaptcha,
    updatePassword,exportUserData,deleteAccount } = require("../../controller/users/userController");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const { sendSmSOTP } = require("../../controller/users/otpController");
const router = express.Router();
router.post("/registerUser", CreateUser);
router.post("/login", Login);
router.get("/logout", LogOut);
router.put("/save-property",isAuthenticated, saveProperty);
router.put("/remove-property",isAuthenticated, removeProperty);
router.get("/save-property/get", isAuthenticated,allsavedProperties);
// Logged-out visitors (no token cookie) get 200 { user: null } instead of a 401, so the site's
// first load has no red error in the console. Anyone WITH a cookie goes through isAuthenticated
// exactly as before (a bad or expired token is still a 401).
const noTokenMeansNoUser = (req, res, next) => (req.cookies?.token ? next() : res.status(200).json({ user: null }));
router.get("/get", noTokenMeansNoUser, isAuthenticated, getUser)
// Admin-only: every user's email + phone.
router.get("/getEmails", isAuthenticated, authorizeRoles("admin"), getAllEmailandPhone);
router.post("/forgot/password", forgotPassword);
router.post("/password/reset/:token", resetPassword);
router.put('/update/:userId',isAuthenticated, updateUserDetails);
router.post('/send-otp', sendOTP);
router.post('/send-sms-otp', sendSmSOTP);
router.post('/recaptcha', recaptcha);
router.post("/meeting-form", submitForm)
router.put("/update-password", isAuthenticated, updatePassword);
// routes/userRoutes.js
router.get('/export-data', isAuthenticated, exportUserData);
router.delete('/delete-account', isAuthenticated, deleteAccount);
module.exports = router;