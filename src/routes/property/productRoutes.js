const express = require("express");
const {
    createProduct,
    getAllProducts,
    aiSearchProducts,
    getProductById,
    getProductBySlug,
    getDefaultTerms,
    getProductTermsBySlug,
    getAllProductsAdmin,
    updateListingSettings,
    createProductsBulk,
    updateProductBasicDetails,
    updateMarketSyncSettings,
    updateProductPhotos
} =require("../../controller/property/productController");
const { deleteProduct } = require("../../controller/property/productDeleteController");
const { isAuthenticated, authorizeRoles, optionalAuth } = require("../../middleware/auth");
const formRateLimit = require("../../middleware/formRateLimit");
const router = express.Router();

router.post('/create', isAuthenticated, authorizeRoles("admin"), createProduct);
router.post('/bulk', isAuthenticated, authorizeRoles("admin"), createProductsBulk);
router.get('/get', optionalAuth, getAllProducts);

// Public home page "Ask AI" search. Each search is a Claude call, so it's rate limited per visitor.
router.post(
    '/ai-search',
    formRateLimit({ name: "ai-search", max: 10, windowMs: 60 * 1000, message: "Too many searches in a row. Please wait a minute and try again." }),
    aiSearchProducts
);

// Admin listing management
router.get('/admin/all', isAuthenticated, authorizeRoles("admin"), getAllProductsAdmin);
router.put('/admin/:id/listing-settings', isAuthenticated, authorizeRoles("admin"), updateListingSettings);
router.put('/admin/:id/basic-details', isAuthenticated, authorizeRoles("admin"), updateProductBasicDetails);
router.put('/admin/:id/photos', isAuthenticated, authorizeRoles("admin"), updateProductPhotos);
router.put('/admin/:id/market-sync', isAuthenticated, authorizeRoles("admin"), updateMarketSyncSettings);
router.delete('/admin/:id', isAuthenticated, authorizeRoles("admin"), deleteProduct);

// Public slug fetch (detail + landing pages). optionalAuth only so admins get
// the internal fields too; visitors get the public view.
router.get('/slug/:slug', optionalAuth, getProductBySlug);

// Public Terms & Conditions (general, and per property)
router.get('/terms', getDefaultTerms);
router.get('/terms/:slug', getProductTermsBySlug);

// Keep the id catch-all LAST
router.get("/:id", optionalAuth, getProductById);

module.exports = router;
