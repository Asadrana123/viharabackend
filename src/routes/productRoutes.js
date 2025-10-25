const express=require("express");
const {createProduct,getAllProducts}=require("../controller/productController");
const { isAuthenticated, authorizeRoles } = require("../middleware/auth");
const router=express.Router();
router.post('/create',isAuthenticated,authorizeRoles("admin"),createProduct);
router.get('/get',getAllProducts);
module.exports=router;