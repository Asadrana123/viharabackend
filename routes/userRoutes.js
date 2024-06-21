const express=require("express");
const {CreateUser,Login,LogOut}=require("../controller/userController");
const router=express.Router();
router.post("/registerUser",CreateUser);
router.post("/login",Login);
router.get("/logout",LogOut);
module.exports=router;