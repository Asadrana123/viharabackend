const express=require("express");
const { sellProperty } = require("../../controller/property/sellingController");
const formRateLimit = require("../../middleware/formRateLimit");
const { verifyRecaptcha } = require("../../middleware/recaptcha");
const router=express.Router();
router.post("/", formRateLimit({ name: "sell-property" }), verifyRecaptcha, sellProperty)
module.exports=router;