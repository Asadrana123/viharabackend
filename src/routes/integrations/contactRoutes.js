const express=require("express");
const { saveContact } = require("../../controller/integrations/contactController");
const formRateLimit = require("../../middleware/formRateLimit");
const { verifyRecaptcha } = require("../../middleware/recaptcha");
const router=express.Router();
router.post("/", formRateLimit({ name: "contact" }), verifyRecaptcha, saveContact)
module.exports=router;