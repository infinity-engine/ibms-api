const express = require("express");
require("./models/schema");
const userRoute = require("./routes/users");
const cors = require("cors");
require("dotenv/config");
const protectedRoute = require("./routes/protected/protected");

const mongoose = require("mongoose");
const publicRoute = require("./routes/public/public");
mongoose.set("strictQuery", false);
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
app.use(express.json());
app.use(express.text({ type: "text/csv" }));

app.get("/", (req, res) => {
  res.send(
    "You have reached to intelligent-bms api, developed by Koushik Samanta."
  );
});

app.use("/api", dbConnect);

app.use("/api/users", userRoute);

app.use("/api/protected", protectedRoute);

app.use("/api/public", publicRoute);

app.listen(process.env.PORT, () => {
  console.log(`Listening on port ${process.env.PORT}`);
});
