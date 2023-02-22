const express = require("express");
const tapData = require("../../middleware/log");
const publicRoute = express.Router();
const isAnyExperimentRouter = require("./test-chamber/is-any-experiment");

publicRoute.use("/test-chamber/is-any-experiment", isAnyExperimentRouter);

module.exports = publicRoute;
