// routes/landingPageLeadRoutes.js
const express = require('express');
const { createLead, getAllLeads } = require('../../controller/leads/landingPageLeadController');
const { isAuthenticated, authorizeRoles } = require('../../middleware/auth');
const formRateLimit = require('../../middleware/formRateLimit');
const { verifyRecaptcha } = require('../../middleware/recaptcha');

const router = express.Router();

router.post('/register', formRateLimit({ name: 'landing-lead' }), verifyRecaptcha, createLead);
router.get('/leads', isAuthenticated, authorizeRoles('admin'), getAllLeads);

module.exports = router;
