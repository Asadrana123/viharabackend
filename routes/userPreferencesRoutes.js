const express = require('express');
const { saveUserPreferences, getUserPreferences, deleteUserPreferences } = require('../controller/userPreferencesController');
const { isAuthenticated } = require('../middleware/auth');
console.log(isAuthenticated);
const router = express.Router();


router.post('/preferences',isAuthenticated, saveUserPreferences);
router.get('/preferences',isAuthenticated, getUserPreferences);
router.delete('/preferences',isAuthenticated, deleteUserPreferences);

module.exports = router;