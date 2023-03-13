const { Cell, USER } = require("../../../models/schema");
const express = require("express");
const { default: mongoose } = require("mongoose");
const cellInfoRoute = express.Router();

cellInfoRoute.post("/", async (req, res) => {
  try {
    const q = req.body.cellQuantity || 1;
    const users = req.body.users;
    const body = req.body;
    const cellName = req.body.cellName;

    const assignedUsers = (users || [])
      .filter((user) => user._id !== req.user._id.toString())
      .map((user) => ({
        _id: mongoose.Types.ObjectId(user._id),
        accessType: "write",
      }));

    assignedUsers.push({ _id: req.user._id, accessType: "admin" });

    const cells = Array(q)
      .fill({ ...body, assignedUsers })
      .map((cell, i) => ({ ...cell, cellName: `${cellName}-${i + 1}` }));

    const cellsInserted = await Cell.create(cells);

    const updateUserAccessOnCell = cellsInserted.map((cell) => ({
      _id: cell._id,
      accessType: "admin",
    }));
    const updateUserAccessOnCellOther = cellsInserted.map((cell) => ({
      _id: cell._id,
      accessType: "write",
    }));

    await Promise.all([
      USER.updateOne(
        { _id: req.user._id },
        { $push: { configuredCells: updateUserAccessOnCell } }
      ),
      ...assignedUsers.map((user) =>
        USER.updateOne(
          { _id: user._id },
          { $push: { configuredCells: updateUserAccessOnCellOther } }
        )
      ),
    ]);

    res.json({ msg: "success" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

cellInfoRoute.get("/", async (req, res) => {
  try {
    const updatedCells = await getCellsForUser(req.user);
    res.json(updatedCells);
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

cellInfoRoute.post("/for-experiment", async (req, res) => {
  try {
    const updatedCells = await getCellsForUser(req.user,true,req.body.searchStr);
    res.json(updatedCells);
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

async function getCellsForUser(user, forExperiment = false,searchStr = undefined) {
  let res = await USER.findOne({ _id: user._id }).select("+configuredCells");
  const cellsAssigned = res.configuredCells;
  const cellIds = [];
  for (let cell of cellsAssigned) {
    if (forExperiment) {
      if (cell.accessType == "admin" || cell.accessType == "write") {
        cellIds.push(cell._id);
      }
    } else {
      cellIds.push(cell._id);
    }
  }
  const cells = await Cell.find({ _id: { $in: cellIds },cellName:{$regex:searchStr,$options:'i'} })
    .select("-testsPerformed")
    .lean();
  const updatedCells = cells.map((cell) => {
    access = user.configuredCells.find(
      (c) => cell._id.toString() === c._id.toString()
    ).accessType;
    let updatedCell = { ...cell, accessType: access };
    if (access != "admin") {
      delete updatedCell.assignedUsers;
    }
    return updatedCell;
  });
  return updatedCells;
}
module.exports = cellInfoRoute;
