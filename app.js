const express = require("express");
require("./models/schema");
const userRoute = require("./routes/users");
const cors = require("cors");
require("dotenv/config");
const protectedRoute = require("./routes/protected/protected");
//const swagger = require("./swagger");

const mongoose = require("mongoose");
const publicRoute = require("./routes/public/public");
mongoose.set("strictQuery", false);
function dbConnect(req, res, next) {
  mongoose.connect(process.env.DB_URL_BASE);
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
    "You have reached to intelligent-bms api, developed by Koushik Samanta. Time:" +
      Date.now()
  );
});
app.get("/t1", (req, res) => {
  res.send("This is Test-1");
});
app.get("/t2", (req, res) => {
  res.send("This is Test-2");
});

app.use("/api", dbConnect);

app.use("/api/users", userRoute);

app.use("/api/protected", protectedRoute);

app.use("/api/public", publicRoute);

//swagger(app);

app.listen(process.env.PORT, () => {
  console.log(`Listening on port ${process.env.PORT}`);
});
