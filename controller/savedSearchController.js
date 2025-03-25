// controllers/savedSearchController.js

const SavedSearch = require('../model/savedSearch');

// Create a new saved search
exports.createSavedSearch = async (req, res) => {
  try {
    const newSearch = new SavedSearch({
      user: req.user.id,
      ...req.body
    });
    
    const savedSearch = await newSearch.save();
    res.status(201).json(savedSearch);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all saved searches for a user
exports.getSavedSearches = async (req, res) => {
  try {
    const searches = await SavedSearch.find({ user: req.user.id }).sort({ dateCreated: -1 });
    res.json(searches);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete a saved search
exports.deleteSavedSearch = async (req, res) => {
  try {
    const search = await SavedSearch.findById(req.params.id);
    
    if (!search) {
      return res.status(404).json({ message: 'Saved search not found' });
    }
    
    // Check user
    if (search.user.toString() !== req.user.id) {
      return res.status(401).json({ message: 'User not authorized' });
    }
    
    // Note: findByIdAndDelete is the modern approach instead of remove()
    await SavedSearch.findByIdAndDelete(req.params.id);
    res.json({ message: 'Saved search removed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};