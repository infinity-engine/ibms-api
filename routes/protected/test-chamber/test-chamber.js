const express = require("express");
const { default: mongoose } = require("mongoose");
const testChamberRoute = express.Router();
const { TestChamber, USER, ChamberAPI } = require("../../../models/schema");
const crypto = require("crypto");
const { stringify } = require("csv-stringify/sync");

//create a new test chamber
testChamberRoute.post("/", async (req, res) => {
  try {
    const assignedUsers = [];
    assignedUsers.push({ _id: req.user._id, accessType: "admin" });
    if (req.body.assignedUsers) {
      const userIdStr = req.user._id.toString();
      req.body.assignedUsers.forEach((user) => {
        if (user._id !== userIdStr) {
          assignedUsers.push({
            _id: mongoose.Types.ObjectId(user._id),
            accessType: user.accessType,
          });
        }
      });
    }
    const payload = {
      ...req.body,
      assignedUsers: assignedUsers,
    };
    //console.log(payload);
    const testChamber = await TestChamber.create(payload);

    if (!updateChamberAccessOnUser(testChamber._id, assignedUsers)) {
      throw new Error("failed to provide access to the users");
    }
    const apis = await generateAPIKey(testChamber._id, assignedUsers);
    res.json({
      ...testChamber.toObject(),
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

//update a test chamber
testChamberRoute.put("/", async (req, res) => {
  try {
    const chamberId = mongoose.Types.ObjectId(req.body._id);
    let assignedUsers = [];
    assignedUsers.push({ _id: req.user._id, accessType: "admin" });
    if (req.body.assignedUsers) {
      const userIdStr = req.user._id.toString();
      req.body.assignedUsers.forEach((user) => {
        if (user._id !== userIdStr) {
          assignedUsers.push({
            _id: mongoose.Types.ObjectId(user._id),
            accessType: user.accessType,
          });
        }
      });
    }
    const usersToRemove = []; //user which were present in old data but needed to remove now
    const usersToUpdateAccess = []; //whose access has to be changed
    const usersToInsert = []; //new user to provide api
    const prevUsers = await getUsersForChamber(chamberId);

    prevUsers.forEach((user) => {
      let i = assignedUsers.findIndex(
        (u) => u._id.toString() === user._id.toString()
      );
      if (i === -1) {
        usersToRemove.push(user);
      } else {
        usersToUpdateAccess.push(user);
        assignedUsers.splice(i, 1);
      }
    });
    usersToInsert.push(...assignedUsers);

    const payload = {
      ...req.body,
      assignedUsers: [...usersToInsert, ...usersToUpdateAccess],
    };
    delete payload["_id"];
    console.log(payload);
    const testChamberUpdate = TestChamber.updateOne(
      { _id: chamberId },
      { $set: payload }
    );
    const removeAccessUpdate = removeUsersApiForChambers(
      usersToRemove.map((user) => user._id),
      [chamberId]
    );
    const updateAccessUpdate = updateUserApiForChamber(
      usersToUpdateAccess,
      chamberId
    );

    await Promise.all([
      testChamberUpdate,
      removeAccessUpdate,
      updateAccessUpdate,
    ]).then(
      (data) => {
        console.log(data);
      },
      (err) => {
        throw new Error(err);
      }
    );
    const apis = await generateAPIKey(chamberId, usersToInsert);
    if (!apis) {
      throw new Error("New api creation failed");
    }
    if (apis.length == usersToInsert.length) {
      res.json({ msg: "ok" });
    } else {
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

//get list of test chamber
testChamberRoute.get("/", async (req, res) => {
  try {
    let chbrs = await getTestChambersForUser(req.user);
    if (req.query.chamberId) {
      let chamber = chbrs.find(
        (ch) => ch._id.toString() === req.query.chamberId
      );
      if (!chamber) {
        throw new Error("No chamber found");
      } else {
        chbrs = [chamber];
      }
    }
    const assignedUsers = [];
    for (let chbr of chbrs) {
      if (chbr.assignedUsers) {
        assignedUsers.push(...chbr.assignedUsers);
      }
    }
    const users_ = await getUserAdditionalInfo(
      assignedUsers.map((user) => user._id)
    );
    for (let chbr of chbrs) {
      if (chbr.assignedUsers) {
        chbr.assignedUsers = chbr.assignedUsers.map((user) => {
          let name = users_.find(
            (u) => u._id.toString() == user._id.toString()
          )?.name;
          return { _id: user._id, name: name, accessType: user.accessType };
        });
      }
    }
    res.json(chbrs);
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

testChamberRoute.get("/live-tests", async (req, res) => {
  //gives the list of tests that are on live;
  try {
    const chamberIds = req.user.configuredChambers.map(
      (chamber) => chamber._id
    );
    const tests = await getTests(chamberIds, ["Running", "Paused"]);
    if (!tests) {
      res.json([]);
    }
    res.json(tests);
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

testChamberRoute.get("/all-tests", async (req, res) => {
  //gives the list of tests that are on live;
  try {
    const chamberIds = req.user.configuredChambers.map(
      (chamber) => chamber._id
    );
    const tests = await getTests(chamberIds);
    if (!tests) {
      res.json([]);
    }
    res.json(tests);
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

async function getTests(
  chamberIds,
  statusArr = ["Running", "Scheduled", "Stopped", "Paused", "Completed"]
) {
  try {
    const tests = await TestChamber.aggregate([
      { $match: { _id: { $in: chamberIds } } },
      { $unwind: "$testsPerformed" },
      { $match: { "testsPerformed.status": { $in: statusArr } } },
      {
        $group: {
          _id: "$testsPerformed._id",
          chamberName: { $first: "$name" },
          chamberId: { $first: "$_id" },
          testName: { $first: "$testsPerformed.testConfig.testName" },
          status: { $first: "$testsPerformed.status" },
          testConfig: { $first: "$testsPerformed.testConfig" },
          testResult: { $first: "$testsPerformed.testResult" },
          createdOn: { $first: "$testsPerformed.createdOn" },
        },
      },
      {
        $sort: { createdOn: -1 },
      },
      {
        $project: {
          "testResult.channels.rows.measuredParameters": 0,
          "testResult.channels.rows.derivedParameters": 0,
        },
      },
    ]);
    if (!tests) {
      return [];
    }
    tests.forEach((test) => {
      try {
        test.channels = test.testResult.channels.map((ch) => {
          let totalRows = test.testConfig.channels.find(
            (ch_) => ch_.channelNumber == ch.channelNo
          )?.testFormats?.length;
          return {
            channelNo: ch.channelNo,
            statusCh: ch.status,
            chMultiplierIndex: ch.currentMultiplierIndex,
            chMultiplier: ch.multiplier,
            onRows: ch.rows.length,
            totalRows: totalRows,
            statusRow: ch.rows[ch.rows.length - 1].status,
            rowMultiplierIndex:
              ch.rows[ch.rows.length - 1].currentMultiplierIndex,
            rowMultiplier: ch.rows[ch.rows.length - 1].multiplier,
          };
        });
      } catch (err) {
        //do nothing;
      }
      delete test.testConfig;
      delete test.testResult;
    });
    return tests;
  } catch (err) {
    console.log(err);
    return;
  }
}

testChamberRoute.post("/get-test-data", async (req, res) => {
  try {
    if (!(req.body.testId && req.body.chamberId)) {
      throw new Error("testId or chamberId isn't received.");
    }
    const chamber = req.user.configuredChambers.find(
      (cham) => cham._id.toString() === req.body.chamberId
    );
    if (!chamber) {
      throw new Error("Test Chamber not found.");
    }
    const testId = mongoose.Types.ObjectId(req.body.testId);
    const chamberId = chamber._id;
    const testData = await TestChamber.aggregate([
      { $match: { _id: chamberId } },
      { $unwind: "$testsPerformed" },
      { $match: { "testsPerformed._id": testId } },
      {
        $group: {
          _id: "$testsPerformed._id",
          chamberName: { $first: "$name" },
          chamberId: { $first: "$_id" },
          testName: { $first: "$testsPerformed.testConfig.testName" },
          status: { $first: "$testsPerformed.status" },
          forcedStatus: { $first: "$testsPerformed.forcedStatus" },
          testConfig: { $first: "$testsPerformed.testConfig" },
          testResult: { $first: "$testsPerformed.testResult" },
          testStartDate: { $first: "$testsPerformed.testStartDate" },
          testScheduleDate: { $first: "$testsPerformed.testScheduleDate" },
          testEndDate: { $first: "$testsPerformed.testEndDate" },
        },
      },
      {
        $project: {
          "testResult.channels.rows.measuredParameters": 0,
          "testResult.channels.rows.derivedParameters": 0,
        },
      },
    ]);
    if (testData && testData.length > 0) {
      testData[0].accessType = chamber.accessType;
      const testInfo = testData[0];
      let configAndData = {};
      configAndData.isConAmTe = testInfo.testConfig.isConAmTe;
      configAndData.ambTemp = testInfo.testConfig.ambTemp;
      let channels = [];
      testInfo.testConfig.channels.forEach((ch) => {
        let channel = { ...ch };
        delete channel["_id"];
        channel.multiplier = channel["overallRowMultiplier"];
        delete channel["overallRowMultiplier"];
        try {
          let chRes = testInfo.testResult.channels.find(
            (ch_) => ch_.channelNo == ch.channelNumber
          );
          channel.status = chRes?.status;
          channel.rows = chRes?.rows;
          channel.currentMultiplierIndex = chRes?.currentMultiplierIndex;
          channel.chStartDate = chRes?.chStartDate;
          channel.chEndDate = chRes?.chEndDate;
        } catch (err) {
          //do nothing
        }
        channels.push(channel);
      });
      testInfo.channels = channels;
      delete testInfo.testConfig;
      delete testInfo.testResult;
      res.json(testInfo);
    } else {
      throw new Error("Not found!");
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

testChamberRoute.post("/force-status", async (req, res) => {
  try {
    if (
      !(
        req.body.testId &&
        req.body.chamberId &&
        req.body.forcedStatus !== undefined
      )
    ) {
      throw new Error("testId or chamberId isn't received.");
    }
    const chamber = req.user.configuredChambers.find(
      (cham) => cham._id.toString() === req.body.chamberId
    );
    if (!chamber) {
      throw new Error("Test Chamber not found.");
    }
    if (chamber.accessType == "read") {
      throw new Error("You don't have appropriate privilege");
    }
    const testId = mongoose.Types.ObjectId(req.body.testId);
    const chamberId = chamber._id;
    const forcedStatus = req.body.forcedStatus;

    const result = await TestChamber.updateOne(
      { _id: chamberId },
      { $set: { "testsPerformed.$[test].forcedStatus": forcedStatus } },
      { arrayFilters: [{ "test._id": testId }] }
    );
    res.json(result);
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

testChamberRoute.post("/get-test-result", async (req, res) => {
  try {
    if (!(req.body.testId && req.body.chamberId && req.body.channelNo)) {
      throw new Error("testId or chamberId or isn't received.");
    }
    const chamber = req.user.configuredChambers.find(
      (cham) => cham._id.toString() === req.body.chamberId
    );
    if (!chamber) {
      throw new Error("Test Chamber not found.");
    }
    const testId = mongoose.Types.ObjectId(req.body.testId);
    const chamberId = chamber._id;
    const channelNo = +req.body.channelNo;
    const indexAfter = +req.body.indexAfter || 0; //mention after which array index measurement has to be sent
    //should be calculated overall, appending all the rows together within a channel

    const testData = await getMeasurement(
      chamberId,
      testId,
      channelNo,
      indexAfter
    );
    if (testData) {
      res.json(testData);
    } else {
      throw new Error("Not found!");
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

async function getMeasurement(chamberId, testId, channelNo, indexAfter = 0) {
  try {
    const testData = await TestChamber.aggregate([
      { $match: { _id: chamberId } },
      { $unwind: "$testsPerformed" },
      { $match: { "testsPerformed._id": testId } },
      {
        $group: {
          _id: "$testsPerformed._id",
          testResult: { $first: "$testsPerformed.testResult.channels" },
        },
      },
      {
        $unwind: "$testResult",
      },
      {
        $match: { "testResult.channelNo": channelNo },
      },
      {
        $group: {
          _id: "$testResult.channelNo",
          status: { $first: "$testResult.status" },
          rows: { $first: "$testResult.rows" },
        },
      },
      {
        $project: {
          status: 1,
          "rows.measuredParameters": 1,
          "rows.derivedParameters": 1,
          "rows.rowNo": 1,
        },
      },
    ]);
    //console.log(testData);
    if (testData && testData.length > 0) {
      const testInfo = testData[0];
      const measuredParameters = {
        current: [],
        voltage: [],
        chamberTemp: [],
        chamberHum: [],
        chamberTemp: [],
        cellTemp: [],
        time: [],
      };
      testInfo.rows.forEach((row) => {
        measuredParameters.current.push(...row.measuredParameters.current);
        measuredParameters.voltage.push(...row.measuredParameters.voltage);
        measuredParameters.chamberTemp.push(
          ...row.measuredParameters.chamberTemp
        );
        measuredParameters.chamberHum.push(
          ...row.measuredParameters.chamberHum
        );
        measuredParameters.time.push(...row.measuredParameters.time);
        if (measuredParameters.cellTemp.length > 0) {
          row.measuredParameters.cellTemp.forEach((tempObj) => {
            const prevTempObj = measuredParameters.cellTemp.find(
              (_tempObj) => _tempObj.sensorId === tempObj.sensorId
            );
            prevTempObj?.values.push(...tempObj.values);
          });
        } else {
          measuredParameters.cellTemp = row.measuredParameters.cellTemp;
        }
      });
      //slice the previous sent measurements
      if (indexAfter > 0) {
        measuredParameters.current = measuredParameters.current.slice(
          indexAfter + 1
        );
        measuredParameters.voltage = measuredParameters.voltage.slice(
          indexAfter + 1
        );
        measuredParameters.chamberHum = measuredParameters.chamberHum.slice(
          indexAfter + 1
        );
        measuredParameters.chamberTemp = measuredParameters.chamberTemp.slice(
          indexAfter + 1
        );
        measuredParameters.time = measuredParameters.time.slice(indexAfter + 1);
        measuredParameters.cellTemp = measuredParameters.cellTemp.map(
          (tempObj) => {
            return {
              values: tempObj.values.slice(indexAfter + 1),
              sensorId: tempObj.sensorId,
            };
          }
        );
      }
      return {
        channelNo: testInfo._id,
        statusCh: testInfo.status,
        measuredParameters: measuredParameters,
      };
    } else {
      throw new Error("Not found!");
    }
  } catch (err) {
    console.log(err);
    return;
  }
}

testChamberRoute.post("/create-test/", async (req, res) => {
  try {
    const chambers = await getChambersExceptReadAccess(req.user);
    if (chambers.find((e) => e == req.body.chamberId)) {
      const testConfig = await TestChamber.updateOne(
        { _id: mongoose.Types.ObjectId(req.body.chamberId) },
        { $push: { testsPerformed: req.body.testConfig } }
      );
      res.json(testConfig);
    } else {
      res.status(401).json("You don't have adequate access to this chamber");
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

testChamberRoute.post("/download-test-result", async (req, res) => {
  try {
    if (typeof req.body == "string") {
      req.body = JSON.parse(req.body);
    }
    if (!(req.body.testId && req.body.chamberId && req.body.channelNo)) {
      throw new Error("testId or chamberId or channelNo isn't received.");
    }
    const chamber = req.user.configuredChambers.find(
      (cham) => cham._id.toString() === req.body.chamberId
    );
    if (!chamber) {
      throw new Error("Test Chamber not found.");
    }
    const testId = mongoose.Types.ObjectId(req.body.testId);
    const chamberId = chamber._id;
    const channelNo = +req.body.channelNo;
    const indexAfter = +req.body.indexAfter || 0; //mention after which array index measurement has to be sent
    //should be calculated overall, appending all the rows together within a channel

    const testData = await getMeasurement(
      chamberId,
      testId,
      channelNo,
      indexAfter
    );
    if (testData?.measuredParameters) {
      res.set({
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="testResult_channel_${channelNo}.csv"`,
        "Access-Control-Expose-Headers": "Content-Disposition",
      });
      res.send(convertIntoCSV(testData?.measuredParameters));
    } else {
      throw new Error("Not found!");
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

function convertIntoCSV(measuredParameters) {
  const { current, voltage, chamberTemp, chamberHum, cellTemp, time } =
    measuredParameters;
  const header = [
    "Time(S)",
    "Current(A)",
    "Voltage(V)",
    "Chamber Temperature(\u00B0C)",
    "Chamber Humidity(%)",
  ];
  cellTemp.forEach((tempObj) => {
    header.push("Sensor " + tempObj.sensorId);
  });
  const csvData = time.map((time, i) => {
    let row = [time, current[i], voltage[i], chamberTemp[i], chamberHum[i]];
    cellTemp.forEach((tempObj) => {
      row.push(tempObj.values[i]);
    });
    return row;
  });
  const output = stringify(csvData, {
    header: true,
    columns: header,
    eof: false,
  });
  return output;
}

async function getTestChambersForUser(user) {
  const chamberIds = user.configuredChambers.map((chamber) => chamber._id);

  const chambers = await TestChamber.find(
    {
      _id: { $in: chamberIds },
    },
    null,
    { sort: { createdOn: -1 } }
  )
    .select("-testsPerformed")
    .lean();

  const updatedChambers = chambers.map((chamber) => {
    const access = user.configuredChambers.find(
      (c) => c._id.toString() === chamber._id.toString()
    ).accessType;
    let updatedChamber = { ...chamber, accessType: access };
    if (access !== "admin") {
      delete updatedChamber.assignedUsers;
    }
    return updatedChamber;
  });

  return updatedChambers;
}

async function getChambersExceptReadAccess(user) {
  let chmbrs = [];
  user.configuredChambers.forEach((element) => {
    if (element.accessType !== "read") {
      chmbrs.push(element._id.toString());
    }
  });
  return chmbrs;
}

async function generateAPIKey(chamberId, assignedUsers) {
  try {
    let apis = [];
    for (let user of assignedUsers) {
      const api = await ChamberAPI.create([
        {
          apiKey: await generateUniqueCode(),
          assignedChamber: { _id: chamberId, accessType: user.accessType },
          assignedUser: user._id,
        },
      ]);
      apis.push(api);
    }
    return apis;
  } catch (err) {
    console.log(err);
    return;
  }
}

async function generateUniqueCode() {
  let apiKey = crypto.randomBytes(20).toString("hex");
  let existing = await ChamberAPI.findOne({ apiKey: apiKey });
  if (existing) {
    // If a document with the same API key value already exists,
    // generate a new API key value and check again
    return generateUniqueCode();
  } else {
    // If a unique API key value is found, return it
    return apiKey;
  }
}

async function updateChamberAccessOnUser(chamberId, assignedUsers) {
  try {
    const updateOps = assignedUsers.map((user) => ({
      updateOne: {
        filter: { _id: user._id },
        update: {
          $push: {
            configuredChambers: { _id: chamberId, accessType: user.accessType },
          },
        },
      },
    }));

    await USER.bulkWrite(updateOps);
    return true;
  } catch (err) {
    console.log(err);
    return false;
  }
}

async function getUserAdditionalInfo(assignedUsers) {
  try {
    const users = USER.find({ _id: { $in: assignedUsers } }).select({
      _id: 1,
      name: 1,
    });
    return users.lean();
  } catch (err) {
    console.log(err);
    return null;
  }
}
async function getUsersForChamber(chamberId) {
  try {
    const users = await TestChamber.findOne({ _id: chamberId })
      .select({
        assignedUsers: 1,
      })
      .lean();
    if (users) {
      return users.assignedUsers;
    } else {
      return [];
    }
  } catch (err) {
    console.log(err);
    return;
  }
}
function removeUsersApiForChambers(userIds = [], chamberIds = []) {
  if (
    (userIds.length === 1 && chamberIds.length > 0) ||
    (userIds.length > 0 && chamberIds.length === 1)
  ) {
    return ChamberAPI.deleteMany({
      "assignedChamber._id": { $in: chamberIds },
      assignedUser: { $in: userIds },
    });
  }
}
function updateUserApiForChamber(users, chamberId) {
  let updates = users.map((user) => ({
    updateOne: {
      filter: {
        "assignedChamber._id": chamberId,
        assignedUser: user._id,
      },
      update: {
        $set: {
          "assignedChamber.accessType": user.accessType,
        },
      },
    },
  }));
  return ChamberAPI.bulkWrite(updates);
}
module.exports = testChamberRoute;
