const express = require('express');
const router = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res) => {
  const userId = req.session.user.user_id;
  const { rows: orders } = await pool.query('SELECT * FROM import_orders WHERE user_id = $1 ORDER BY import_date DESC', [userId]);
  const { rows: products } = await pool.query('SELECT * FROM products WHERE user_id = $1 AND is_active = 1 ORDER BY product_name', [userId]);
  res.render('imports', { orders, products });
});

router.post('/create', async (req, res) => {
  const userId = req.session.user.user_id;
  const { supplier_name, note, product_ids, quantities, unit_prices } = req.body;

  const importCode = 'IMP' + Date.now();
  const lines = [];

  const pIds = Array.isArray(product_ids) ? product_ids : product_ids ? [product_ids] : [];
  const qtys = Array.isArray(quantities) ? quantities : quantities ? [quantities] : [];
  const prices = Array.isArray(unit_prices) ? unit_prices : unit_prices ? [unit_prices] : [];

  let totalAmount = 0;
  for (let i = 0; i < pIds.length; i++) {
    if (!pIds[i]) continue;
    const qty = parseFloat(qtys[i]) || 0;
    const price = parseFloat(prices[i]) || 0;
    const amount = qty * price;
    totalAmount += amount;
    lines.push({ product_id: parseInt(pIds[i]), quantity: qty, unit_price: price, line_amount: amount });
  }

  if (lines.length === 0) return res.redirect('/imports');

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        'INSERT INTO import_orders (user_id, import_code, supplier_name, total_amount, note) VALUES ($1, $2, $3, $4, $5) RETURNING import_id',
        [userId, importCode, supplier_name || '', totalAmount, note || '']
      );
      const importId = rows[0].import_id;

      for (const line of lines) {
        await client.query(
          'INSERT INTO import_order_lines (import_id, product_id, quantity, unit_price, line_amount) VALUES ($1, $2, $3, $4, $5)',
          [importId, line.product_id, line.quantity, line.unit_price, line.line_amount]
        );
        await client.query('UPDATE products SET stock_qty = stock_qty + $1 WHERE product_id = $2', [line.quantity, line.product_id]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('Error creating import:', e);
  }

  res.redirect('/imports');
});

router.get('/detail/:id', async (req, res) => {
  const userId = req.session.user.user_id;
  const { rows } = await pool.query('SELECT * FROM import_orders WHERE import_id = $1 AND user_id = $2', [req.params.id, userId]);
  const order = rows[0];
  if (!order) return res.redirect('/imports');

  const { rows: lines } = await pool.query(`
    SELECT il.*, p.product_name, p.product_code
    FROM import_order_lines il JOIN products p ON il.product_id = p.product_id
    WHERE il.import_id = $1
  `, [req.params.id]);

  res.render('import_detail', { order, lines });
});

router.get('/edit/:id', async (req, res) => {
  const userId = req.session.user.user_id;
  const { rows } = await pool.query('SELECT * FROM import_orders WHERE import_id = $1 AND user_id = $2', [req.params.id, userId]);
  const order = rows[0];
  if (!order) return res.redirect('/imports');

  const { rows: lines } = await pool.query(`
    SELECT il.*, p.product_name, p.product_code
    FROM import_order_lines il JOIN products p ON il.product_id = p.product_id
    WHERE il.import_id = $1
  `, [req.params.id]);

  const { rows: products } = await pool.query('SELECT * FROM products WHERE user_id = $1 AND is_active = 1 ORDER BY product_name', [userId]);

  res.render('import_edit', { order, lines, products });
});

router.post('/edit/:id', async (req, res) => {
  const userId = req.session.user.user_id;
  const importId = req.params.id;
  const { supplier_name, note, product_ids, quantities, unit_prices } = req.body;

  // Verify ownership
  const { rows: existing } = await pool.query('SELECT * FROM import_orders WHERE import_id = $1 AND user_id = $2', [importId, userId]);
  if (!existing[0]) return res.redirect('/imports');

  const pIds = Array.isArray(product_ids) ? product_ids : product_ids ? [product_ids] : [];
  const qtys = Array.isArray(quantities) ? quantities : quantities ? [quantities] : [];
  const prices = Array.isArray(unit_prices) ? unit_prices : unit_prices ? [unit_prices] : [];

  const newLines = [];
  let totalAmount = 0;
  for (let i = 0; i < pIds.length; i++) {
    if (!pIds[i]) continue;
    const qty = parseFloat(qtys[i]) || 0;
    const price = parseFloat(prices[i]) || 0;
    const amount = qty * price;
    totalAmount += amount;
    newLines.push({ product_id: parseInt(pIds[i]), quantity: qty, unit_price: price, line_amount: amount });
  }

  if (newLines.length === 0) return res.redirect('/imports');

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Revert old stock
      const { rows: oldLines } = await client.query('SELECT product_id, quantity FROM import_order_lines WHERE import_id = $1', [importId]);
      for (const ol of oldLines) {
        await client.query('UPDATE products SET stock_qty = stock_qty - $1 WHERE product_id = $2', [ol.quantity, ol.product_id]);
      }

      // Delete old lines
      await client.query('DELETE FROM import_order_lines WHERE import_id = $1', [importId]);

      // Update header
      await client.query('UPDATE import_orders SET supplier_name = $1, total_amount = $2, note = $3 WHERE import_id = $4',
        [supplier_name || '', totalAmount, note || '', importId]);

      // Insert new lines and update stock
      for (const line of newLines) {
        await client.query(
          'INSERT INTO import_order_lines (import_id, product_id, quantity, unit_price, line_amount) VALUES ($1, $2, $3, $4, $5)',
          [importId, line.product_id, line.quantity, line.unit_price, line.line_amount]
        );
        await client.query('UPDATE products SET stock_qty = stock_qty + $1 WHERE product_id = $2', [line.quantity, line.product_id]);
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('Error editing import:', e);
  }

  res.redirect('/imports/detail/' + importId);
});

module.exports = router;
