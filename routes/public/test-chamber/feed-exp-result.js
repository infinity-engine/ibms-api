const express = require("express");
const { default: mongoose } = require("mongoose");
const checkAccess = require("../../../middleware/checkAccess/checkAccess");
const { TestChamber, Test } = require("../../../models/schema");
const feedExpResultRoute = express.Router();

const {
  RowInfo,
  MeasuredParameters,
  Channel,
} = require("../../../models/testResultSchema");

feedExpResultRoute.use(checkAccess);

function checkIfExpRunning(req, res, next) {
  try {
    Test.aggregate(
      [
        {
          $match: {
            _id: mongoose.Types.ObjectId(req.query.testId),
          },
        },
        {
          $project: {
            _id: 1,
            status: 1,
          },
        },
      ],
      (err, result) => {
        if (err) {
          throw new Error("Status Check Failed");
        } else {
          if (result[0]?.status === "Running") {
            next();
          } else {
            res
              .status(500)
              .json({ status: "failed", msg: "exp. status must be Running!." });
          }
        }
      }
    );
  } catch (err) {
    console.log(err);
    res.status(500).json({ status: "failed", msg: "Exp status check failed." });
  }
}

feedExpResultRoute.get("/set-status", async (req, res) => {
  if (
    await setStatusExp(
      mongoose.Types.ObjectId(req.query.testId),
      req.query.status,
      +req.query.channel,
      +req.query.row
    )
  ) {
    res.json({ status: "ok" });
  } else {
    res.status(500).json({ status: "failed" });
  }
});

async function setStatusExp(
  testId,
  status,
  channelNo = undefined,
  rowNo = undefined
) {
  //will set status for all channel, and their last rows
  //when ever a new row or channel is added to the testResult
  //by default it is set to 'Running'
  //hence you should not be using this function to change status of row/channel to 'Running'
  try {
    const [testInfo] = await Test.aggregate([
      { $match: { _id: testId } },
      {
        $project: {
          _id: 1,
          status: 1,
          testScheduleDate: 1,
          testStartDate: 1,
          testEndDate: 1,
          testResult: 1,
        },
      },
      {
        $project: {
          _id: 1,
          status: 1,
          testScheduleDate: 1,
          testStartDate: 1,
          testEndDate: 1,
          "testResult.channels.channelNo": 1,
          "testResult.channels.status": 1,
          "testResult.channels.rows.rowNo": 1,
          "testResult.channels.rows.status": 1,
        },
      },
    ]);
    if (!testInfo) {
      return false;
    }
    if (testInfo.status === "Completed" || testInfo.status === "Stopped") {
      return false;
    }
    //changes are allowed only if test isn't completed and stopped

    //update the status
    let update = {
      status: status,
      testStartDate: Date.now(),
      testEndDate: Date.now(),
      "testResult.channels.$[channel].status": status,
      "testResult.channels.$[channel].chEndDate": Date.now(),
      "testResult.channels.$[channel].rows.$[row].status": status,
      "testResult.channels.$[channel].rows.$[row].rowEndDate": Date.now(),
    };
    let filters = [];

    if (rowNo && channelNo) {
      //if a specific rowNo and channelNo is given, that means your'e asked to change the status of the
      // particular row of a channel
      delete update["status"];
      delete update["testStartDate"];
      delete update["testEndDate"];
      delete update["testResult.channels.$[channel].status"];
      delete update["testResult.channels.$[channel].chEndDate"];
      if (status !== "Completed") {
        delete update["testResult.channels.$[channel].rows.$[row].rowEndDate"];
      }

      filters.push(
        {
          "channel.channelNo": channelNo,
          "channel.status": { $nin: ["Completed", "Stopped"] },
        },
        { "row.rowNo": rowNo, "row.status": { $nin: ["Completed", "Stopped"] } }
      );
    } else if (channelNo) {
      //if only channelNo is given the last row as well as the channel will be updated,
      //on the assumption that, for a test to continue on the next row, the previous row has to be completed,
      //also, row will only be formed when it is in running status, hence there will be no row in scheduled status

      delete update["status"];
      delete update["testStartDate"];
      delete update["testEndDate"];
      if (!(status === "Completed" || status === "Stopped")) {
        //only completed,and stopped
        delete update["testResult.channels.$[channel].chEndDate"];
        delete update["testResult.channels.$[channel].rows.$[row].rowEndDate"];
      }
      filters.push(
        {
          "channel.channelNo": channelNo,
          "channel.status": { $nin: ["Completed", "Stopped"] },
        },
        { "row.status": { $nin: ["Completed", "Stopped"] } }
      );
    } else {
      //update all, all the channel and last-rows within
      if (
        status === "Running" &&
        Date.now() > testInfo.testScheduleDate &&
        testInfo.status !== "Running"
      ) {
        //only when schedule date is past to current date
        delete update["testEndDate"];
      } else if (status === "Stopped" || status === "Completed") {
        delete update["testStartDate"];
      } else if (status === "Paused") {
        delete update["testEndDate"];
        delete update["testStartDate"];
      } else {
        return false;
      }

      filters.push(
        {
          "channel.status": { $nin: ["Completed", "Stopped"] },
        },
        { "row.status": { $nin: ["Completed", "Stopped"] } }
      );
    }
    let res = await Test.updateOne(
      { _id: testId },
      { $set: update },
      { arrayFilters: filters }
    );
    //console.log(res);
    if (!res.acknowledged || res.modifiedCount < 1) {
      return false;
    }
    return true;
  } catch (err) {
    console.log(err);
    return false;
  }
}

