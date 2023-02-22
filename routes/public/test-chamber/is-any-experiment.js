const express = require("express");
const { default: mongoose } = require("mongoose");
const isAnyExperimentRouter = express.Router();
const checkAccess = require("../../../middleware/checkAccess/checkAccess");
const { TestChamber } = require("../../../models/schema");


isAnyExperimentRouter.get("/", checkAccess, async (req, res) => {
  try {
    console.log(req.assignedChamberId);
    const result = await TestChamber.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(req.assignedChamberId) } },
      { $unwind: "$testsPerformed" },
      {
        $match: {
          "testsPerformed.status": "Scheduled",
        },
      },
      {
        $sort: {
          "testsPerformed.testScheduleDate": 1,
        },
      },
      {
        $group: {
          _id: "$_id",
          testConfig: {
            $first: "$testsPerformed.testConfig",
          },
        },
      },
    ]);
    console.log(result);
    const testConfig = result[0]?.testConfig;
    res.json("ok")
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

module.exports = isAnyExperimentRouter;
