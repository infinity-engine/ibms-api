const { mongoose } = require("mongoose");
const { Schema } = mongoose;
const measurementSchema = new Schema(
  {
    type: { time: [Number], value: [Number] },
    default: { time: [], value: [] },
  },
  { versionKey: false }
);
const cellTempMeasurementSchema = new Schema(
  {
    type: { time: [Number], value: [[Number]] },
    default: { time: [], value: [] },
  },
  { versionKey: false }
);
const measuredParametersSchema = new Schema(
  {
    current: measurementSchema,
    voltage: measurementSchema,
    chamberTemp: measurementSchema,
    chamberHum: measurementSchema,
    cellTemp: cellTempMeasurementSchema,
  },
  { versionKey: false }
);

const rowSchema = new Schema(
  {
    type: [
      {
        rowNo: Number,
        measuredParameters: measuredParametersSchema,
        derivedParameters: {type:mongoose.Schema.Types.Mixed},
      },
    ],
  },
  { versionKey: false }
);
const testResultSchema = new Schema(
  {
    type: { channels: [{ rows: rowSchema, channelNo: Number }] },
  },
  { versionKey: false }
);

module.exports = testResultSchema;