feedExpResultRoute.get("/updated-upto", async (req, res) => {
  //give a update on how much data are already updated to the cloud,
  //so the testchamber can feed data next to that.
  //{chNo:n,isChCom:Boolean,RowNo:n,isRowCom:Boolean,lastTime:RelativeTime}
  try {
    res.json(
      await getLastUpdateStatus(
        mongoose.Types.ObjectId(req.query.testId),
        +req.query.channel
      )
    );
  } catch (err) {
    console.log(err);
    res
      .status(500)
      .json({ status: "failed", msg: "update upto status fetch failed" });
  }
});

feedExpResultRoute.post(
  "/insert-measurement",
  checkIfExpRunning,
  async (req, res) => {
    try {
      const channel = +req.query.channel;
      const testId = mongoose.Types.ObjectId(req.query.testId);
      const status = await getLastUpdateStatus(testId, channel);
      if (status === null) {
        const newRow = await formNewRow(testId, channel, 1, req.body);
        const chMultiplier = await getChMultiplier(testId, channel);
        const newChannel = new Channel({
          channelNo: channel,
          rows: [newRow],
          multiplier: chMultiplier,
        });
        //console.log(newRow, newChannel);
        Test.updateOne(
          { _id: testId },
          {
            $push: {
              "testResult.channels": newChannel,
            },
          },
          (err, result) => {
            if (err) {
              throw new Error("new row creation failed");
            } else {
              //console.log(result);
              res.json({ status: "ok" });
            }
          }
        );
      } else if (status.statusCh !== "Running") {
        res.json({ status: "failed", msg: "channel's status must be running" });
      } else if (status.statusRow === "Completed") {
        //open new Row for insreting measurement
        const newRow = await formNewRow(
          testId,
          channel,
          status.rowNo + 1,
          req.body
        );
        Test.updateOne(
          { _id: testId },
          {
            $push: {
              "testResult.channels.$[channel].rows": newRow,
            },
          },
          {
            arrayFilters: [{ "channel.channelNo": channel }],
          },
          (err, resutl) => {
            if (err) {
              throw new Error("new row creation failed");
            } else {
              res.json({ status: "ok" });
            }
          }
        );
      } else {
        const identity = {
          testId: testId,
          channelNo: channel,
          rowNo: status.rowNo,
        };
        insertMeasurement(identity, req.body)
          .then((results) => {
            //console.log(results);
            res.json({ status: "ok" });
          })
          .catch((err) => {
            console.log(err);
            throw new Error("insert measurement failed");
          });
      }
    } catch (err) {
      console.log(err);
      res.status(500).json({ status: "failed", msg: "Error" });
    }
  }
);

feedExpResultRoute.get("/increment-multiplier-index", async (req, res) => {
  if (
    await incrementMultiplier(
      mongoose.Types.ObjectId(req.query.testId),
      +req.query.channel,
      +req.query.row
    )
  ) {
    res.json({ status: "ok" });
  } else {
    res.status(500).json({ status: "failed" });
  }
});

async function incrementMultiplier(
  testId,
  channelNo = undefined,
  rowNo = undefined
) {
  //increment the current multiplier of a  channel or on a row
  try {
    let update, filters;
    const currenStatus = await getLastUpdateStatus(testId, channelNo);
    if (!currenStatus) {
      return false;
    }
    if (channelNo && rowNo) {
      update = {
        $inc: {
          "testResult.channels.$[channel].rows.$[row].currentMultiplierIndex": 1,
        },
      };
      filters = [
        {
          "channel.channelNo": channelNo,
          "channel.status": { $nin: ["Completed", "Stopped"] },
        },
        {
          "row.rowNo": rowNo,
          "row.status": { $nin: ["Completed", "Stopped"] },
          "row.currentMultiplierIndex": { $lt: currenStatus.rowMultiplier },
        },
      ];
    } else if (channelNo) {
      update = {
        $inc: {
          "testResult.channels.$[channel].currentMultiplierIndex": 1,
        },
      };
      filters = [
        {
          "channel.channelNo": channelNo,
          "channel.status": { $nin: ["Completed", "Stopped"] },
          "channel.currentMultiplierIndex": { $lt: currenStatus.chMultiplier },
        },
      ];
    } else {
      return false;
    }
    const res = await Test.updateOne({ _id: testId }, update, {
      arrayFilters: filters,
    });
    console.log(res);
    if (!res.acknowledged || res.modifiedCount < 1) {
      return false;
    }
    return true;
  } catch (err) {
    console.log(err);
    return false;
  }
}

