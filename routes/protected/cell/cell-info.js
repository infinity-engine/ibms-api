const { Cell, USER } = require("../../../models/schema");
const express = require("express");
const { default: mongoose, Mongoose } = require("mongoose");
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

//get the cell/cells info
cellInfoRoute.get("/", async (req, res) => {
  try {
    const cells = await getAdditionalCellInfo(req.user.configuredCells);
    const assignedUsers = [];
    for (let cell of cells) {
      if (cell.assignedUsers) {
        assignedUsers.push(...cell.assignedUsers);
      }
    }
    const users_ = await getUsersAdditionalInfo(
      assignedUsers.map((user) => user._id)
    );
    for (let cell of cells) {
      if (cell.assignedUsers) {
        cell.assignedUsers = cell.assignedUsers.map((user) => {
          let name = users_.find(
            (u) => u._id.toString() == user._id.toString()
          )?.name;
          return { _id: user._id, name: name, accessType: user.accessType };
        });
      }
    }
    if (req.query.cellId) {
      const cell_ = cells.find(
        (cell) => cell._id.toString() === req.query.cellId
      );
      res.json(cell_);
    } else {
      res.json(cells);
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

//update the cell info
cellInfoRoute.put("/", async (req, res) => {
  try {
    //no need to check for isMarkedForDeleted, as user configuredCell will on containe non marked cell
    const cell = req.user.configuredCells.find(
      (cell) => cell._id.toString() === req.body._id
    );
    if (!cell || cell.accessType != "admin") {
      throw new Error("Access Denied");
    }
    const cellId = cell._id;
    let prevUsers = [];
    await getUsersForCell(cellId)
      .then((resolve) => {
        prevUsers = resolve;
      })
      .catch((err) => {
        throw new Error(err);
      });

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

    prevUsers.forEach((user) => {
      let i = assignedUsers.findIndex(
        (u) => u._id.toString() === user._id.toString()
      );
      if (i === -1) {
        usersToRemove.push(user);
      } else {
        usersToUpdateAccess.push(assignedUsers[i]);
        assignedUsers.splice(i, 1);
      }
    });
    usersToInsert.push(...assignedUsers);

    const payload = {
      ...req.body,
      assignedUsers: [...usersToInsert, ...usersToUpdateAccess],
    };
    delete payload["_id"];
    //console.log(payload);

    //for cell remove,update,insert
    const cellUpdate = Cell.updateOne({ _id: cellId }, { $set: payload });

    //for user
    //remove
    const removeCellFromUsersUpdate = removeAssignedCellFromUsers(
      usersToRemove,
      cellId
    );
    //update
    const updateAsssignedCellFromUsersUpdate = updateAssignedCellFromUsers(
      usersToUpdateAccess,
      cellId
    );
    //insert
    const insertAssignedCellOnUsersUpdate = insertAssignedCellOnUsers(
      usersToInsert,
      cellId
    );
    await Promise.all([
      cellUpdate,
      removeCellFromUsersUpdate,
      updateAsssignedCellFromUsersUpdate,
      insertAssignedCellOnUsersUpdate,
    ]).then(
      (resolve) => {
        //console.log(resolve);
      },
      (reject) => {
        throw new Error(reject);
      }
    );
    res.json({ msg: "ok" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

//get the matching cell with searchstr as cellName
cellInfoRoute.get("/for-experiment", async (req, res) => {
  try {
    await getAdditionalCellInfo(
      req.user.configuredCells,
      true,
      req.query.searchStr
    )
      .then((resolve) => {
        res.json(resolve);
      })
      .catch((err) => {
        throw new Error(err);
      });
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

//delete a given cell with give cellId
cellInfoRoute.delete("/", async (req, res) => {
  try {
    const cell = req.user.configuredCells.find(
      (cell) => cell._id.toString() === req.query.cellId
    );
    if (!cell || cell.accessType != "admin") {
      throw new Error("Access Denied!");
    }
    let prevUsers = [];
    await getUsersForCell(cell._id)
      .then((resolve) => {
        prevUsers = resolve;
      })
      .catch((err) => {
        throw new Error(err);
      });

    await Promise.all([
      Cell.updateOne(
        {
          _id: cell._id,
        },
        { $set: { isMarkedForDeleted: true } }
      ),
      removeAssignedCellFromUsers(prevUsers, cell._id),
    ]).then(
      (resolve) => {
        console.log(resolve);
      },
      (reject) => {
        throw new Error(reject);
      }
    );
    res.json({ status: "ok" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Error" });
  }
});

async function getAdditionalCellInfo(
  configuredCells,
  forExperiment = false,
  searchStr = ""
) {
  try {
    const cellIds = [];
    for (let cell of configuredCells) {
      if (forExperiment) {
        if (cell.accessType == "admin" || cell.accessType == "write") {
          cellIds.push(cell._id);
        }
      } else {
        cellIds.push(cell._id);
      }
    }
    //only send cells which are not marked for deleted
    //dont have to include isMarkedForDeleted as these will already had removed from cellAssigned in user collection
    const cells = await Cell.find(
      {
        _id: { $in: cellIds },
        cellName: { $regex: searchStr, $options: "i" },
      },
      null,
      { sort: { createdOn: -1 } }
    )
      .select("-testsPerformed")
      .lean();
    const updatedCells = cells.map((cell) => {
      access = configuredCells.find(
        (c) => cell._id.toString() === c._id.toString()
      ).accessType;
      let updatedCell = { ...cell, accessType: access };
      if (access != "admin") {
        delete updatedCell.assignedUsers;
      }
      return updatedCell;
    });
    if (!updatedCells) {
      throw new Error("Error on making updated cells");
    }
    return updatedCells;
  } catch (err) {
    return new Error(err);
  }
}

//returns a promise which promises to remove cell id from configuredcells of all the users provided
function removeAssignedCellFromUsers(users, cellId) {
  let updates = users.map((user) => ({
    updateOne: {
      filter: { _id: user._id },
      update: { $pull: { configuredCells: { _id: cellId } } },
    },
  }));
  return USER.bulkWrite(updates);
}
//promises to update access on a given cell for all the given users
function updateAssignedCellFromUsers(users, cellId) {
  let updates = users.map((user) => ({
    updateOne: {
      filter: { _id: user._id },
      update: {
        $set: { "configuredCells.$[cell].accessType": user.accessType },
      },
      arrayFilters: [{ "cell._id": cellId }],
    },
  }));
  return USER.bulkWrite(updates);
}
//promises to insert new cell into configured cell of given users
function insertAssignedCellOnUsers(users, cellId) {
  let updates = users.map((user) => ({
    updateOne: {
      filter: { _id: user._id },
      update: {
        $push: {
          configuredCells: { _id: cellId, accessType: user.accessType },
        },
      },
    },
  }));
  return USER.bulkWrite(updates);
}
//returns users assigned to a cell
async function getUsersForCell(cellId) {
  try {
    const users = await Cell.findOne({
      _id: cellId,
    })
      .select({
        assignedUsers: 1,
      })
      .lean();
    return users.assignedUsers;
  } catch (err) {
    throw new Error(err);
  }
}

async function getUsersAdditionalInfo(assignedUsers) {
  try {
    const users = USER.find({ _id: { $in: assignedUsers } }).select({
      _id: 1,
      name: 1,
    });
    return users.lean();
  } catch (err) {
    throw new Error(err);
  }
}

module.exports = cellInfoRoute;
