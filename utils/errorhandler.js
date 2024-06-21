class Errorhandler extends Error{
    constructor(message,statuscode){
        super(message);
        this.statuscode=statuscode;
        //This line captures the current stack trace of the error object. 
        //The stack trace includes information about where the error occurred in the code.
        Error.captureStackTrace(this,this.constructor);
    }
    
}
module.exports=Errorhandler;