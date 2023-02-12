const mongoose = require("mongoose");
const { Schema } = mongoose;
const {payLoadSchema} = require('./testConfigSchema')

const users = new Schema({
  //_id: ObjectId, not required as it is added by default by mongoose
  given_name: String,
  family_name: String,
  nickname: String,
  name: String,
  locale: String,
  email: String,
  email_verified: Boolean,
  sub: String,
  created_on: { type: Date, default: Date.now },
  configuredCells: {
    type: [
      {
        _id: { type: mongoose.Schema.Types.ObjectId, required: true },
        accessType: {
            type: String,
            required: true,
            enum: ["admin" | "write" | "read"],
        }
      },
    ],
    default: [],
  },
  configuredChambers: {
    type: [
      {
        _id: { type: mongoose.Schema.Types.ObjectId, required: true },
        accessType: "admin" | "write" | "read",
      },
    ],
    default: []
  },
  configuredBatteryPacks: {
    type: [
      {
        _id: { type: mongoose.Schema.Types.ObjectId, required: true },
        accessType: "admin" | "write" | "read",
      },
    ],
    default: []
  }
});

const testChambers = new Schema({
    name: String,
    controller: String,
    version: String,
    about: String,
    maxTemp: Number, //in °C
    minTemp: Number, //in °C
    location: String,
    assignedUsers: {
      type: [
        {
          _id: mongoose.Schema.Types.ObjectId,
          accessType: {
            type: String,
            required: true,
            enum: ["admin", "write", "read"],
          },
        },
      ],
      default: [],
    },
    testPerformed: {
      type: [
        {
          _id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            auto: true,
          },
          testConfig: {
            type: payLoadSchema,
          },
          testResult: {
            type: mongoose.Schema.Types.Mixed,
            default:null
          },
          isComplete: {type:Boolean,default:false},
          testScheduleDate:Date,//expected to start at this time
          testStartDate: Date,//actual start date, may be due to delay of network from chamber to cloud
          testEndDate: Date,
          createdOn:{type:Date,default:Date.now},
          status: {
            type: String,
            enum: ["Completed", "Running", "Scheduled", "Stopped", "Paused"],
            default:'Scheduled'
          }
        },
      ],
    },
    createdOn:{
      type:Date,
      default:Date.now
    },
    maxNoOfChannels:Number,
    isConnected: {type:Boolean,default:false},
    lastSeen:Date
  });

const USER = mongoose.model("USER", users);
const TestChamber = mongoose.model("TestChamber",testChambers)

module.exports = {USER,TestChamber};