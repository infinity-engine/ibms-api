const express = require("express");
const User = require("./../models/schema");
const userRouter = express.Router();

const mongoose = require("mongoose");
function dbConnect(req, res, next) {
  mongoose.connect(process.env.DB_URL_BASE + "/i_bms");
  next();
}

userRouter.get("/",dbConnect, async (req, res) => {
  try {
    const user = await User.findOne({ sub: req.query.sub });
    res.json(user);
  } catch (error) {
    res.json({ message: error });
  }
});

userRouter.post("/",dbConnect, async (req, res) => {
  try {
    const user = await User.create({...req.body});
    res.json(user);
  } catch (error) {
    res.json({ message: error });
  }
});

userRouter.delete("/",dbConnect, async (req, res) => {
  try {
    const user = await User.deleteOne(req.body);
    res.json(user);
  } catch (error) {
    res.json({ message: error });
  }
});

module.exports = userRouter;
