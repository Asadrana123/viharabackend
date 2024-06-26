const express=require("express");
const {CreateUser,Login,LogOut,saveProperty,allsavedProperties,getUser}=require("../controller/userController");
const {isAuthenticated}=require("../middleware/auth");
const router=express.Router();
router.post("/registerUser",CreateUser);
router.post("/login",Login);
router.get("/logout",LogOut);
router.put("/save-property",saveProperty);
router.get("/save-property/get",allsavedProperties);
router.get("/get",isAuthenticated,getUser)
module.exports=router;