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

async function checkIfExpRunning(req, res, next) {
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
          if (result[0].status === 'Running') {
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
    res.status(500).json({ status: "failed", msg: "Error" });
  }
}

feedExpResultRoute.get("/set-status", async (req, res) => {
  try {
    const results = await TestChamber.aggregate([
      { $match: { _id: req.assignedChamberId } },
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
          testStartDate: { $first: "$testsPerfomed.testStartDate" },
          testEndDate: { $first: "$testsPerformed.testEndDate" },
          isComplete: { $first: "$testsPerfomed.testEndDate" },
        },
      },
    ]);
    const test = results[0];
    if (test) {
      if (test.status !== "Stopped" && test.status !== "Completed") {
        if (req.query.status == "Stopped") {
          test.testEndDate = Date.now();
        } else if (
          req.query.status === "Running" &&
          test.status !== "Running"
        ) {
          test.testStartDate = Date.now();
        } else if (
          req.query.status === "Completed" &&
          test.status !== "Completed"
        ) {
          test.testEndDate = Date.now();
          test.isComplete = true;
          await closeDoorAll(req.assignedChamberId,req.query.testId)
        }
      }else{
        res.json({status:"failed",msg:"test is closed!"})
        return
      }
      test.status = req.query.status;
      const r = await TestChamber.updateOne(
        {
          _id: req.assignedChamberId
        },
        {
          $set: {
            "testsPerformed.$[test].status": test.status,
            "testsPerformed.$[test].testStartDate": test.testStartDate,
            "testsPerformed.$[test].testEndDate": test.testEndDate,
            "testsPerformed.$[test].isComplete": test.isComplete,
          },
        },{
          arrayFilters:[{"test._id":mongoose.Types.ObjectId(req.query.testId)}]
        }
      );
      if (r.acknowledged === true) {
        res.json({ status: "ok"});
      } else {
        res.json({ status: "failed" });
      }
    } else {
      res.json({ status: "failed" });
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ status: "failed", msg: "Error" });
  }
});

