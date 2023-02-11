const express = require('express')
const testChamberRoute = express.Router()
const {TestChamber} = require('../../../models/schema')
const {USER} = require('../../../models/schema')


testChamberRoute.post('/',async (req,res)=>{
    try{
        const payload = {...req.body,assignedUsers:[{_id:req.user._id,accessType:'admin'}]};
        console.log(payload)
        const testChamber = await TestChamber.create(payload)
        USER.updateOne({_id:req.user._id},{$push:{configuredChambers:{_id:testChamber._id,accessType:'admin'}}},(err)=>{
            if(err){
                res.status(500).json("failed to give the user access to this test chameber")
            }
        })

        res.json(testChamber)
    }catch(err){
        res.status(500).json(err)
    }
})

testChamberRoute.get("/",async(req,res)=>{
    try{
        const chbrs = await getTestChambersForUser(req.user)
        res.json(chbrs)
    }catch(err){
        console.log(err)
        res.status(500)
    }
})
async function getTestChambersForUser(user) {
    const chamberIds = user.configuredChambers.map(chamber => chamber._id);
  
    const chambers = await TestChamber.find({
      '_id': { $in: chamberIds }
    })
      .select('-testPerformed')
      .lean();
  
    const updatedChambers = chambers.map(chamber => {
      const access = user.configuredChambers.find(c => c._id.toString() === chamber._id.toString()).accessType;
      let updatedChamber = { ...chamber, accessType: access };
      if (access !== 'admin') {
        delete updatedChamber.assignedUsers;
      }
      return updatedChamber;
    });
  
    return updatedChambers;
}
module.exports = testChamberRoute