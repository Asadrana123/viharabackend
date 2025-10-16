module.exports=(Fun)=>(req,res,next)=>{
    Promise.resolve(Fun(req,res,next)).catch(next);
}