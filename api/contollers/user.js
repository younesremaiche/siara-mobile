const router = require("express").Router();


const jwt = require("jsonwebtoken");
const createError = require('http-errors');
const connection = require('../db');
const { query } = require("../utils/promiseQuery.js");
const { verifyTokenAndAdmin, verifyToken } = require("./verifytoken.js");











//ACCEPT USER
router.put('/accept/:id', verifyTokenAndAdmin ,(req, res) => {

    const q = "UPDATE users SET isAccepted = 1 WHERE iduser = ?";
    try {
      connection.query(q, [req.params.id], (err, data) => {
        if (err) return next(err);
        return res.status(200).json("Account accepted successfully!")
      })
    } catch (err) {
      return res.status(409).json("error")

    }
    
  });
  
  //DELETE ACCOUNT
  
router.delete("/delete/:id", verifyTokenAndAdmin, async (req, res) => {
  const userId = req.params.id;

  try {
    // Delete user cart items
    const deleteCartQuery = `
      DELETE FROM cart
      WHERE id_user = ?;
    `;
    connection.query(deleteCartQuery, [userId], (err, cartResults) => {
      if (err) {
        console.error("Error deleting user cart items:", err);
        res.status(500).json({ error: "Failed to delete user cart items." });
        return;
      }

      // Delete user orders and order items
      const deleteOrderItemsQuery = `
     DELETE oi
  FROM orderitem oi
  JOIN pales.order o ON oi.id_order = o.idorder
  WHERE o.id_user = ?;
      `;
      connection.query(deleteOrderItemsQuery, [userId], (err, orderItemsResults) => {
        if (err) {
          console.error("Error deleting user order items:", err);
          res.status(500).json({ error: "Failed to delete user order items." });
          return;
        }

        // Delete user orders
        const deleteOrdersQuery = `
          DELETE FROM pales.order
          WHERE id_user = ?;
        `;
        connection.query(deleteOrdersQuery, [userId], (err, ordersResults) => {
          if (err) {
            console.error("Error deleting user orders:", err);
            res.status(500).json({ error: "Failed to delete user orders." });
            return;
          }

          // Finally, delete the user
          const deleteUserQuery = `
            DELETE FROM users
            WHERE iduser = ?;
          `;
          connection.query(deleteUserQuery, [userId], (err, userResults) => {
            if (err) {
              console.error("Error deleting user:", err);
              res.status(500).json({ error: "Failed to delete user." });
              return;
            }

            // Send success response
            res.status(200).json({ message: "User and associated data deleted successfully." });
          });
        });
      });
    });
  } catch (err) {
    console.error("Internal server error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});


  //get ALL USERS


router.get("/getuser", verifyTokenAndAdmin ,async (req, res) => {
  try {
      const getAllCategoriesQuery = `SELECT * FROM users where userRole = 0`;

      connection.query(getAllCategoriesQuery, (err, users) => {
          if (err) {
              console.error("Error fetching users:", err);
              res.status(500).json({ error: "Failed to fetch users." });
              return;
          }

          console.log("users fetched:", users); // Add this line for debugging

          // Categories successfully fetched
          res.status(200).json(users);
      });
  } catch (err) {
      console.error("Internal server error:", err);
      res.status(500).json({ error: "Internal server error." });
  }
});


// GET USER BY ID 
router.get("/user/:id", async (req, res) => {

    const userId = req.params.id;
    try {
        const getUser = `SELECT * FROM users where iduser = ?`;
  
        connection.query(getUser, userId ,(err, users) => {
            if (err) {
                console.error("Error fetching user:", err);
                res.status(500).json({ error: "Failed to fetch user." });
                return;
            }
  
            console.log("user fetched:", users); // Add this line for debugging
  
            // Categories successfully fetched
            res.status(200).json(users);
        });
    } catch (err) {
        console.error("Internal server error:", err);
        res.status(500).json({ error: "Internal server error." });
    }
  });

module.exports = router;