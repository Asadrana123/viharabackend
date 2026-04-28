// routes/landingPageLeadRoutes.js
const express = require('express');
const { createLead, getAllLeads } = require('../controller/landingPageLeadController');
const { isAuthenticated, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

router.post('/register', createLead);
router.get('/leads', isAuthenticated, authorizeRoles('admin'), getAllLeads);

module.exports = router;
