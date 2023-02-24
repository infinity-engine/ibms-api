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
    const testConfig = result[0].testConfig;
    //tests are exported as queue first schedule first out
    res.json(testConfig);
    //console.log(getOutput(testConfig));
    //getOutput(testConfig);
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

async function getOutput(testConfig) {
  if (testConfig) {
    const testConfigOut = { channels: [] };
    for (let channel of testConfig.channels) {
      const config = {};
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
      getSteps(channel.testFormats, steps);
      config.steps = steps;
      config.info = channelInfo;
      testConfigOut.channels.push(config);
      console.log(config);
    }
    return testConfigOut;
  } else {
    return null;
  }
}

function getSteps(testFormats, steps) {
  for (let testFormat of testFormats) {
    const step = {};
    switch (testFormat.value) {
      case 1:
        //Do this for this long
        getStep_1(testFormat, step);
        break;
      case 2:
        //Do this until this happen
        getStep_2(testFormat, step);
        break;
      case 3:
        //Run X
        getStep_3(testFormat, step);
        break;
    }
    steps.push(step);
  }
}
function getStep_1(testFormat, step) {
  step.multiplier = testFormat.multiplier ? testFormat.multiplier : 1;
  step.ambTemp = testFormat.ambTemp ? testFormat.ambTemp : null;
  const fields = testFormat.fields;
  let field = fields[0];
  if (field.id == 1) {
    if (field.value == "Charge") {
      // insert the logic for unit conversion from C/W to A
      step.mode = 1;
      step.currentRate = fields[2].value;
    } else if (field.value == "Discharge") {
      step.mode = 2;
      step.currentRate = fields[2].value;
    } else if (field.value == "Hold") {
      step.mode = 9;
      step.holdVolt = fields[2].value;
    } else if (field.value == "Rest") {
      step.mode = 8;
    }
  }

  field = fields[6];
  let timeLimit = fields[5].value;
  if (field.value == "hours.") {
    step.timeLimit = timeLimit * 3600;
  } else if (field.value == "minutes.") {
    step.timeLimit = timeLimit * 60;
  } else if (field.value == "seconds.") {
    step.timeLimit = timeLimit;
  }
}
function getStep_2(testFormat, step) {}
function getStep_3(testFormat, step) {}
module.exports = isAnyExperimentRouter;
