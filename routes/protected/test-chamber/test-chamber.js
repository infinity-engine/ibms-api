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

module.exports = testChamberRoute