const express = require("express");
const { default: mongoose } = require("mongoose");
const isAnyExperimentRouter = express.Router();
const checkAccess = require("../../../middleware/checkAccess/checkAccess");
const { TestChamber } = require("../../../models/schema");

isAnyExperimentRouter.get("/", checkAccess, async (req, res) => {
  try {
    //console.log(req.assignedChamberId);
    const currentDate = new Date();
    const result = await TestChamber.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(req.assignedChamberId) } },
      { $unwind: "$testsPerformed" },
      {
        $match: {
          "testsPerformed.status": "Scheduled",
        },
      },
      {
        $group: {
          _id: "$testsPerformed._id",
          testConfig: {
            $first: "$testsPerformed.testConfig",
          },
          testScheduleDate: {
            $first: "$testsPerformed.testScheduleDate",
          },
        },
      },
      {
        $match: { testScheduleDate: { $lte: currentDate } },
      },
      {
        $sort: {
          testScheduleDate: 1,
        },
      },
    ]);
    const testConfig = result[0].testConfig; //tests are exported as que first schedule first out

    if (testConfig) {
      const testConfigOut = [];
      for (let channel of testConfig.channels) {
        const channelInfoDefault = {
          channelNumber: null,
          testId: null,
          overallMultiplier: null,
          isConAmTe: null,
          ambTemp: null,
          noOfSubExp: null,
        };

        const channelInfo = {
          ...channelInfoDefault,
          channelNumber: channel.channelNumber,
          testId: `${testConfig._id.toString()}_${channel.channelNumber}`,
          overallMultiplier: channel.overallRowMultiplier,
          isConAmTe: testConfig.isConAmTe,
          ambTemp: testConfig.ambTemp,
          noOfSubExp: channel.testFormats.length,
        };
        const steps = [];
        for (let testFormat of channel.testFormats){
          const step = {};
          switch(testFormat.value){
            case 1:
              //Do this for this long
              break;
            case 2:
              //Do this until this happen
              break;
            case 3:
              //Run X
              break;
          }
          steps.push(step)
        }

        steps.push(channelInfo);
        testConfigOut.push(steps);
      }
      res.json(testConfigOut);
    } else {
      res.json(null);
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

module.exports = isAnyExperimentRouter;
