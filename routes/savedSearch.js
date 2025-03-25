// routes/savedSearch.js

const express = require('express');
const router = express.Router();

// Import the authentication middleware correctly
// Make sure the path to your auth middleware is correct
const { isAuthenticated } = require("../middleware/auth");

// Import controller
const {createSavedSearch,getSavedSearches,deleteSavedSearch} = require('../controller/savedSearchController');

// Debug - make sure middleware and controller functions exist

//console.log("Controller functions:", Object.keys(savedSearchController));

// Save a search
router.post('/', isAuthenticated, createSavedSearch);

// Get all saved searches for a user
router.get('/', isAuthenticated,getSavedSearches);

// Delete a saved search
router.delete('/:id', isAuthenticated, deleteSavedSearch);

module.exports = router;