async function formNewRow(testId, channelNo, rowNo, measurements) {
  const rowMultiplier = await getRowMultiplier(testId, channelNo, rowNo);
  const { current, voltage, chamberTemp, chamberHum, cellTemp, time } =
    measurements;
  const measurement = new MeasuredParameters({
    current: current,
    voltage: voltage,
    chamberTemp: chamberTemp,
    chamberHum: chamberHum,
    cellTemp: cellTemp,
    time: time,
  });
  const row = new RowInfo({
    rowNo: rowNo,
    measuredParameters: measurement,
    multiplier: rowMultiplier,
  });
  return row;
}

async function getRowMultiplier(testId, channelNo, rowNo) {
  try {
    const res = await Test.aggregate([
      { $match: { _id: testId } },
      {
        $project: {
          _id: 1,
          testConfig: 1,
        },
      },
    ]);
    const testConfig = res[0].testConfig;
    if (!testConfig) {
      throw new Error("testconfig not found");
    }
    const channel = testConfig.channels.find(
      (ch) => ch.channelNumber == channelNo
    );
    const row = channel.testFormats[rowNo - 1];
    return row.multiplier;
  } catch (err) {
    console.log(err);
    return 1;
  }
}

async function getChMultiplier(testId, channelNo) {
  try {
    const res = await Test.aggregate([
      { $match: { _id: testId } },
      {
        $project: {
          _id: 1,
          testConfig: 1,
        },
      },
    ]);
    const testConfig = res[0].testConfig;
    if (!testConfig) {
      throw new Error("testconfig not found");
    }
    const channel = testConfig.channels.find(
      (ch) => ch.channelNumber == channelNo
    );
    return channel.overallRowMultiplier;
  } catch (err) {
    console.log(err);
    return 1;
  }
}

function insertMeasurement(identity, measurements) {
  const updates = {};
  if (measurements.voltage) {
    updates[
      "testResult.channels.$[channel].rows.$[row].measuredParameters.voltage"
    ] = { $each: measurements.voltage };
  }
  if (measurements.current) {
    updates[
      "testResult.channels.$[channel].rows.$[row].measuredParameters.current"
    ] = { $each: measurements.current };
  }
  if (measurements.chamberTemp) {
    updates[
      "testResult.channels.$[channel].rows.$[row].measuredParameters.chamberTemp"
    ] = { $each: measurements.chamberTemp };
  }
  if (measurements.chamberHum) {
    updates[
      "testResult.channels.$[channel].rows.$[row].measuredParameters.chamberHum"
    ] = { $each: measurements.chamberHum };
  }
  if (measurements.time) {
    updates[
      "testResult.channels.$[channel].rows.$[row].measuredParameters.time"
    ] = { $each: measurements.time };
  }
  const updateCellTempOps = measurements.cellTemp.map((tempObj) => ({
    updateOne: {
      filter: { _id: identity.testId },
      update: {
        $push: {
          "testResult.channels.$[channel].rows.$[row].measuredParameters.cellTemp.$[sensor].values":
            { $each: tempObj.values },
        },
      },
      arrayFilters: [
        { "channel.channelNo": identity.channelNo },
        { "row.rowNo": identity.rowNo },
        { "sensor.sensorId": tempObj.sensorId },
      ],
    },
  }));

  const restUpdateOps = {
    updateOne: {
      filter: { _id: identity.testId },
      update: {
        $push: updates,
      },
      arrayFilters: [
        { "channel.channelNo": identity.channelNo },
        { "row.rowNo": identity.rowNo },
      ],
    },
  };
  return Test.bulkWrite([...updateCellTempOps, restUpdateOps]);
}

async function getLastUpdateStatus(testId, channel) {
  //{chNo:n,isChCom:Boolean,rowNo:n,isRowCom:Boolean,lastTime:RelativeTime}
  const results = await Test.aggregate([
    { $match: { _id: testId } },
    {
      $project: {
        _id: 1,
        testResult: 1,
      },
    },
  ]);
  const testResult = results[0].testResult;
  let defaultRes = {
    chNo: undefined,
    statusCh: undefined,
    chMultiplierIndex: undefined,
    chMultiplier: undefined,
    rowNo: undefined,
    statusRow: undefined,
    rowMultiplierIndex: undefined,
    rowMultiplier: undefined,
    lastTime: 0,
  };
  if (testResult) {
    const ch = testResult.channels.find((val) => val.channelNo == channel);
    if (!ch) {
      return null;
    }
    const row = ch.rows[ch.rows.length - 1];
    defaultRes.chNo = channel;
    defaultRes.statusCh = ch.status;
    defaultRes.chMultiplierIndex = ch.currentMultiplierIndex;
    defaultRes.chMultiplier = ch.multiplier;
    defaultRes.rowNo = row.rowNo;
    defaultRes.statusRow = row.status;
    defaultRes.rowMultiplierIndex = row.currentMultiplierIndex;
    defaultRes.rowMultiplier = row.multiplier;
    defaultRes.lastTime =
      row.measuredParameters.time[row.measuredParameters.time.length - 1];
  } else {
    return null;
  }
  //console.log(defaultRes);
  return defaultRes;
}

module.exports = feedExpResultRoute;
