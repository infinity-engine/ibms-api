const { USER } = require("../../../models/schema");
const express = require("express");
const assignUserRoute = express.Router();

assignUserRoute.post("/", async (req, res) => {
  try {
    const searchStr = req.body.searchStr;
    if (searchStr.length == 0) {
      res.json([]);
    } else {
      const users = await USER.find({
        $or: [
          { given_name: { $regex: searchStr, $options: "i" } },
          { family_name: { $regex: searchStr, $options: "i" } },
          { nickname: { $regex: searchStr, $options: "i" } },
          { name: { $regex: searchStr, $options: "i" } },
          { email: { $regex: searchStr, $options: "i" } },
        ],
      }).select({_id:1,email:1,name:1,picture:1});
      res.json(users);
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({msg:"Error"});
  }
});

module.exports = assignUserRoute;
