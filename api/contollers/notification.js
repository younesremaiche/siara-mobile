const {verifyTokenAndSeller,verifyTokenAndAuthorizationA_S ,verifyTokenAndAuthorizationA_C, verifyTokenAndAdminandSeller, verifyToken,verifyTokenAndAuthorization, verifyTokenAndAdmin } = require("./verifytoken");
const connection = require('../db');
const { query } = require("../utils/promiseQuery.js");
const router = require("express").Router();

// GET NOTIFICATIONS
router.get("/", verifyTokenAndAdmin, async (req, res, next) => {
    
    try {
      let sqlQuery = "SELECT * FROM NOTIFICATION ";
      connection.query(sqlQuery, (err, data) => {
        if (err) return next(err);
        res.status(200).json(data);
      });
    } catch (err) {
      next(err);
    }
  });


module.exports = router ;