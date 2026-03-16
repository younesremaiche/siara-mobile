const router = require("express").Router();


const jwt = require("jsonwebtoken");
const createError = require('http-errors');
const connection = require('../db');
const { query } = require("../utils/promiseQuery.js");
const { verifyTokenAndAdmin } = require("./verifytoken.js");


// ADD PALE
router.post('/create-pale', (req, res, next) => {
  try {
    // CHECK EXISTING USER
    const checkPaleQuery = "SELECT * FROM pales WHERE palename = ? ";
    connection.query(checkPaleQuery, [req.body.palename], (err, data) => {
      if (err) return next(err);
      if (data.length) return next(createError(409, "Pale already exists"));

      // Hash the password (you should hash the password before saving it)
      // const hashedPassword = someHashFunction(req.body.password);

      // Inserting into account table
      const insertPaleQuery = `INSERT INTO pales(palename, paleimage , price , \`desc\`, type , poids , production , quantity) VALUES (?, ?, ?, ? , ? , ? , ? , ?)`;
      connection.query(insertPaleQuery, [req.body.palename , req.body.paleimage , req.body.price , req.body.desc, req.body.type , req.body.poids , req.body.production , req.body.quantity], (err, result) => {
        if (err) return next(err);
        return res.status(200).json("Pale added successfully!");

      });
    });
  } catch (err) {
    next(err);
  }
});

// UPDATE PALE PRICE
router.put('/edit-price/:id', verifyTokenAndAdmin,(req, res, next) => {
    const {price} = req.body;
    const paleId = req.params.id;
  
    const q = "UPDATE pales SET price = ? WHERE idpales = ?";
    try {
      connection.query(q, [price, paleId], (err, data) => {
        if (err) return next(err);
        return res.status(200).json("Pale updated successfully!");
      });
    } catch (err) {
      next(err);
    }
  });

 //get ALL PALES


 router.get("/getpales",async (req, res) => {
    try {
        const getAllPales = `SELECT * FROM pales`;
  
        connection.query(getAllPales, (err, pales) => {
            if (err) {
                console.error("Error fetching pales:", err);
                res.status(500).json({ error: "Failed to fetch pales." });
                return;
            }
  
            console.log("pales fetched:", pales); // Add this line for debugging
  
            // Categories successfully fetched
            res.status(200).json(pales);
        });
    } catch (err) {
        console.error("Internal server error:", err);
        res.status(500).json({ error: "Internal server error." });
    }
  });
  
  
  // GET Pale BY ID 
  router.get("/pale/:id", async (req, res) => {
  
      const paleId = req.params.id;
      try {
          const getPale = `SELECT * FROM pales where idpales = ?`;
    
          connection.query(getPale, paleId ,(err, pale) => {
              if (err) {
                  console.error("Error fetching pale:", err);
                  res.status(500).json({ error: "Failed to fetch pale." });
                  return;
              }
    
              console.log("pale fetched:", pale); // Add this line for debugging
    
              // Categories successfully fetched
              res.status(200).json(pale);
          });
      } catch (err) {
          console.error("Internal server error:", err);
          res.status(500).json({ error: "Internal server error." });
      }
    });


    // DELETE PALE
     
  router.delete('/delete-pale/:id', verifyTokenAndAdmin ,(req, res) => {
  
    const q = "DELETE from pales WHERE idpales = ?";
    try {
      connection.query(q, [req.params.id], (err, data) => {
        if (err) return next(err);
        return res.status(200).json("pale deleted successfully!")
      })
    } catch (err) {
      next(err)
    }
    
  });



module.exports = router;