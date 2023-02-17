const bodyParser = require("body-parser");
const express = require("express");
require("./models/schema");
const userRoute = require("./routes/users");
const cors = require("cors");
require("dotenv/config");
const protectedRoute = require("./routes/protected/protected");

const mongoose = require("mongoose");
mongoose.set('strictQuery', false);
function dbConnect(req, res, next) {
  mongoose.connect(process.env.DB_URL_BASE + "/i_bms");
  next();
}

const app = express();

app.use(
  cors({
    origin: "*",
  })
);
app.use(bodyParser.json());

app.use("/api", dbConnect);

app.use("/api/users", userRoute);

app.use("/api/protected", protectedRoute);

app.listen(process.env.PORT, () => {
  console.log(`Listening on port ${process.env.PORT}`);
});
