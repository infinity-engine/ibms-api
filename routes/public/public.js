const express = require("express");
const tapData = require("../../middleware/log");
const publicRoute = express.Router();
const isAnyExperimentRouter = require("./test-chamber/is-any-experiment");
const getDriveCycleRoute = require("./test-chamber/get-drive-cycle");

publicRoute.use("/test-chamber/is-any-experiment", isAnyExperimentRouter);
publicRoute.use("/test-chamber/get-drive-cycle",getDriveCycleRoute);
module.exports = publicRoute;