feedExpResultRoute.get("/updated-upto", async (req, res) => {
  //give a update on how much data are already updated to the cloud,
  //so the testchamber can feed data next to that.
  //{chNo:n,isChCom:Boolean,RowNo:n,isRowCom:Boolean,lastTime:RelativeTime}
  try {
    res.json(
      await getLastUpdateStatus(
        req.assignedChamberId,
        req.query.testId,
        req.query.channel
      )
    );
  } catch (err) {
    console.log(err);
    res.status(500).json({ status: "failed", msg: "Error" });
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
              console.log(result);
              res.json({ status: "ok" });
            }
          }
        );
      } else if (status.isChCl) {
        res.json({ status: "failed" });
        return;
      } else if (status.isRowCl) {
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
        const identity = [
          req.assignedChamberId,
          req.query.testId,
          channel,
          status.rowNo,
        ];
        insertMeasurement(identity, req.body)
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

feedExpResultRoute.get(
  "/close-door-ch",
  checkIfExpRunning,
  async (req, res) => {
    try {
      const status = await getLastUpdateStatus(
        req.assignedChamberId,
        req.query.testId,
        +req.query.channel
      );
      if (status) {
        const closeChRes = await closeDoorCh(
          req.assignedChamberId,
          req.query.testId,
          +req.query.channel
        );
        const closeRwRes = await closeDoorRow(
          req.assignedChamberId,
          req.query.testId,
          +req.query.channel,
          status.rowNo
        );
        console.log(closeChRes, closeRwRes);
        res.json({ status: "ok" });
      } else {
        res.json({ status: "failed" });
      }
    } catch (err) {
      console.log(err);
      res.status(500).json({ status: "failed", msg: "Error" });
    }
  }
);
feedExpResultRoute.get(
  "/close-door-row",
  checkIfExpRunning,
  async (req, res) => {
    try {
      const status = await getLastUpdateStatus(
        req.assignedChamberId,
        req.query.testId,
        +req.query.channel
      );
      if (status) {
        const closeRwRes = await closeDoorRow(
          req.assignedChamberId,
          req.query.testId,
          +req.query.channel,
          status.rowNo
        );
        console.log(closeRwRes);
        res.json({ status: "ok" });
      } else {
        res.json({ status: "failed" });
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
  const allPromises = [];
  if (measurements.voltage) {
    allPromises.push(insertVoltage(...identity, measurements.voltage));
  }
  if (measurements.current) {
    allPromises.push(insertCurrent(...identity, measurements.current));
  }
  if (measurements.chTemp) {
    allPromises.push(insertChTemp(...identity, measurements.chTemp));
  }
  if (measurements.chHum) {
    allPromises.push(insertChHum(...identity, measurements.chHum));
  }
  if (measurements.time) {
    allPromises.push(insertTime(...identity, measurements.time));
  }
  if (measurements.cellTemp) {
    allPromises.push(insertCellTemp(...identity, measurements.cellTemp));
  }
  return Promise.all(allPromises);
}

function insertVoltage(chamberId, testId, channelNo, rowNo, voltages) {
  return TestChamber.updateOne(
    { _id: chamberId },
    {
      $push: {
        "testsPerformed.$[test].testResult.channels.$[channel].rows.$[row].measuredParameters.voltage":
          { $each: voltages },
      },
    },
    {
      arrayFilters: [
        { "test._id": mongoose.Types.ObjectId(testId) },
        { "channel.channelNo": channelNo },
        { "row.rowNo": rowNo },
      ],
    }
  );
}

function insertCurrent(chamberId, testId, channelNo, rowNo, currents) {
  return TestChamber.updateOne(
    { _id: chamberId },
    {
      $push: {
        "testsPerformed.$[test].testResult.channels.$[channel].rows.$[row].measuredParameters.current":
          { $each: currents },
      },
    },
    {
      arrayFilters: [
        { "test._id": mongoose.Types.ObjectId(testId) },
        { "channel.channelNo": channelNo },
        { "row.rowNo": rowNo },
      ],
    }
  );
}

function insertChTemp(chamberId, testId, channelNo, rowNo, chTemps) {
  return TestChamber.updateOne(
    { _id: chamberId },
    {
      $push: {
        "testsPerformed.$[test].testResult.channels.$[channel].rows.$[row].measuredParameters.chamberTemp":
          { $each: chTemps },
      },
    },
    {
      arrayFilters: [
        { "test._id": mongoose.Types.ObjectId(testId) },
        { "channel.channelNo": channelNo },
        { "row.rowNo": rowNo },
      ],
    }
  );
}

function insertChHum(chamberId, testId, channelNo, rowNo, chHums) {
  return TestChamber.updateOne(
    { _id: chamberId },
    {
      $push: {
        "testsPerformed.$[test].testResult.channels.$[channel].rows.$[row].measuredParameters.chamberHum":
          { $each: chHums },
      },
    },
    {
      arrayFilters: [
        { "test._id": mongoose.Types.ObjectId(testId) },
        { "channel.channelNo": channelNo },
        { "row.rowNo": rowNo },
      ],
    }
  );
}

function insertCellTemp(chamberId, testId, channelNo, rowNo, cellTemps) {
  return TestChamber.updateOne(
    { _id: chamberId },
    {
      $push: {
        "testsPerformed.$[test].testResult.channels.$[channel].rows.$[row].measuredParameters.cellTemp":
          { $each: cellTemps },
      },
    },
    {
      arrayFilters: [
        { "test._id": mongoose.Types.ObjectId(testId) },
        { "channel.channelNo": channelNo },
        { "row.rowNo": rowNo },
      ],
    }
  );
}

function insertTime(chamberId, testId, channelNo, rowNo, times) {
  return TestChamber.updateOne(
    { _id: chamberId },
    {
      $push: {
        "testsPerformed.$[test].testResult.channels.$[channel].rows.$[row].measuredParameters.time":
          { $each: times },
      },
    },
    {
      arrayFilters: [
        { "test._id": mongoose.Types.ObjectId(testId) },
        { "channel.channelNo": channelNo },
        { "row.rowNo": rowNo },
      ],
    }
  );
}

async function closeDoorCh(chamberId, testId, channelNo) {
  const response = await TestChamber.updateOne(
    { _id: chamberId },
    { "testsPerformed.$[test].testResult.channels.$[channel].isClosed": true },
    {
      arrayFilters: [
        { "test._id": mongoose.Types.ObjectId(testId) },
        { "channel.channelNo": channelNo },
      ],
    }
  );
  return response;
}

async function closeDoorRow(chamberId, testId, channelNo, rowNo) {
  const response = await TestChamber.updateOne(
    { _id: chamberId },
    {
      $set: {
        "testsPerformed.$[test].testResult.channels.$[channel].rows.$[row].isClosed": true,
      },
    },
    {
      arrayFilters: [
        { "test._id": mongoose.Types.ObjectId(testId) },
        { "channel.channelNo": channelNo },
        { "row.rowNo": rowNo },
      ],
    }
  );
  return response;
}
async function closeDoorAll(chamberId, testId) {
  const response = await TestChamber.updateOne(
    { _id: chamberId },
    {
      $set: {
        "testsPerformed.$[test].testResult.channels.$[].isClosed": true,
        "testsPerformed.$[test].testResult.channels.$[].rows.$[].isClosed": true,
      },
    },
    {arrayFilters:[{"test._id":mongoose.Types.ObjectId(testId)}]}
  );
  return response
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
  const defaultRes = {
    chNo: undefined,
    isChCl: false,
    rowNo: undefined,
    isRowCl: false,
    lastTime: 0,
  };
  if (testResult) {
    const ch = testResult.channels.find((val) => val.channelNo == channel);
    if (!ch) {
      return null;
    }
    const row = ch.rows[ch.rows.length - 1];
    defaultRes.chNo = channel;
    defaultRes.isChCl = channel.isClosed;
    defaultRes.rowNo = row.rowNo;
    defaultRes.isRowCl = row.isClosed;
    defaultRes.lastTime =
      row.measuredParameters.time[row.measuredParameters.time.length - 1];
  } else {
    return null;
  }
  return defaultRes;
}

module.exports = feedExpResultRoute;
