const express = require('express')
const protectedRoute = express.Router()
const testChamberRoute = require('./test-chamber/test-chamber')

const {checkJwt,getSub} = require('../../Authz/authz')

protectedRoute.use(checkJwt,getSub)
protectedRoute.use('/test-chamber',testChamberRoute)

module.exports = protectedRoute