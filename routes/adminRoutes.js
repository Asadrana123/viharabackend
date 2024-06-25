const express=require("express");
const {CreateAdmin,LogOut,Login}=require("../controller/adminController")
const router=express.Router();
router.post("/register",CreateAdmin);
router.post("/login",Login);
router.get("/logout",LogOut);
module.exports=router;