const router = require("express").Router();


const jwt = require("jsonwebtoken");
const createError = require('http-errors');
const connection = require('../db');
const { query } = require("../utils/promiseQuery.js");
const { verifyTokenAndAdmin } = require('./verifytoken.js'); // Import your authentication middleware

router.get("/Stats", verifyTokenAndAdmin, async (req, res, next) => {
    try {
        // Combined query to get total users and total plaes
        let sqlQuery = `
            SELECT 
                (SELECT COUNT(*) FROM pales.users) AS total_users,
                (SELECT COUNT(*) FROM pales.pales) AS total_plaes,
                (SELECT COUNT(*) FROM pales.order WHERE isArrived = 1) AS total_Arrived,
                (SELECT COUNT(*) FROM pales.order WHERE isArrived = 0) AS total_Progress,
                (SELECT COUNT(*) FROM pales.order WHERE isArrived = -1) AS total_Refunded,
                (SELECT COUNT(*) FROM pales.order) AS total_Orders,
                JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'month', income_history.month,
                        'total_income', income_history.total_income
                    )
                ) AS total_income_history
            FROM (
                SELECT 
                    DATE_FORMAT(o.createdAt, '%Y-%m') AS month,
                    IFNULL(SUM(oi.price), 0) AS total_income
                FROM pales.order o
                LEFT JOIN pales.orderitem oi ON o.idorder = oi.id_order
                LEFT JOIN pales.pales p ON oi.id_pales = p.idpales
                WHERE o.isArrived = 1
                AND YEAR(o.createdAt) = YEAR(CURDATE())
                GROUP BY DATE_FORMAT(o.createdAt, '%Y-%m')
            ) AS income_history;
        `;

        // Execute the query
        connection.query(sqlQuery, (err, data) => {
            if (err) return next(err);
            
            // Respond with the combined results
            res.status(200).json(data[0]);
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
