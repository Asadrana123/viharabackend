// routes/landingPageLeadRoutes.js
const express = require('express');
const { createLead } = require('../controller/landingPageLeadController');

const router = express.Router();

router.post('/register', createLead);

module.exports = router;
