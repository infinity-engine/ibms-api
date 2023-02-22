function tapData(req,res,next){
    console.log("Tapped");
    next();
}

module.exports = tapData;