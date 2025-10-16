const express=require("express");
const {verifyAdmin}=require("../middleware/verifyAdmin");
const {saveProperty,getAllSavedProperty}=require("../controller/savedProperties");
const router=express.Router();
router.post('/create',saveProperty);
router.get('/get',getAllSavedProperty);
module.exports=router;