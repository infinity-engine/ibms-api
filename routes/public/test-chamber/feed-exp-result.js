const express = require("express");
const { default: mongoose } = require("mongoose");
const checkAccess = require("../../../middleware/checkAccess/checkAccess");
const { Test } = require("../../../models/schema");
const feedExpResultRoute = express.Router();
const {
  RowInfo,
  Channel,
  CycleInfo,
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
          "testResult.channels.cycles.rows.measuredParameters": 0,
          "testResult.channels.cycles.rows.derivedParameters": 0,
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
    // do not need to have any filter for cycle
    // as all other rows for previous cycles of last cycles will have to be status completed,
    // so that will alredy be filtered out by row filters
    let update = {
      status: status,
      testStartDate: Date.now(),
      testEndDate: Date.now(),
      "testResult.channels.$[channel].status": status,
      "testResult.channels.$[channel].chEndDate": Date.now(),
      "testResult.channels.$[channel].cycles.$[].rows.$[row].status": status,
      "testResult.channels.$[channel].cycles.$[].rows.$[row].rowEndDate":
        Date.now(),
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
        delete update[
          "testResult.channels.$[channel].cycles.$[].rows.$[row].rowEndDate."
        ];
      }

      filters.push(
        {
          "channel.channelNo": channelNo,
          "channel.status": { $nin: ["Completed", "Stopped"] },
        },
        {
          "row.rowNo": rowNo,
          "row.status": { $nin: ["Completed", "Stopped"] },
        }
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
        delete update[
          "testResult.channels.$[channel].cycles.$[].rows.$[row].rowEndDate"
        ];
      }
      filters.push(
        {
          "channel.channelNo": channelNo,
          "channel.status": { $nin: ["Completed", "Stopped"] },
        },
        { "row.status": { $nin: ["Completed", "Stopped"] } }
      );
    } else {
      //update all, all the channel and last-rows within, of the last cycle
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
        const newCycle = new CycleInfo({ rows: [newRow], cycleNo: 1 });
        newCycle.validate((err) => {
          if (err) {
            throw new Error("Cycle Schema Validation Failed");
          }
        });
        const chMultiplier = await getChMultiplier(testId, channel);
        const newChannel = new Channel({
          channelNo: channel,
          cycles: [newCycle],
          multiplier: chMultiplier,
        });
        newChannel.validate((err) => {
          if (err) {
            throw new Error("Channel Schema Validation Failed");
          }
        });

        //console.log(newRow, newChannel);
        const response = await Test.updateOne(
          { _id: testId },
          {
            $push: {
              "testResult.channels": newChannel,
            },
          }
        );
        if (response) {
          res.json({ status: "ok" });
        }
      } else if (status.statusCh !== "Running") {
        res.json({ status: "failed", msg: "channel's status must be running" });
      } else if (status.rowNo === undefined) {
        const newRow = await formNewRow(testId, channel, 1, req.body);
        const response = await Test.updateOne(
          { _id: testId },
          {
            $push: {
              "testResult.channels.$[channel].cycles.$[cycle].rows": newRow,
            },
          },
          {
            arrayFilters: [
              { "channel.channelNo": channel },
              {
                "cycle.cycleNo": status.cycleNo,
              },
            ],
          }
        );
        if (response) {
          res.json({ status: "ok" });
        }
      } else if (status.statusRow === "Completed") {
        //open new Row for insreting measurement
        const newRow = await formNewRow(
          testId,
          channel,
          status.rowNo + 1,
          req.body
        );
        const response = await Test.updateOne(
          { _id: testId },
          {
            $push: {
              "testResult.channels.$[channel].cycles.$[cycle].rows": newRow,
            },
          },
          {
            arrayFilters: [
              { "channel.channelNo": channel },
              {
                "cycle.cycleNo": status.cycleNo,
              },
            ],
          }
        );
        if (response) {
          res.json({ status: "ok" });
        }
      } else {
        const identity = {
          testId: testId,
          channelNo: channel,
          rowNo: status.rowNo,
          cycleNo: status.cycleNo,
        };
        await insertMeasurement(identity, req.body)
          .then((results) => {
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
          "testResult.channels.$[channel].cycles.$[cycle].rows.$[row].currentMultiplierIndex": 1,
        },
      };
      filters = [
        {
          "channel.channelNo": channelNo,
          "channel.status": { $nin: ["Completed", "Stopped"] },
        },
        {
          "cycle.cycleNo": currenStatus.cycleNo,
        },
        {
          "row.rowNo": rowNo,
          "row.status": { $nin: ["Completed", "Stopped"] },
          "row.currentMultiplierIndex": { $lt: currenStatus.rowMultiplier },
        },
      ];
    } else if (channelNo) {
      const newRow = {
        rowNo: 1,
        multiplier: getRowMultiplier(testId, channelNo, 1),
      };
      const newCycle = new CycleInfo({
        cycleNo: currenStatus.chMultiplierIndex + 1,
      });
      update = {
        $inc: {
          "testResult.channels.$[channel].currentMultiplierIndex": 1,
        },
        $push: {
          "testResult.channels.$[channel].cycles": newCycle,
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
  const measurement = {
    current: current,
    voltage: voltage,
    chamberTemp: chamberTemp,
    chamberHum: chamberHum,
    cellTemp: cellTemp,
    time: time,
  };
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
    return new Error(err);
  }
}

function insertMeasurement(identity, measurements) {
  const updates = {};
  if (measurements.voltage) {
    updates[
      "testResult.channels.$[channel].cycles.$[cycle].rows.$[row].measuredParameters.voltage"
    ] = { $each: measurements.voltage };
  }
  if (measurements.current) {
    updates[
      "testResult.channels.$[channel].cycles.$[cycle].rows.$[row].measuredParameters.current"
    ] = { $each: measurements.current };
  }
  if (measurements.chamberTemp) {
    updates[
      "testResult.channels.$[channel].cycles.$[cycle].rows.$[row].measuredParameters.chamberTemp"
    ] = { $each: measurements.chamberTemp };
  }
  if (measurements.chamberHum) {
    updates[
      "testResult.channels.$[channel].cycles.$[cycle].rows.$[row].measuredParameters.chamberHum"
    ] = { $each: measurements.chamberHum };
  }
  if (measurements.time) {
    updates[
      "testResult.channels.$[channel].cycles.$[cycle].rows.$[row].measuredParameters.time"
    ] = { $each: measurements.time };
  }
  const updateCellTempOps = measurements.cellTemp.map((tempObj) => ({
    updateOne: {
      filter: { _id: identity.testId },
      update: {
        $push: {
          "testResult.channels.$[channel].cycles.$[cycle].rows.$[row].measuredParameters.cellTemp.$[sensor].values":
            { $each: tempObj.values },
        },
      },
      arrayFilters: [
        { "channel.channelNo": identity.channelNo },
        { "cycle.cycleNo": identity.cycleNo },
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
        { "cycle.cycleNo": identity.cycleNo },
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
    cycleNo: 0,
    cycleStartDate: undefined,
    cycleEndDate: undefined,
  };
  if (testResult) {
    const ch = testResult.channels.find((val) => val.channelNo == channel);
    if (!ch) {
      return null;
    }
    //only info about the current cycle is required which always present at the last
    const lastCycle = ch.cycles[ch.cycles.length - 1];
    ch.rows = lastCycle?.rows;
    defaultRes.chNo = channel;
    defaultRes.statusCh = ch.status;
    defaultRes.chMultiplierIndex = ch.currentMultiplierIndex;
    defaultRes.chMultiplier = ch.multiplier;
    defaultRes.cycleStartDate = lastCycle.cycleStartDate;
    defaultRes.cycleEndDate = lastCycle.cycleEndDate;
    defaultRes.cycleNo = lastCycle.cycleNo;
    if (ch.rows?.length > 0) {
      const row = ch.rows[ch.rows.length - 1];
      defaultRes.rowNo = row.rowNo;
      defaultRes.statusRow = row.status;
      defaultRes.rowMultiplierIndex = row.currentMultiplierIndex;
      defaultRes.rowMultiplier = row.multiplier;
      defaultRes.lastTime =
        row.measuredParameters.time[row.measuredParameters.time.length - 1];
    }
  } else {
    return null;
  }
  //console.log(defaultRes);
  return defaultRes;
}

module.exports = feedExpResultRoute;
