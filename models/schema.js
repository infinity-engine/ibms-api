const mongoose = require("mongoose");
const { Schema } = mongoose;
const { payLoadSchema } = require("./testConfigSchema");
const { testResultSchema } = require("./testResultSchema");

const accessSchema = new Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, required: true },
    accessType: {
      type: String,
      required: true,
      enum: ["admin", "write", "read"],
    },
  },
  { versionKey: false }
);

const user = new Schema(
  {
    //_id: ObjectId, not required as it is added by default by mongoose
    given_name: String,
    family_name: String,
    nickname: String,
    name: String,
    locale: String,
    email: String,
    email_verified: Boolean,
    sub: String,
    picture: String,
    created_on: { type: Date, default: Date.now },
    configuredCells: {
      type: [accessSchema],
      default: [],
    },
    configuredChambers: {
      type: [accessSchema],
      default: [],
    },
    configuredBatteryPacks: {
      type: [accessSchema],
      default: [],
    },
  },
  { versionKey: false }
);
const test = new Schema(
  {
    testConfig: {
      type: payLoadSchema,
    },
    testResult: {
      type: testResultSchema,
      default: { channels: [] },
    },
    testScheduleDate: Date, //expected to start at this time
    testStartDate: Date, //actual start date, may be due to delay of network from chamber to cloud
    testEndDate: Date, //could be completed, or stopped date
    createdOn: { type: Date, default: Date.now },
    createdByUser: mongoose.Schema.Types.ObjectId,
    createdOnChamber: mongoose.Schema.Types.ObjectId,
    testName: {
      type: String,
      required: true,
    },
    testDesc: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      enum: ["Completed", "Running", "Scheduled", "Stopped", "Paused"],
      default: "Scheduled",
    },
    forcedStatus: {
      type: mongoose.Schema.Types.Mixed,
      enum: ["Completed", "Running", "Scheduled", "Stopped", "Paused", null],
      default: null,
    },
  },
  { versionKey: false }
);
test.index({ createdOnChamber: 1 }, { background: true });
test.index({ createdByUser: 1 }, { background: true });

const testchamber = new Schema(
  {
    name: String,
    controller: String,
    version: String,
    about: String,
    maxTemp: Number, //in °C
    minTemp: Number, //in °C
    location: String,
    assignedUsers: {
      type: [accessSchema],
      default: [],
    },
    testsPerformed: {
      type: [{ testId: mongoose.Schema.Types.ObjectId }],
      default: [],
    },
    createdOn: {
      type: Date,
      default: Date.now,
    },
    maxNoOfChannels: {
      type: Number,
      default: 1,
    },
    isConnected: {
      type: Boolean,
      default: false,
    },
    lastSeen: Date,
    isMarkedForDeleted: { type: mongoose.Schema.Types.Mixed, default: false },
  },
  { versionKey: false }
);

const celltemplate = new Schema(
  {
    templateName: { type: String, required: true },
    manufacturer: String,
    nomVoltage: { type: Number, required: true }, //in V
    nomCurrent: { type: Number, required: false }, //in A
    nomCapacity: { type: Number, required: true }, //in mAh
    maxVoltage: { type: Number, required: false }, //in V
    minVoltage: { type: Number, required: false }, //inV
    formFactor: String,
    cellChemistry: String,
    type: String, //Pouch,Cyclindrical,Prismatic
  },
  { versionKey: false }
);

const cell = new Schema(
  {
    cellName: { type: String },
    manufacturer: { type: String },
    batchNo: { type: String },
    type: { type: String },
    formFactor: { type: String },
    cellChemistry: { type: String },
    nomVolt: { type: Number },
    nomCap: { type: Number },
    nomCurr: { type: Number },
    maxVolt: { type: Number },
    minVolt: { type: Number },
    assignedUsers: {
      type: [accessSchema],
      default: [],
    },
    isMarkedForDeleted: { type: mongoose.Schema.Types.Mixed, default: false },
    createdOn: { type: Date, default: Date.now },
    testsPerformed: {
      type: [{ testConfigChannelId: mongoose.Schema.Types.ObjectId }],
      default: [],
    },
  },
  { versionKey: false }
);

const chamberapi = new Schema(
  {
    apiKey: {
      type: String,
      unique: true,
      required: true,
    },
    assignedUser: {
      type: Schema.Types.ObjectId,
      unique: false,
      required: true,
    },
    assignedChamber: {
      type: accessSchema,
      unique: false,
      required: false,
    },
    createdOn: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false }
);

chamberapi.index({ apiKey: 1 }, { background: true });

const USER = mongoose.model("USER", user);
const TestChamber = mongoose.model("TestChamber", testchamber);
const CellTemplate = mongoose.model("CellTemplate", celltemplate);
const Cell = mongoose.model("Cell", cell);
const ChamberAPI = mongoose.model("chamberAPI", chamberapi);
const Test = mongoose.model("Test", test);

module.exports = { USER, TestChamber, CellTemplate, Cell, ChamberAPI, Test };
