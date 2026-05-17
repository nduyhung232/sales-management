const express = require('express');
const router = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res) => {
  const userId = req.session.user.user_id;
  const { rows: categories } = await pool.query('SELECT * FROM categories WHERE user_id = $1 ORDER BY category_name', [userId]);
  res.render('categories', { categories });
});

router.post('/add', async (req, res) => {
  const userId = req.session.user.user_id;
  const { category_name, description } = req.body;
  await pool.query('INSERT INTO categories (user_id, category_name, description) VALUES ($1, $2, $3)', [userId, category_name, description]);
  res.redirect('/categories');
});

router.post('/delete/:id', async (req, res) => {
  const userId = req.session.user.user_id;
  await pool.query('DELETE FROM categories WHERE category_id = $1 AND user_id = $2', [req.params.id, userId]);
  res.redirect('/categories');
});

module.exports = router;
