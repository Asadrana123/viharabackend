const express = require("express");
const { submitForm, updateUserDetails, CreateUser, Login, LogOut,
    saveProperty, allsavedProperties, getUser, removeProperty,
    getAllEmailandPhone, forgotPassword, resetPassword, sendOTP, recaptcha,
    updatePassword,exportUserData,deleteAccount } = require("../controller/userController");
const { isAuthenticated } = require("../middleware/auth");
const { sendSmSOTP } = require("../controller/otpController");
const router = express.Router();
router.post("/registerUser", CreateUser);
router.post("/login", Login);
router.get("/logout", LogOut);
router.put("/save-property", saveProperty);
router.put("/remove-property", removeProperty);
router.get("/save-property/get", allsavedProperties);
router.get("/get", isAuthenticated, getUser)
router.get("/getEmails", getAllEmailandPhone);
router.post("/forgot/password", forgotPassword);
router.post("/password/reset/:token", resetPassword);
router.put('/update/:userId', updateUserDetails);
router.post('/send-otp', sendOTP);
router.post('/send-sms-otp', sendSmSOTP);
router.post('/recaptcha', recaptcha);
router.post("/meeting-form", submitForm)
router.put("/update-password", isAuthenticated, updatePassword);
// routes/userRoutes.js
router.get('/export-data', isAuthenticated, exportUserData);
router.delete('/delete-account', isAuthenticated, deleteAccount);
module.exports = router;