const sendToken=(user,statuscode,res,otp)=>{
    const token=user.getJWTToken();
    user={...user._doc,otp};
    const options={
        expires:new Date(
            Date.now()+process.env.cookie_expire*24*60*60*1000,
        ),
        httpOnly:true
    }
    return res.status(statuscode).cookie("token",token,options).json({sucess:true,token,user});
}
module.exports=sendToken;