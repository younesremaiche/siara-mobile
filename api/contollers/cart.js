const {verifyTokenAndSeller, verifyToken,verifyTokenAndAuthorization, verifyTokenAndAdmin } = require("./verifytoken");
const { query } = require("../utils/promiseQuery.js");
const connection = require('../db');
const router = require("express").Router();

const Fuse = require('fuse.js');


// Add product to the cart
router.post('/cart/:userId/add/:productId', async (req, res) => {
  try {
      const userId = req.params.userId; // Extracting userId from params
      const productId = req.params.productId; // Extracting productId from params
      const { poids, production , quantity , price } = req.body; // Extracting color and size from request body

      // Check if the product is already in the user's cart
      const cartExistsQuery = 'SELECT * FROM CART WHERE id_user = ? AND id_pale = ? AND poids = ? AND production = ?';
      const cart = await query(cartExistsQuery, [userId, productId, poids, production ]);

      if (cart.length === 0) {
          // Add the product to the cart
          const addToCartQuery = 'INSERT INTO CART (id_user, id_pale, poids,production , quantity,price) VALUES (?, ?, ?, ? , ? ,?)';
          await query(addToCartQuery, [userId, productId, poids, production , quantity , price]);
          res.status(200).json({ message: 'Product added to cart successfully.' });
      } else {
          res.status(200).json({ message: 'Product is already in the cart.' });
      }
  } catch (error) {
      console.error('Error adding product to cart:', error);
      res.status(500).json({ error: 'Failed to add product to cart.' });
  }
});

//GET USER CART
router.get('/:userId', async (req, res) => {
  try {
      const userId = req.params.userId; // Extracting userId from params

      // Query to get the user's cart items
      const getCartQuery = `
          SELECT p.idpales, p.palename, p.desc, p.price, p.paleimage ,p.type,p.poids , p.quantity , p.production
          FROM CART c
          JOIN pales p ON c.id_pale = p.idpales
          WHERE c.id_user = ?;
      `;
      const cartItems = await query(getCartQuery, [userId]);

      if (cartItems.length === 0) {
          res.status(404).json({ message: 'Cart is empty or user does not exist.' });
      } else {
          res.status(200).json(cartItems);
      }
  } catch (error) {
      console.error('Error retrieving cart:', error);
      res.status(500).json({ error: 'Failed to retrieve cart.' });
  }
});

// DELETE PRODUCT FROM CART
router.delete('/:userId/delete/:productId/:poids/:production', async (req, res) => {
  try {
      const userId = req.params.userId; // Extracting userId from params
      const productId = req.params.productId; // Extracting productId from params
      const poids = req.params.poids; // Extracting userId from params
      const production = req.params.production; // Extracting productId from params

      // Query to delete the product from the user's cart
      const deleteProductQuery = `
          DELETE FROM CART 
          WHERE id_user = ? AND id_pale = ? AND poids = ? AND production = ?;
      `;
      const result = await query(deleteProductQuery, [userId, productId , poids , production]);

      if (result.affectedRows === 0) {
          res.status(404).json({ message: 'Product not found in cart or user does not exist.' });
      } else {
          res.status(200).json({ message: 'Product removed from cart successfully.' });
      }
  } catch (error) {
      console.error('Error removing product from cart:', error);
      res.status(500).json({ error: 'Failed to remove product from cart.' });
  }
});

// DELETE ALL PRODUCT FROM CART
router.delete('/:userId/delete-all/cart', async (req, res) => {
    try {
        const userId = req.params.userId; // Extracting userId from params
        // Query to delete all products from the user's cart
        const deleteCartQuery = `
            DELETE FROM CART 
            WHERE id_user = ?;
        `;
        const result = await query(deleteCartQuery, [userId]);

        if (result.affectedRows === 0) {
            res.status(404).json({ message: 'No products found in cart for the user or user does not exist.' });
        } else {
            res.status(200).json({ message: 'Products removed from cart successfully.' });
        }
    } catch (error) {
        console.error('Error removing products from cart:', error);
        res.status(500).json({ error: 'Failed to remove products from cart.' });
    }
});









module.exports = router ;