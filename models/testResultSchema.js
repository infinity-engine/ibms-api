const { mongoose, mongo } = require("mongoose");
const { Schema } = mongoose;

const measuredParametersSchema = new Schema(
  {
    current: [Number],
    voltage: [Number],
    chamberTemp: [Number],
    chamberHum: [Number],
    cellTemp: [[Number]],
    time:[Number]
  },
  { versionKey: false }
);
const rowInfoSchema = new Schema(
  {
    rowNo: Number,
    measuredParameters: measuredParametersSchema,
    derivedParameters: { type: mongoose.Schema.Types.Mixed },
    isClosed: { type: Boolean, default: false },
  },
  { versionKey: false }
);
const channelSchema = new Schema(
  {
    rows: [rowInfoSchema],
    channelNo: Number,
    isClosed: { type: Boolean, default: false },
  },
  { versionKey: false }
);
const testResultSchema = new Schema(
  {
    channels: [channelSchema]
  },
  { versionKey: false }
);
const RowInfo = mongoose.model('RowInfo',rowInfoSchema);
const MeasuredParameters = mongoose.model('MeasuredParameters',measuredParametersSchema);
const Channel = mongoose.model('Channel',channelSchema);
module.exports = {RowInfo,MeasuredParameters,Channel,testResultSchema};
