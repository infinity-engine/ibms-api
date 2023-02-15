const { Cell, USER } = require("../../../models/schema");
const express = require("express");
const cellInfoRoute = express.Router();

cellInfoRoute.post("/", async (req, res) => {
  try {
    const q = req.body.cellQuantity;
    delete req.body.cellQuantity;
    const cells = [];
    basePayLoad = {
        ...req.body,
        assignedUsers: [{ _id: req.user._id, accessType: "admin" }],
    }
    updateUserAcessOnCell = [];
    for (let i=1;i<=q;i++){
        if (q>=1){
            cells.push( {...basePayLoad,cellName:req.body.cellName+"-"+i})
        }else{
            cells.push(basePayLoad)
        }
    }
    ;
    const cellsInserted = await Cell.create(cells);
    for (let cell of cellsInserted){
        updateUserAcessOnCell.push({_id: cell._id, accessType: "admin"})
    }
    const updatedUser = await USER.updateOne(
      { _id: req.user._id },
      { $push: {configuredCells:updateUserAcessOnCell} }
    );
    //console.log(cell);
    res.json({ msg: "success" });
  } catch (err) {
    console.log(err);
    res.status(500);
  }
});

module.exports = cellInfoRoute;
