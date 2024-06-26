const express=require("express");
const {CreateUser,Login,LogOut,saveProperty}=require("../controller/userController");
const router=express.Router();
router.post("/registerUser",CreateUser);
router.post("/login",Login);
router.get("/logout",LogOut);
router.put("/save-property",saveProperty);
module.exports=router;