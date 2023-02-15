const express = require("express");
const protectedRoute = express.Router();
const testChamberRoute = require("./test-chamber/test-chamber");
const cellTemplatesRoute = require("./cell/cell-templates");
const cellInfoRoute = require("./cell/cell-info");

const { checkJwt, getSub } = require("../../Authz/authz");

protectedRoute.use(checkJwt, getSub);
protectedRoute.use("/test-chamber", testChamberRoute);
protectedRoute.use("/cell/cell-templates", cellTemplatesRoute);
protectedRoute.use("/cell/cell-info", cellInfoRoute);

module.exports = protectedRoute;
