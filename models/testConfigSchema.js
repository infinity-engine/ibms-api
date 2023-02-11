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

const fileFieldSchema = new mongoose.Schema({
  type: { type: String, default: "file" },
  id: { type: Number, required: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  visibility: { type: Boolean, required: true },
  template_width: { type: Number, required: true },
});

const fieldsSchema = new mongoose.Schema({
  id: { type: Number, required: true },
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
});

const testFormatSchema = new mongoose.Schema({
  children: [fieldsSchema],
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
    type: {_id:mongoose.Schema.Types.ObjectId,name:String},
    required: true,
  },
  testFormats: [testFormatSchema],
  overallRowMultiplier: {
    type: Number,
    required: true,
  },
});

const payLoadSchema = new mongoose.Schema({
  channels: [channelFieldsSchema],
  testId: {
    type: Number,
    required: false,
  },
  testName: {
    type: String,
    required: false,
  },
  testDesc: {
    type: String,
    required: false,
  },
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
