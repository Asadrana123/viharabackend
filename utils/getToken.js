//ye itna code baar baar likhna padta to login aur register wale controller me to ise ek hi baar likh liya
const sendToken=(user,statuscode,res)=>{
    console.log(user);
    const token=user.getJWTToken();
    console.log(token);
    const options={
        expires:new Date(
            Date.now()+process.env.cookie_expire*24*60*60*1000,
        ),
        httpOnly:true
    }
    return res.status(statuscode).cookie("token",token,options).json({sucess:true,token,user});
}
module.exports=sendToken;