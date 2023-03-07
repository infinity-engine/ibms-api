const { default: mongoose } = require("mongoose");
const { ChamberAPI } = require("../../models/schema");
const { TestChamber } = require("../../models/schema");

async function checkAccess(req, res, next) {
  //check with the chamber id and api key the user has appropriate access or not
  //return req.body = > {user,chamberId}
  //here also add code for user ip address check multiple false attemt could be made to genrate and valid api key
  try {
    const api = await ChamberAPI.findOne({apiKey:req.query.apiKey,})
    if(api.assignedChamber.accessType == 'admin' || api.assignedChamber.accessType == 'write'){
      req.assignedChamberId = api.assignedChamber._id;
      TestChamber.updateOne({_id:mongoose.Types.ObjectId(api.assignedChamber._id)},{$set:{lastSeen:Date.now()}}).then(data=>{
        //console.log(data)
      });
      next();
    }else{
      res.status(401).json({"msg":"This api key doesn't have appropriate access to write to this chamber"});
    }
  } catch (err) {
    console.log(err);
    res.status(401).json({status:"failed", msg: "error" });
  }
}

module.exports = checkAccess;
