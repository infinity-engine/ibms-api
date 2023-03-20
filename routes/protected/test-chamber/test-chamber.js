const express = require("express");
const { default: mongoose } = require("mongoose");
const testChamberRoute = express.Router();
const { TestChamber, USER, ChamberAPI } = require("../../../models/schema");
const crypto = require("crypto");

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

    res.json({
      ...testChamber.toObject(),
      apiKey: await generateAPIKey(testChamber._id, assignedUsers),
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

//get list of test chamber
testChamberRoute.get("/", async (req, res) => {
  try {
    const chbrs = await getTestChambersForUser(req.user);
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
    const tests = await TestChamber.aggregate([
      { $match: { _id: { $in: chamberIds } } },
      { $unwind: "$testsPerformed" },
      { $match: { "testsPerformed.status": { $in: ["Running", "Paused"] } } },
      {
        $group: {
          _id: "$testsPerformed._id",
          chamberName: { $first: "$name" },
          chamberId: { $first: "$_id" },
          testName: { $first: "$testsPerformed.testConfig.testName" },
          status: { $first: "$testsPerformed.status" },
          testConfig: { $first: "$testsPerformed.testConfig" },
          testResult: { $first: "$testsPerformed.testResult" },
        },
      },
      {
        $project: {
          "testResult.channels.rows.measuredParameters": 0,
          "testResult.channels.rows.derivedParameters": 0,
        },
      },
    ]);
    if (!tests) {
      res.json([]);
    }
    tests.forEach((test) => {
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
      delete test.testConfig;
      delete test.testResult;
    });
    //console.log(tests);
    res.json(tests);
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

testChamberRoute.post("/test-data", async (req, res) => {
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
          testConfig: { $first: "$testsPerformed.testConfig" },
          testResult: { $first: "$testsPerformed.testResult" },
          testStartDate: { $first: "$testsPerformed.testStartDate" },
          testScheduleDate: { $first: "$testsPerformed.testScheduleDate" },
          testEndDate: { $first: "$testsPerformed.testEndDate" },
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
        let chRes = testInfo.testResult.channels.find(
          (ch_) => ch_.channelNo == ch.channelNumber
        );
        channel.status = chRes?.status;
        channel.rows = chRes?.rows;
        channel.currentMultiplierIndex = chRes?.currentMultiplierIndex;
        channel.chStartDate = chRes?.chStartDate;
        channel.chEndDate = chRes?.chEndDate;
        channels.push(channel);
      });
      testInfo.channels = channels;
      delete testInfo.testConfig;
      delete testInfo.testResult;
      res.json(testInfo);
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

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

async function getTestChambersForUser(user) {
  const chamberIds = user.configuredChambers.map((chamber) => chamber._id);

  const chambers = await TestChamber.find({
    _id: { $in: chamberIds },
  })
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
    let apiKey = undefined;
    for (let user of assignedUsers) {
      const api = await ChamberAPI.create([
        {
          apiKey: await generateUniqueCode(),
          assignedChamber: { _id: chamberId, accessType: user.accessType },
          assignedUser: user._id,
        },
      ]);
      if (user.accessType === "admin") {
        apiKey = api[0].apiKey;
      }
    }
    return apiKey;
  } catch (err) {
    console.log(err);
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
module.exports = testChamberRoute;
