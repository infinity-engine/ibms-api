const express = require("express");
const tapData = require("../../middleware/log");
const publicRoute = express.Router();
const isAnyExperimentRouter = require("./test-chamber/is-any-experiment");
const getDriveCycleRoute = require("./test-chamber/get-drive-cycle");
const feedExpResultRoute = require("./test-chamber/feed-exp-result");

publicRoute.use("/test-chamber/is-any-experiment", isAnyExperimentRouter);
publicRoute.use("/test-chamber/get-drive-cycle", getDriveCycleRoute);
publicRoute.use("/test-chamber/feed-exp-result", feedExpResultRoute);

module.exports = publicRoute;
