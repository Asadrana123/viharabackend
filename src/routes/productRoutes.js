const express = require("express");
const {
    createProduct,
    getAllProducts,
    getProductById,
    getProductBySlug,
    getAllProductsAdmin,
    updateListingSettings,
    createProductsBulk
} = require("../controller/productController");
const { isAuthenticated, authorizeRoles, optionalAuth } = require("../middleware/auth");
const router = express.Router();

router.post('/create', isAuthenticated, authorizeRoles("admin"), createProduct);
router.post('/bulk', isAuthenticated, authorizeRoles("admin"), createProductsBulk);
router.get('/get', optionalAuth, getAllProducts);

// Admin listing management
router.get('/admin/all', isAuthenticated, authorizeRoles("admin"), getAllProductsAdmin);
router.put('/admin/:id/listing-settings', isAuthenticated, authorizeRoles("admin"), updateListingSettings);

// Public slug fetch (detail + landing pages)
router.get('/slug/:slug', getProductBySlug);

// Keep the id catch-all LAST
router.get("/:id", getProductById);

module.exports = router;