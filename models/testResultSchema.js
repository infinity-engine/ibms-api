const { mongoose, mongo } = require("mongoose");
const { Schema } = mongoose;

const sensorObj = new Schema(
  {
    sensorId: Number,
    values: [Number],
  },
  { versionKey: false }
);
const measuredParametersSchema = new Schema(
  {
    current: [Number],
    voltage: [Number],
    chamberTemp: [Number],
    chamberHum: [Number],
    cellTemp: [sensorObj],
    time: [Number],
  },
  { versionKey: false }
);

const rowInfoSchema = new Schema(
  {
    rowNo: Number,
    measuredParameters: measuredParametersSchema,
    derivedParameters: { type: mongoose.Schema.Types.Mixed },
    rowStartDate: { type: Date, default: Date.now },
    rowEndDate: Date,
    status: {
      type: String,
      enum: ["Completed", "Running", "Scheduled", "Stopped", "Paused"],
      default: "Running",
    },
    currentMultiplierIndex: {
      type: Number,
      default: 1,
    },
    multiplier: Number,
  },
  { versionKey: false }
);
const channelSchema = new Schema(
  {
    rows: [rowInfoSchema],
    channelNo: Number,
    status: {
      type: String,
      enum: ["Completed", "Running", "Scheduled", "Stopped", "Paused"],
      default: "Running",
    },
    chStartDate: { type: Date, default: Date.now },
    chEndDate: Date,
    currentMultiplierIndex: {
      type: Number,
      default: 1,
    },
    multiplier: Number,
  },
  { versionKey: false }
);
const testResultSchema = new Schema(
  {
    channels: { type: [channelSchema], default: [] },
  },
  { versionKey: false }
);

const RowInfo = mongoose.model("RowInfo", rowInfoSchema);
const MeasuredParameters = mongoose.model(
  "MeasuredParameters",
  measuredParametersSchema
);
const Channel = mongoose.model("Channel", channelSchema);
module.exports = { RowInfo, MeasuredParameters, Channel, testResultSchema };
