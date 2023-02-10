const bodyParser = require("body-parser");
const express = require("express");
require("./models/schema");
const userRoute = require("./routes/users");
const { auth } = require("express-oauth2-jwt-bearer");
const cors = require("cors");
require("dotenv/config");
const jsonWebToken = require("jsonwebtoken");

const checkJwt = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: process.env.AUTH0_DOMAIN,
});

const app = express();

app.use(
  cors({
    origin: "*",
  })
);
app.use(bodyParser.json());
app.use("/api/users", userRoute);

function getSub(req, res, next) {
//sub stands for subject in context of auth0 which is passed in the encoded information of the
//jwt token we will use that as for the user id
  const token = req.headers.authorization.split(" ")[1];
  const userId = jsonWebToken.decode(token).sub
  req.userId = userId
  next()
}

app.use("/api/protected", checkJwt, getSub, (req, res) => {
  //access the user from req.userId
  res.json("ok");
});

app.listen(process.env.PORT, () => {
  console.log(`Listening on port ${process.env.PORT}`);
});
