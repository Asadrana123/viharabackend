const express = require("express");
const { createProduct, getAllProducts,getProductById } = require("../controller/productController");
const { isAuthenticated, authorizeRoles, optionalAuth } = require("../middleware/auth");
const router = express.Router();

router.post('/create', isAuthenticated, authorizeRoles("admin"), createProduct);
router.get('/get', optionalAuth, getAllProducts);  // ← add optionalAuth
router.get("/:id", getProductById);  
module.exports = router;