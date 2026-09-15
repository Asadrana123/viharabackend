const express=require("express");
const { sellProperty } = require("../../controller/property/sellingController");
const router=express.Router();
router.post("/",sellProperty)
module.exports=router;