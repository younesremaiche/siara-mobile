const router = require("express").Router();


const jwt = require("jsonwebtoken");
const createError = require('http-errors');
const connection = require('../db');
const { query } = require("../utils/promiseQuery.js");


// REGISTER
router.post('/register', (req, res, next) => {
  try {
    // CHECK EXISTING USER
    const checkUserQuery = "SELECT * FROM users WHERE username = ? OR email = ?";
    connection.query(checkUserQuery, [req.body.username, req.body.email], (err, data) => {
      if (err) return next(err);
      if (data.length) 
        {return next(createError(409, "User already exists"))}
      else{
        res.status(200).json('User Added Successfuly')
      }
      ;

      // Hash the password (you should hash the password before saving it)
      // const hashedPassword = someHashFunction(req.body.password);

      // Inserting into account table
      const insertAccountQuery = `INSERT INTO users(username, firstname,lastname,password, email ) VALUES (?, ?, ?, ? , ?  )`;
      connection.query(insertAccountQuery, [req.body.username,req.body.firstname,req.body.lastname, req.body.password, req.body.email ], (err, result) => {
        if (err) return next(err);
      });
    });
  } catch (err) {
    next(err);
  }
});

//LOGIN

router.post('/login', async (req, res) => {
  try {
      const sql = "SELECT * FROM users WHERE username = ? ";
      const values = [req.body.username];
      const users = await query(sql, values);

      if (users.length === 0) {
          return res.status(401).json("Wrong User Name");
      }

      const user = users[0];
      const hashedPassword = user.password; // Assuming the password is stored in the database in plaintext
      const inputPassword = req.body.password;


      if (hashedPassword !== inputPassword) {
          return res.status(401).json("Wrong Password");
      }

      // Add logging before jwt.sign() function call
      console.log("Generating JWT token...");

      // Generate a JWT token
      const accessToken = jwt.sign(
          { idUSER: user.iduser, userRole: user.userRole },
          process.env.JWT_ACCESSTOKEN,
          { expiresIn: "3d" },
          
      );
      
      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      
      const { password, ...others } = user;
      
      res.status(200).json({ accessToken, ...others }); // Send back the token and user data
      
  } catch (err) {
      res.status(500).json(err);
  }
});






//LOGOUT

router.post('/logout', (req, res) => {
  res
    .cookie("accessToken", "", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      expires: new Date(1),
    })
    .status(200)
    .send("User has been logged out!");
});




module.exports = router;