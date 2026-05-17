const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../db');

router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1 AND is_active = 1', [username]);
  const user = rows[0];

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.render('login', { error: 'Invalid username or password' });
  }

  req.session.user = { user_id: user.user_id, username: user.username, full_name: user.full_name };
  res.redirect('/products');
});

router.get('/register', (req, res) => {
  res.render('register', { error: null });
});

router.post('/register', async (req, res) => {
  const { username, password, full_name } = req.body;
  const hash = bcrypt.hashSync(password, 10);

  try {
    await pool.query('INSERT INTO users (username, password_hash, full_name) VALUES ($1, $2, $3)', [username, hash, full_name]);
    res.redirect('/login');
  } catch (e) {
    res.render('register', { error: 'Username already exists' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

module.exports = router;
