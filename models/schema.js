const mongoose = require('mongoose')
const { Schema } = mongoose

const users = new Schema({
    //_id: ObjectId, not required as it is added by default by mongoose
    given_name: String,
    family_name: String,
    nickname: String,
    name: String,
    locale: String,
    email: String,
    email_verified:Boolean,
    sub: String,
    created_on: {type:Date,default:Date.now},
    cellsConfigured:{
        type:[mongoose.ObjectId],
        default:[]
    },
    chambersAssigned:{
        type:[{_id:mongoose.ObjectId,accessType:'admin'|'write'|'read'}],
        default:[]
    }
})

const USER = mongoose.model('USER',users)

module.exports = USER