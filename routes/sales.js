const express = require('express');
const router = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res) => {
  const userId = req.session.user.user_id;
  const { rows: orders } = await pool.query('SELECT * FROM sales_orders WHERE user_id = $1 ORDER BY sale_date DESC', [userId]);
  const { rows: products } = await pool.query('SELECT * FROM products WHERE user_id = $1 AND is_active = 1 ORDER BY product_name', [userId]);
  console.log('[Sales] user_id:', userId, 'orders found:', orders.length);
  res.render('sales', { orders, products });
});

router.post('/create', async (req, res) => {
  const userId = req.session.user.user_id;
  const { customer_name, customer_phone, discount, payment_method, note, product_ids, quantities, unit_prices } = req.body;

  console.log('[Sales POST] body:', JSON.stringify(req.body));

  const saleCode = 'SAL' + Date.now();
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

  if (lines.length === 0) return res.redirect('/sales');

  const discountVal = parseFloat(discount) || 0;
  const finalAmount = totalAmount - discountVal;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        'INSERT INTO sales_orders (user_id, sale_code, customer_name, customer_phone, total_amount, discount, final_amount, payment_method, note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING sale_id',
        [userId, saleCode, customer_name || '', customer_phone || '', totalAmount, discountVal, finalAmount, payment_method || 'CASH', note || '']
      );
      const saleId = rows[0].sale_id;

      for (const line of lines) {
        await client.query(
          'INSERT INTO sales_order_lines (sale_id, product_id, quantity, unit_price, line_amount) VALUES ($1, $2, $3, $4, $5)',
          [saleId, line.product_id, line.quantity, line.unit_price, line.line_amount]
        );
        await client.query('UPDATE products SET stock_qty = stock_qty - $1 WHERE product_id = $2', [line.quantity, line.product_id]);
      }
      await client.query('COMMIT');
      console.log('[Sales] Created sale:', saleCode, 'saleId:', saleId, 'lines:', lines.length);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('Error creating sale:', e);
  }

  res.redirect('/sales');
});

router.get('/detail/:id', async (req, res) => {
  const userId = req.session.user.user_id;
  const { rows } = await pool.query('SELECT * FROM sales_orders WHERE sale_id = $1 AND user_id = $2', [req.params.id, userId]);
  const order = rows[0];
  if (!order) return res.redirect('/sales');

  const { rows: lines } = await pool.query(`
    SELECT sl.*, p.product_name, p.product_code
    FROM sales_order_lines sl JOIN products p ON sl.product_id = p.product_id
    WHERE sl.sale_id = $1
  `, [req.params.id]);

  res.render('sale_detail', { order, lines });
});

module.exports = router;
