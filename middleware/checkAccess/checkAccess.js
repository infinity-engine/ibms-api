const { default: mongoose } = require("mongoose");
const { ChamberAPI } = require("../../models/schema");
const { TestChamber } = require("../../models/schema");

//check write/admin access on testchamber and testId with a apikey
async function checkAccess(req, res, next) {
  //api key is only useful when you have write or admin access
  //check with the chamber id and api key the user has appropriate access or not
  //return req.body = > {user,chamberId}
  //here also add code for user ip address check multiple false attemt could be made to genrate and valid api key
  try {
    const api = await ChamberAPI.findOne({ apiKey: req.query.apiKey });
    if (
      api &&
      (api.assignedChamber.accessType == "admin" ||
        api.assignedChamber.accessType == "write")
    ) {
      req.assignedChamberId = api.assignedChamber._id;
      let assignedTestIds = [];

      const lastSeenUpdate = TestChamber.updateOne(
        { _id: mongoose.Types.ObjectId(api.assignedChamber._id) },
        { $set: { lastSeen: Date.now() } }
      );
      const testIdFetchReq = TestChamber.findOne({
        _id: api.assignedChamber._id,
      })
        .select({ testsPerformed: 1 })
        .lean();

      await Promise.all([lastSeenUpdate, testIdFetchReq])
        .then((resolve) => {
          if (resolve[1]) {
            assignedTestIds = resolve[1].testsPerformed.map(
              (test) => test.testId
            );
          }
        })
        .catch((err) => {
          throw new Error(err);
        });
      if (req.query.testId) {
        if (!assignedTestIds.find((id) => id.toString() === req.query.testId)) {
          throw new Error("Don't have access to this test with the api key");
        }
      }
      req.assignedTestIds = assignedTestIds;
      next();
    } else {
      res.status(401).json({
        msg: "This api key doesn't have appropriate access to write to this chamber",
      });
    }
  } catch (err) {
    console.log(err);
    res
      .status(401)
      .json({ status: "failed", msg: "access check with api key failed" });
  }
}

module.exports = checkAccess;
