const express = require("express");
const userRouter = express.Router();
const {USER} = require("./../models/schema");


userRouter.get("/", async (req, res) => {
  try {
    const user = await USER.findOne({ sub: req.query.sub });
    res.json(user);
  } catch (error) {
    console.log("err",error)
    res.status(500).json(error);
  }
});

userRouter.post("/", async (req, res) => {
  try {
    const user = await USER.create({...req.body});
    res.json(user);
  } catch (error) {
    res.status(500).json(error);
  }
});

userRouter.delete("/", async (req, res) => {
  try {
    const user = await USER.deleteOne(req.body);
    res.json(user);
  } catch (error) {
    res.status(500).json(error);
  }
});

module.exports = userRouter;