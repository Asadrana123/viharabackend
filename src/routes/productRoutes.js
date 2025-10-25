const express=require("express");
const {createProduct,getAllProducts}=require("../controller/productController");
const router=express.Router();
router.post('/create',createProduct);
router.get('/get',getAllProducts);
module.exports=router;