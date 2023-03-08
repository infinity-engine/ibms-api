const express = require("express");
const { default: mongoose } = require("mongoose");
const checkAccess = require("../../../middleware/checkAccess/checkAccess");
const { TestChamber } = require("../../../models/schema");
const feedExpResultRoute = express.Router();

const {
  RowInfo,
  MeasuredParameters,
  Channel,
} = require("../../../models/testResultSchema");

feedExpResultRoute.use(checkAccess);

function checkIfExpRunning(req, res, next) {
  try {
    TestChamber.aggregate(
      [
        {
          $match: {
            _id: req.assignedChamberId,
          },
        },
        { $unwind: "$testsPerformed" },
        {
          $match: {
            "testsPerformed._id": mongoose.Types.ObjectId(req.query.testId),
          },
        },
        {
          $group: {
            _id: "$testsPerformed._id",
            status: { $first: "$testsPerformed.status" },
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
      req.assignedChamberId,
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
  chamberId,
  testId,
  status,
  channelNo = undefined,
  rowNo = undefined
) {
  //will set status for all channel, and their last rows
  try {
    const [testInfo] = await TestChamber.aggregate([
      { $match: { _id: chamberId } },
      { $unwind: "$testsPerformed" },
      { $match: { "testsPerformed._id": testId } },
      {
        $group: {
          _id: "$testsPerformed._id",
          status: { $first: "$testsPerformed.status" },
          testScheduleDate: { $first: "$testsPerformed.testStartDate" },
          testStartDate: { $first: "$testsPerformed.testStartDate" },
          testEndDate: { $first: "$testsPerformed.testEndDate" },
          testResult: { $first: "$testsPerformed.testResult" },
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
    if (
      status === "Running" &&
      Date.now() > testInfo.testScheduleDate &&
      testInfo.status !== "Running"
    ) {
      //only when schedule date is past to current date
      testInfo.status = "Running";
      testInfo.testStartDate = Date.now();
    } else if (status === "Stopped" || status === "Completed") {
      testInfo.status = status;
      testInfo.testEndDate = Date.now();
    } else if (status === "Paused") {
      testInfo.status = status;
    } else {
      return false;
    }

    //update the status
    let update = {
      "testsPerformed.$[test].status": testInfo.status,
      "testsPerformed.$[test].testStartDate": testInfo.testStartDate,
      "testsPerformed.$[test].testEndDate": testInfo.testEndDate,
      "testsPerformed.$[test].testResult.channels.$[channel].status":
        testInfo.status,
      "testsPerformed.$[test].testResult.channels.$[channel].rows.$[row].status":
        testInfo.status,
    };
    let filters = [{ "test._id": testId }];

    if (rowNo && channelNo) {
      //if a specific rowNo and channelNo is given, that means your'e asked to change the status of the
      // particular row of a channel
      delete update["testsPerformed.$[test].status"];
      delete update["testsPerformed.$[test].testStartDate"];
      delete update["testsPerformed.$[test].testEndDate"];
      delete update[
        "testsPerformed.$[test].testResult.channels.$[channel].status"
      ];

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
      delete update["testsPerformed.$[test].status"];
      delete update["testsPerformed.$[test].testStartDate"];
      delete update["testsPerformed.$[test].testEndDate"];
      filters.push(
        {
          "channel.channelNo": channelNo,
          "channel.status": { $nin: ["Completed", "Stopped"] },
        },
        { "row.status": { $nin: ["Completed", "Stopped"] } }
      );
    } else {
      filters.push(
        {
          "channel.status": { $nin: ["Completed", "Stopped"] },
        },
        { "row.status": { $nin: ["Completed", "Stopped"] } }
      );
    }
    let res = await TestChamber.updateOne(
      { _id: chamberId },
      { $set: update },
      { arrayFilters: filters }
    );
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

feedExpResultRoute.get("/updated-upto", async (req, res) => {
  //give a update on how much data are already updated to the cloud,
  //so the testchamber can feed data next to that.
  //{chNo:n,isChCom:Boolean,RowNo:n,isRowCom:Boolean,lastTime:RelativeTime}
  try {
    res.json(
      await getLastUpdateStatus(
        req.assignedChamberId,
        req.query.testId,
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
      const status = await getLastUpdateStatus(
        req.assignedChamberId,
        req.query.testId,
        channel
      );
      if (status === null) {
        const newRow = formNewRow(1, req.body);
        const newChannel = new Channel({
          channelNo: channel,
          rows: [newRow],
        });
        TestChamber.updateOne(
          { _id: req.assignedChamberId },
          {
            $push: {
              "testsPerformed.$[test].testResult.channels": newChannel,
            },
          },
          {
            arrayFilters: [
              { "test._id": mongoose.Types.ObjectId(req.query.testId) },
            ],
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
        const newRow = formNewRow(status.rowNo + 1, req.body);
        TestChamber.updateOne(
          { _id: req.assignedChamberId },
          {
            $push: {
              "testsPerformed.$[test].testResult.channels.$[channel].rows":
                newRow,
            },
          },
          {
            arrayFilters: [
              { "test._id": mongoose.Types.ObjectId(req.query.testId) },
              { "channel.channelNo": channel },
            ],
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
          chamberId:req.assignedChamberId,
          testId:mongoose.Types.ObjectId(req.query.testId),
          channelNo:channel,
          rowNo:status.rowNo,
        };
        insertMeasurement(identity, req.body)
          .then((results) => {
            //console.log(results)
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

function formNewRow(rowId, measurements) {
  const { current, voltage, chTemp, chHum, cellTemp, time } = measurements;
  const measurement = new MeasuredParameters({
    current: current,
    voltage: voltage,
    chamberTemp: chTemp,
    chamberHum: chHum,
    cellTemp: cellTemp,
    time: time,
  });
  const row = new RowInfo({
    rowNo: rowId,
    measuredParameters: measurement,
  });
  return row;
}

function insertMeasurement(identity, measurements) {
  const updates = {};
  if (measurements.voltage) {
    updates[
      "testsPerformed.$[test].testResult.channels.$[channel].rows.$[row].measuredParameters.voltage"
    ] = { $each: measurements.voltage };
  }
  if (measurements.current) {
    updates[
      "testsPerformed.$[test].testResult.channels.$[channel].rows.$[row].measuredParameters.current"
    ] = { $each: measurements.current };
  }
  if (measurements.chTemp) {
    updates[
      "testsPerformed.$[test].testResult.channels.$[channel].rows.$[row].measuredParameters.chTemp"
    ] = { $each: measurements.chTemp };
  }
  if (measurements.chHum) {
    updates[
      "testsPerformed.$[test].testResult.channels.$[channel].rows.$[row].measuredParameters.chHum"
    ] = { $each: measurements.chHum };
  }
  if (measurements.time) {
    updates[
      "testsPerformed.$[test].testResult.channels.$[channel].rows.$[row].measuredParameters.time"
    ] = { $each: measurements.time };
  }
  if (measurements.cellTemp) {
    updates[
      "testsPerformed.$[test].testResult.channels.$[channel].rows.$[row].measuredParameters.cellTemp"
    ] = { $each: measurements.cellTemp };
  }
  return TestChamber.updateOne(
    { _id: identity.chamberId },
    {
      $push: updates,
    },
    {
      arrayFilters: [
        { "test._id": identity.testId },
        { "channel.channelNo": identity.channelNo },
        { "row.rowNo": identity.rowNo },
      ],
    }
  );
}

async function getLastUpdateStatus(chamberId, testId, channel) {
  //{chNo:n,isChCom:Boolean,rowNo:n,isRowCom:Boolean,lastTime:RelativeTime}
  const results = await TestChamber.aggregate([
    { $match: { _id: chamberId } },
    { $unwind: "$testsPerformed" },
    {
      $match: {
        "testsPerformed._id": mongoose.Types.ObjectId(testId),
      },
    },
    {
      $group: {
        _id: "$testsPerformed._id",
        testResult: { $first: "$testsPerformed.testResult" },
      },
    },
  ]);
  const testResult = results[0].testResult;
  let defaultRes = {
    chNo: undefined,
    statusCh: undefined,
    rowNo: undefined,
    statusRow: undefined,
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
    defaultRes.rowNo = row.rowNo;
    defaultRes.statusRow = row.status;
    defaultRes.lastTime =
      row.measuredParameters.time[row.measuredParameters.time.length - 1];
  } else {
    return null;
  }
  return defaultRes;
}

module.exports = feedExpResultRoute;
