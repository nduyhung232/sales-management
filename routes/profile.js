const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../db');

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT user_id, username, full_name, phone, email FROM users WHERE user_id = $1', [req.session.user.user_id]);
  res.render('profile', { profile: rows[0] });
});

router.post('/', async (req, res) => {
  const userId = req.session.user.user_id;
  const { full_name, phone, email } = req.body;

  await pool.query('UPDATE users SET full_name = $1, phone = $2, email = $3, updated_at = NOW() WHERE user_id = $4',
    [full_name || '', phone || '', email || '', userId]);

  req.session.user.full_name = full_name;
  res.redirect('/profile');
});

router.get('/password', (req, res) => {
  res.render('change_password', { error: null, success: null });
});

router.post('/password', async (req, res) => {
  const userId = req.session.user.user_id;
  const { current_password, new_password, confirm_password } = req.body;

  if (!new_password || new_password.length < 4) {
    return res.render('change_password', { error: 'New password must be at least 4 characters', success: null });
  }
  if (new_password !== confirm_password) {
    return res.render('change_password', { error: 'Passwords do not match', success: null });
  }

  const { rows } = await pool.query('SELECT password_hash FROM users WHERE user_id = $1', [userId]);
  if (!bcrypt.compareSync(current_password, rows[0].password_hash)) {
    return res.render('change_password', { error: 'Current password is incorrect', success: null });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE user_id = $2', [hash, userId]);

  res.render('change_password', { error: null, success: 'Password changed successfully' });
});

module.exports = router;
