const express = require("express");
const { submitForm, updateUserDetails, CreateUser, Login, LogOut,
    saveProperty, allsavedProperties, getUser, removeProperty,
    getAllEmailandPhone, forgotPassword, resetPassword, sendOTP,
    updatePassword,exportUserData,deleteAccount } = require("../../controller/users/userController");
const { isAuthenticated, authorizeRoles } = require("../../middleware/auth");
const { sendSmSOTP } = require("../../controller/users/otpController");
const formRateLimit = require("../../middleware/formRateLimit");
const { verifyRecaptcha } = require("../../middleware/recaptcha");
const router = express.Router();
router.post("/registerUser", formRateLimit({ name: "signup" }), verifyRecaptcha, CreateUser);
router.post("/login", formRateLimit({ name: "login", max: 10, message: "Too many login attempts. Please wait a few minutes and try again." }), verifyRecaptcha, Login);
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
router.post("/forgot/password", formRateLimit({ name: "forgot-password" }), verifyRecaptcha, forgotPassword);
router.post("/password/reset/:token", formRateLimit({ name: "reset-password" }), verifyRecaptcha, resetPassword);
router.put('/update/:userId',isAuthenticated, updateUserDetails);
// The OTP senders aren't called from the Next site, so no captcha; the limits stop email/SMS floods.
router.post('/send-otp', formRateLimit({ name: "send-otp", max: 3 }), sendOTP);
router.post('/send-sms-otp', formRateLimit({ name: "send-sms-otp", max: 3 }), sendSmSOTP);
router.post("/meeting-form", formRateLimit({ name: "meeting-form" }), verifyRecaptcha, submitForm)
router.put("/update-password", isAuthenticated, updatePassword);
// routes/userRoutes.js
router.get('/export-data', isAuthenticated, exportUserData);
router.delete('/delete-account', isAuthenticated, deleteAccount);
module.exports = router;