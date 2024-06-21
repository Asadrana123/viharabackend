const Errorhandler=require("../utils/errorhandler");
module.exports=(err,req,res,next)=>{
    err.statuscode=err.statuscode||500;
    console.log(err);
    err.message=err.message||"Interval Server Error";
    if(err.name==="CastError"){
        const message=`Product Not Found  invalid: ${err.path}`;
        const statuscode=400;
        err=new Errorhandler(message,statuscode);
    }
    //if user trying to register with registered email
    if(err.code==11000){
        err=new Errorhandler(`Duplicate ${Object.keys(err.keyValue)} error`,400);
    }
    if(err.name==="JsonWebTokenError"){
        const message=`Json Web Token is invalid`;
        const statuscode=400;
        err=new Errorhandler(message,statuscode);
    }
    if(err.name==="TokenExpiredError"){
        const message=`Token is Expired`;
        const statuscode=400;
        err=new Errorhandler(message,statuscode);
    }
    res.status(err.statuscode).json({
        success:false,
        error:err.message
    })
}