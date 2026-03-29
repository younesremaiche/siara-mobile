const router = require("express").Router();

const jwt = require("jsonwebtoken");
const createError = require("http-errors");
const connection = require("../db");
const { query } = require("../utils/promiseQuery.js");
const { verifyToken, verifyTokenAndAdmin, verifyTokenAndClient } = require("./verifytoken.js");

// ADD ORDER
//CREATE THE ORDER
router.post("/checkout/:userId", async (req, res) => {
  const userId = req.params.userId;

  const cartQuery = `
    SELECT id_pale, poids, production , quantity , price
    FROM cart
    WHERE id_user = ?
  `;

  try {
    const cartProducts = await new Promise((resolve, reject) => { 
      connection.query(cartQuery, [userId], (err, results) => {
        if (err) {
          console.error("Error fetching cart products:", err);
          reject(err);
        } else {
          resolve(results);
        }
      });
    });

    if (!cartProducts || cartProducts.length === 0) {
      return res.status(400).json({ error: "No products found in the cart." });
    }

    console.log("Raw cart products:", cartProducts);

    const productIds = cartProducts.map((row) => row.id_pale);
    const orderItems = cartProducts.map((row) => ({
      id_pale: row.id_pale,
      quantity: row.quantity,
      poids: row.poids,
      production: row.production,
      price: row.price,
    }));

    console.log("Cart product ids:", productIds);
    console.log("OrderItem:", orderItems);

    connection.beginTransaction(async (err) => {
      if (err) {
        return res.status(500).json({ error: "Transaction start failed." });
      }

      try {
        const estimatedTimeValue = new Date(); // Example estimated time, update as needed
        estimatedTimeValue.setDate(estimatedTimeValue.getDate() + 2);
        const createdAtValue = new Date();
        const state = req.body.state; // Example state
        const postalCode = req.body.postalCode; // Example postal code
        const city = req.body.city; // Example city

        console.log('state : ' + state , 'PostalCode : ' + postalCode , 'city : ' + city)

        if (!state || !postalCode || !city) {
          throw new Error("Missing required fields: state, postalCode, or city.");
        }

        const orderInsertQuery = `
          INSERT INTO \`ORDER\` (state, postalCode, city, id_user, estimatedTime, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        const orderResult = await new Promise((resolve, reject) => {
          connection.query(
            orderInsertQuery,
            [state, postalCode, city, userId, estimatedTimeValue, createdAtValue],
            (err, results) => {
              if (err) reject(err);
              else resolve(results);
            }
          );
        });
        const orderId = orderResult.insertId;

        const orderItemsQuery = `
          INSERT INTO ORDERITEM (id_order, id_pales, quantity, poids, production , price)
          VALUES (?, ?, ?, ?, ? , ?)
        `;

        for (const item of orderItems) {
          await new Promise((resolve, reject) => {
            connection.query(
              orderItemsQuery,
              [orderId, item.id_pale, item.quantity, item.poids, item.production , item.price],
              (err, results) => {
                if (err) reject(err);
                else resolve(results);
              }
            );
          });
        }

        const deleteCartQuery = `
          DELETE FROM CART
          WHERE id_user = ? AND id_pale IN (?)
        `;
        await new Promise((resolve, reject) => {
          connection.query(
            deleteCartQuery,
            [userId, productIds],
            (err, results) => {
              if (err) reject(err);
              else resolve(results);
            }
          );
        });

        connection.commit((err) => {
          if (err) {
            return connection.rollback(() => {
              res.status(500).json({ error: "Transaction commit failed." });
            });
          }
          res.status(200).json({ message: "Order placed successfully." });
        });

        const userQuery = `SELECT * FROM users WHERE iduser = ?`;
        connection.query(userQuery, [userId], (err, results) => {
          if (err) {
            console.error("Error fetching user:", err);
            return;
          }

          if (results.length === 0) {
            return;
          }

          const user = results[0];
          const senderUsername = user.username;
          const notificationText = `${senderUsername} has placed an order.`;
          const insertNotificationQuery = "INSERT INTO NOTIFICATION (text, type, reciver , createdAt) VALUES (?, ?, ? ,?)";
        const notificationDate = new Date();
        

          const insertNotificationValues = [notificationText, 'commande', 1 , notificationDate];

          connection.query(insertNotificationQuery, insertNotificationValues, (err) => {
            if (err) {
              console.error("Failed to create notification:", err);
            }
          });
        });

      } catch (error) {
        connection.rollback(() => {
          console.error("Transaction error:", error);
          res.status(500).json({ error: "Transaction failed.", details: error.message });
        });
      }
    });
  } catch (error) {
    console.error("Error retrieving cart products:", error);
    res.status(500).json({ error: "Error retrieving cart products.", details: error.message });
  }
});

// Route to get order stats for a client
router.get("/client/:clientId/order-stats",  async (req, res) => {
  const clientId = req.params.clientId;

  try {
    const getOrderStatsQuery = `
      SELECT 
      o.idorder,
      o.state,
      o.postalCode,
      o.city,
      o.isArrived AS status,
      o.currentplace AS currentplace,
      o.arrived,
      DATE_FORMAT(o.createdAt, '%Y-%m-%d') AS dateOrder,
      DATE_FORMAT(DATE_ADD(o.estimatedTime, INTERVAL 2 DAY), '%Y-%m-%d') AS estimatedTime,
      p.idpales, p.palename, p.desc, p.price, p.paleimage, p.poids, p.production , p.type,
      oi.poids,
      oi.production,
      oi.price,
oi.quantity
  FROM 
      \`order\` o
  JOIN 
      orderitem oi ON o.idorder = oi.id_order
  JOIN 
      pales p ON oi.id_pales = p.idpales
  WHERE 
      o.id_user = ? AND o.arrived = 'In Progress' ;
      `;

    connection.query(getOrderStatsQuery, [clientId], (err, results) => {
      if (err) {
        console.error("Error fetching order stats:", err);
        res.status(500).json({ error: "Failed to fetch order stats." });
        return;
      }

      if (results.length > 0) {
        const orders = {};
        results.forEach((row) => {
          const orderId = row.idorder;
          if (!orders[orderId]) {
            orders[orderId] = {
              orderId: orderId,
              status: row.status,
              dateOrder: row.dateOrder,
              estimatedTime: row.estimatedTime,
              currentplace : row.currentplace,
              state: row.state,
              postalCode: row.postalCode,
              city: row.city,
              arrived:row.arrived,
             

              products: [],
            };
          }
          orders[orderId].products.push({
            id: row.idpales,
            name: row.palename,
            description: row.desc,
            price: row.price,
            image: row.paleimage,
            poids: row.poids,
            production: row.production,
            type: row.type,
            quantity: row.quantity,
          });
        });

        const formattedResults = Object.values(orders);

        res.status(200).json(formattedResults);
      } else {
        res.status(200).json([]);
      }
    });
  } catch (err) {
    console.error("Internal server error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

// GET ALL ORDER

router.get("/client/all-order-stats", verifyTokenAndAdmin, async (req, res) => {
 

  try {
    const getOrderStatsQuery = `
    SELECT 
        o.idorder,
        o.state,
        o.postalCode,
        o.city,
        o.isArrived AS status,
        o.currentplace,
        DATE_FORMAT(o.createdAt, '%Y-%m-%d') AS dateOrder,
        DATE_FORMAT(DATE_ADD(o.estimatedTime, INTERVAL 2 DAY), '%Y-%m-%d') AS estimatedTime,
        COUNT(p.idpales) AS totalPales,
        SUM(p.price * oi.quantity) AS totalPrice,
        u.username
    FROM 
        \`order\` o
    JOIN 
        orderitem oi ON o.idorder = oi.id_order
    JOIN 
        pales p ON oi.id_pales = p.idpales
    JOIN 
        users u ON o.id_user = u.iduser
    GROUP BY 
        o.idorder,
        o.state,
        o.postalCode,
        o.city,
        o.isArrived,
        o.createdAt,
        o.estimatedTime;
`;


    connection.query(getOrderStatsQuery, (err, results) => {
      if (err) {
        console.error("Error fetching order stats:", err);
        res.status(500).json({ error: "Failed to fetch order stats." });
        return;
      }

      if (results.length > 0) {
        const orders = {};
        results.forEach((row) => {
          const orderId = row.idorder;
          if (!orders[orderId]) {
            orders[orderId] = {
              orderId: orderId,
              username : row.username,
              status: row.status,
              dateOrder: row.dateOrder,
              estimatedTime: row.estimatedTime,
currentPlace:row.currentplace,
              state: row.state,
              postalCode: row.postalCode,
              city: row.city,

              totalPales: row.totalPales,
              totalPrice : row.totalPrice
            };
          }
         
        });

        const formattedResults = Object.values(orders);

        res.status(200).json(formattedResults);
      } else {
        res.status(404).json({ error: "No orders found for this client" });
      }
    });
  } catch (err) {
    console.error("Internal server error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

// UPDATE ORDER AS ADMIN

router.put("/client/update-order-stats/:id", verifyTokenAndAdmin, async (req, res) => {
  const orderId = req.params.id;
  const newValue = req.body.isArrived;
  const newPlace = req.body.currentplace;
 

  try {
    
    const updateOrderStatusQuery = `
    UPDATE 
        \`order\`
    SET 
        currentplace = '${newPlace}',
        isArrived = ${newValue}
    WHERE 
        idorder = ?;
`;

    connection.query(updateOrderStatusQuery,[orderId] ,(err, results) => {
      if (err) {
        console.error("Error fetching order stats:", err);
        res.status(409).json({ error: "Failed to fetch order stats." });
        return;
      }else{
    res.status(200).json({ error: "very nice" });

      }
    });
  } catch (err) {
    console.error("Internal server error:", err);
    res.status(409).json({ error: "Internal server error." });
  }
});
// UPDATE ORDER AS CLIENT

router.put("/confirmation/:id", async (req, res) => {
  const orderId = req.params.id;
  const newValue = req.body.arrived;
  console.log(newValue)
 
try{
  let updateOrderStatusQuery;

  if (newValue === 'Arrived') {
    updateOrderStatusQuery = `
      UPDATE 
      \`order\`
      SET 
      arrived = '${newValue}', isArrived = 1
      WHERE 
      idorder = ?;
    `;
  } else {
    updateOrderStatusQuery = `
      UPDATE 
      \`order\`
      SET 
      arrived = '${newValue}', isArrived = -1
      WHERE 
      idorder = ?;
    `;
  }

    connection.query(updateOrderStatusQuery,[orderId] ,(err, results) => {
      if (err) {
        console.error("Error fetching order stats:", err);
        res.status(500).json({ error: "Failed to fetch order stats." });
        return;
      }
      res.status(200).json("njah");
    });
  } catch (err) {
    console.error("Internal server error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

//DELETE ORDER

router.delete("/client/delete-order/:id", verifyTokenAndAdmin, async (req, res) => {
  const orderId = req.params.id;
  
 

  try {
    const deleteOrderItemQuery = `
    DELETE FROM orderitem
    WHERE id_order = ?;
`;

    const deleteOrderQuery = `
    DELETE FROM \`order\`
    WHERE idorder = ?;
`;

    connection.query(deleteOrderItemQuery,[orderId] ,(err, results) => {
      if (err) {
        console.error("Error fetching order stats:", err);
        res.status(500).json({ error: "Failed to delete orderitem stats." });
        return;
      }else{
        connection.query(deleteOrderQuery,[orderId] ,(err, results) => {
          if (err) {
            console.error("Error fetching order stats:", err);
            res.status(500).json({ error: "Failed to delete order stats." });
            return;
          }else{
            res.status(200).json({ error: "Very Nice Exercice" });

          }
      })
    }});
  } catch (err) {
    console.error("Internal server error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});





module.exports = router;
