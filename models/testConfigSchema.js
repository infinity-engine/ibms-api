const { mongoose } = require("mongoose");
const { Schema } = mongoose;

const selectFieldSchema = new mongoose.Schema({
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  type: { type: String, required: true },
  id: { type: Number, required: true },
  options: { type: [String], required: true },
  visibility: { type: Boolean, required: true },
  template_width: { type: Number, required: true },
});

const textFieldSchema = new mongoose.Schema({
  type: { type: String, default: "text" },
  id: { type: Number, required: true },
  value: {
    type: String,
    required: true,
    enum: ["at", "for", "Run", "until", "volt."],
  },
  visibility: { type: Boolean, required: true },
  template_width: { type: Number, required: true },
});

const inputFieldSchema = new mongoose.Schema({
  type: { type: String, default: "input" },
  id: { type: Number, required: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  visibility: { type: Boolean, required: true },
  template_width: { type: Number, required: true },
});

const driveCycleSchema = new Schema({
  time: {
    type: [Number],
    required: true,
  },
  current: {
    type: [Number],
    required: false,
  },
  power: {
    type: [Number],
    required: false,
  },
});

const fileFieldSchema = new mongoose.Schema({
  type: { type: String, default: "file" },
  id: { type: Number, required: true },
  value: { type: driveCycleSchema, required: true },
  visibility: { type: Boolean, required: true },
  template_width: { type: Number, required: true },
});

const testFormatSchema = new mongoose.Schema({
  fields: [
    {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      discriminatorKey: "type",
      discriminatorMapping: {
        select: selectFieldSchema,
        text: textFieldSchema,
        input: inputFieldSchema,
        file: fileFieldSchema,
      },
    },
  ],
  name: { type: String, required: true },
  value: { type: Number, required: true },
  multiplier: { type: Number, required: true },
  ambTemp: { type: Number, required: true },
});

const channelFieldsSchema = new Schema({
  channelNumber: {
    type: Number,
    required: true,
  },
  cellID: {
    type: mongoose.Schema.Types.ObjectId,
    required: false, //gotta change it later
  },
  testFormats: [testFormatSchema],
  overallRowMultiplier: {
    type: Number,
    required: true,
  },
});

const payLoadSchema = new mongoose.Schema({
  channels: [channelFieldsSchema],
  isConAmTe: {
    type: Boolean,
    required: false,
  },
  ambTemp: {
    type: Number,
    required: false,
  },
});

module.exports = { payLoadSchema };
