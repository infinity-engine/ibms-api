const express = require("express");
const { default: mongoose } = require("mongoose");
const getDriveCycleRoute = express.Router();
const checkAccess = require("../../../middleware/checkAccess/checkAccess");
const { TestChamber, Test } = require("../../../models/schema");
const { stringify } = require("csv-stringify/sync");

getDriveCycleRoute.get("/", checkAccess, async (req, res) => {
  // /get-drive-cycle?apiKey=add&testId=id&channelNo=1&rowNo=1
  try {
    //console.log(req.query);
    const testId = mongoose.Types.ObjectId(req.query.testId);

    const result = await Test.aggregate([
      { $match: { _id: testId } },
      {
        $project: {
          _id: 1,
          testConfig: 1,
        },
      },
    ]);
    const testConfig = result[0].testConfig;
    const driveCycle = getDriveCycle(
      testConfig,
      req.query.channelNo,
      req.query.rowNo
    );

    if (driveCycle) {
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="driveCycle.csv"'
      );
      res.setHeader("Content-Type", "text/csv");

      res.send(convertIntoCSV(driveCycle));
    } else {
      res.json(null);
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});
function convertIntoCSV(driveCycle) {
  const csvData = driveCycle.time.map((time, index) => {
    if (driveCycle.current !== undefined) {
      return [time, driveCycle.current[index]];
    } else if (driveCycle.power !== undefined) {
      return [time, driveCycle.power[index]];
    }
  });
  const header = [];
  header.push("time");
  if (driveCycle.current !== undefined) {
    header.push("current");
  } else if (driveCycle.power !== undefined) {
    header.push("power");
  }
  const output = stringify(csvData, {
    header: true,
    columns: header,
    eof: false,
  });
  return output;
}
function getDriveCycle(testConfig, channelNo, rowNo) {
  if (!testConfig) {
    return null;
  }
  if (channelNo > testConfig.channels.length) {
    return null;
  }
  const channel = testConfig.channels[channelNo - 1];
  if (rowNo > channel.testFormats.length) {
    return null;
  }
  const testFormat = channel.testFormats[rowNo - 1];
  if (testFormat.value != 3) {
    // value 3 refers to Run X type of experiment
    return null;
  }
  return testFormat.fields[1].value;
}
module.exports = getDriveCycleRoute;
