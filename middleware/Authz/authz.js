const { auth } = require("express-oauth2-jwt-bearer");
require("dotenv/config");
const jsonWebToken = require("jsonwebtoken");
const { USER } = require("../../models/schema");

const checkJwt = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: process.env.AUTH0_DOMAIN,
});
async function getSub(req, res, next) {
  //sub stands for subject in context of auth0 which is passed in the encoded information of the
  //jwt token we will use that as for the user id
  const token = req.headers.authorization.split(" ")[1];
  //console.log(token);
  const userId = jsonWebToken.decode(token).sub;
  try {
    const user = await USER.findOne({ sub: userId });
    req.user = user;
  } catch (err) {
    req.user = null;
  }
  next();
}

module.exports = { checkJwt, getSub };
