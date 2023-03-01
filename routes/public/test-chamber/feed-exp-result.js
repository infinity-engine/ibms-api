const express = require("express");
const { default: mongoose } = require("mongoose");
const checkAccess = require("../../../middleware/checkAccess/checkAccess");
const { TestChamber } = require("../../../models/schema");
const feedExpResultRoute = express.Router();

feedExpResultRoute.get("/set-status", checkAccess, async (req, res) => {
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
        } else if (req.query.status === "Running" && test.status !== "Running") {
          test.testStartDate = Date.now();
        } else if (req.query.status === "Completed" &&test.status !== "Completed") {
          test.testEndDate = Date.now();
          test.isComplete = true;
        }
      }
      test.status = req.query.status;
      const r = await TestChamber.updateOne(
        {
          _id: req.assignedChamberId,
          "testsPerformed._id": mongoose.Types.ObjectId(req.query.testId),
        },
        {
          $set: {
            "testsPerformed.$.status": test.status,
            "testsPerformed.$.testStartDate": test.testStartDate,
            "testsPerformed.$.testEndDate": test.testEndDate,
            "testsPerformed.$.isComplete": test.isComplete,
          },
        }
      );
      if(r.acknowledged === true){
        res.json({acknowledged:true})
      }else{
        res.json({acknowledged:false})
      }
    }else{
        res.json({acknowledged:false})
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

module.exports = feedExpResultRoute;
