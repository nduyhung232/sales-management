const express = require('express');
const router = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res) => {
  const userId = req.session.user.user_id;
  const search = req.query.q || '';
  let products;

  if (search) {
    const { rows } = await pool.query(`
      SELECT p.*, c.category_name FROM products p
      LEFT JOIN categories c ON p.category_id = c.category_id
      WHERE p.user_id = $1 AND p.is_active = 1
      AND (p.product_name ILIKE $2 OR p.product_code ILIKE $2)
      ORDER BY p.product_name
    `, [userId, `%${search}%`]);
    products = rows;
  } else {
    const { rows } = await pool.query(`
      SELECT p.*, c.category_name FROM products p
      LEFT JOIN categories c ON p.category_id = c.category_id
      WHERE p.user_id = $1 AND p.is_active = 1
      ORDER BY p.product_name
    `, [userId]);
    products = rows;
  }

  const { rows: categories } = await pool.query('SELECT * FROM categories WHERE user_id = $1', [userId]);
  res.render('products', { products, categories, search });
});

router.post('/add', async (req, res) => {
  const userId = req.session.user.user_id;
  const { product_code, product_name, unit, sell_price, category_id } = req.body;

  try {
    await pool.query(`
      INSERT INTO products (user_id, product_code, product_name, unit, sell_price, category_id, stock_qty)
      VALUES ($1, $2, $3, $4, $5, $6, 0)
    `, [userId, product_code, product_name, unit, parseFloat(sell_price) || 0, category_id || null]);
  } catch (e) {
    // duplicate code
  }
  res.redirect('/products');
});

router.post('/edit/:id', async (req, res) => {
  const { product_name, unit, sell_price, category_id } = req.body;
  await pool.query(`
    UPDATE products SET product_name = $1, unit = $2, sell_price = $3, category_id = $4, updated_at = NOW()
    WHERE product_id = $5
  `, [product_name, unit, parseFloat(sell_price) || 0, category_id || null, req.params.id]);
  res.redirect('/products');
});

module.exports = router;
