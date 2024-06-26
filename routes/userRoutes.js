const express=require("express");
const {CreateUser,Login,LogOut,saveProperty,allsavedProperties}=require("../controller/userController");
const router=express.Router();
router.post("/registerUser",CreateUser);
router.post("/login",Login);
router.get("/logout",LogOut);
router.put("/save-property",saveProperty);
router.get("/save-property/get",allsavedProperties);
module.exports=router;