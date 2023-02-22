const express = require("express");
const { default: mongoose } = require("mongoose");
const testChamberRoute = express.Router();
const { TestChamber, USER, ChamberAPI } = require("../../../models/schema");
const crypto = require('crypto')

//create a new test chamber
testChamberRoute.post("/", async (req, res) => {
  try {
    const payload = {
      ...req.body,
      assignedUsers: [{ _id: req.user._id, accessType: "admin" }],
    };
    //console.log(payload);
    const testChamber = await TestChamber.create(payload);
    USER.updateOne(
      { _id: req.user._id },
      {
        $push: {
          configuredChambers: { _id: testChamber._id, accessType: "admin" },
        },
      },
      (err) => {
        if (err) {
          res
            .status(500)
            .json("failed to give the user access to this test chameber");
        }
      }
    );
    const api = await ChamberAPI.create({
      apiKey: await generateUniqueCode(),
      assignedChamber: {_id:testChamber._id,accessType:'admin'},
      assignedUser:  req.user._id,
    })
    res.json({...testChamber.toObject(),apiKey:api.apiKey});
    
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

testChamberRoute.get("/", async (req, res) => {
  try {
    const chbrs = await getTestChambersForUser(req.user);
    res.json(chbrs);
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
module.exports = testChamberRoute;


