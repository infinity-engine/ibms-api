const express = require("express");
const cellTemplatesRoute = express.Router();
const { CellTemplate } = require("../../../models/schema");

cellTemplatesRoute.get("/", async (req, res) => {
  try {
    const templates = await CellTemplate.find();
    res.json(templates);
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

module.exports = cellTemplatesRoute;
