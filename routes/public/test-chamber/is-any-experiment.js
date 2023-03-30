const express = require("express");
const { default: mongoose } = require("mongoose");
const isAnyExperimentRouter = express.Router();
const checkAccess = require("../../../middleware/checkAccess/checkAccess");
const { TestChamber, Test } = require("../../../models/schema");

isAnyExperimentRouter.get("/", checkAccess, async (req, res) => {
  try {
    //console.log(req.assignedChamberId);
    //req.assignedTestIds
    const currentDate = new Date();
    const result = await Test.aggregate([
      { $match: { _id: { $in: req.assignedTestIds } } },
      {
        $match: {
          status: "Scheduled",
        },
      },
      {
        $project: {
          _id: 1,
          testConfig: 1,
          testScheduleDate: 1,
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
    if (result.length > 0) {
      const testConfig = result[0].testConfig;
      testConfig.testId = result[0]._id;
      //tests are exported as queue first schedule first out
      res.json(getOutput(testConfig));
    } else {
      res.json(null);
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

function getOutput(testConfig) {
  if (testConfig) {
    const testConfigOut = { channels: [], testId: testConfig.testId };
    for (let channel of testConfig.channels) {
      const config = {};

      const channelInfo = {
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
      config.info = correctInfo(channelInfo);
      testConfigOut.channels.push(config);
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
    step.multiplier = testFormat.multiplier;
    step.ambTemp = testFormat.ambTemp;
    steps.push(correctStep(step));
  }
}
function getStep_1(testFormat, step) {
  const fields = testFormat.fields;
  let field = fields[0];
  if (field.id == 1) {
    if (field.value == "Charge") {
      // insert the logic for unit conversion from C/W to A
      step.mode = 1;
    } else if (field.value == "Discharge") {
      step.mode = 2;
    } else if (field.value == "Hold") {
      step.mode = 9;
      step.holdVolt = fields[2].value;
    } else if (field.value == "Rest") {
      step.mode = 8;
    }

    field = fields[3];
    if (step.mode == 1 || step.mode == 2) {
      //logic for field 2 -input on unit of filed 3
      if (field.value == "C") {
        //insert logic from converting C rate to current Rate
      } else if (field.value == "A") {
        step.currentRate = fields[2].value;
      } else if (field.value == "W") {
        //insert logic here
        //step.powVal = ??
      }
    }
  }

  //time logic
  field = fields[6];
  if (field.visibility === true) {
    let timeLimit = fields[5].value;
    if (field.value == "hours.") {
      step.timeLimit = timeLimit * 3600;
    } else if (field.value == "minutes.") {
      step.timeLimit = timeLimit * 60;
    } else if (field.value == "seconds.") {
      step.timeLimit = timeLimit;
    }
  }
}
function getStep_2(testFormat, step) {
  const fields = testFormat.fields;
  let field = fields[0];
  if (field.id == 1) {
    if (field.value == "Charge") {
      // insert the logic for unit conversion from C/W to A
      step.mode = 1;
    } else if (field.value == "Discharge") {
      step.mode = 2;
    }
  }

  field = fields[3];
  if (field.value == "C") {
    //insert logic from converting C rate to current Rate
    //step.currentRate = ??
  } else if (field.value == "A") {
    step.currentRate = fields[2].value;
  } else if (field.value == "W") {
    //insert logic here
    //step.powVal = ??
  }
  field = fields[5];
  step.voltLimit = field.value;
}

function getStep_3(testFormat, step) {
  step.mode = 7;
  const fields = testFormat.fields;
  let field = fields[4];
  let timeLimit = fields[3].value;
  step.total_n_samples = fields[1].value.time.length;
  if (field.value == "hours.") {
    step.timeLimit = timeLimit * 3600;
  } else if (field.value == "minutes.") {
    step.timeLimit = timeLimit * 60;
  } else if (field.value == "seconds.") {
    step.timeLimit = timeLimit;
  }
}
function correctStep(step) {
  const step_ = {
    mode: null,
    currentRate: null,
    resVal: null,
    powVal: null,
    timeLimit: null,
    voltLimit: null,
    total_n_samples: null,
    multiplier: 1,
    ambTemp: 25,
    holdVolt: null,
  };
  const modifiedStep = { ...step_, ...step };
  return modifiedStep;
}
function correctInfo(channelInfo) {
  const channelInfoDefault = {
    channelNumber: null,
    testId: null,
    overallMultiplier: null,
    isConAmTe: null,
    ambTemp: null,
    noOfSubExp: null,
  };
  return { ...channelInfoDefault, ...channelInfo };
}
module.exports = isAnyExperimentRouter;
