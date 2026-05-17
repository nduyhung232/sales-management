const express = require('express');
const router = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res) => {
  const userId = req.session.user.user_id;
  const now = new Date();
  const fromDate = req.query.from || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const toDate = req.query.to || now.toISOString().slice(0, 10);

  try {
    const { rows: salesRows } = await pool.query(`
      SELECT COUNT(*) as total_orders,
             COALESCE(SUM(total_amount), 0) as total_revenue,
             COALESCE(SUM(discount), 0) as total_discount,
             COALESCE(SUM(final_amount), 0) as net_revenue
      FROM sales_orders WHERE user_id = $1 AND date(sale_date) >= $2 AND date(sale_date) <= $3
    `, [userId, fromDate, toDate]);

    const sales = salesRows[0] || { total_orders: 0, total_revenue: 0, total_discount: 0, net_revenue: 0 };

    const { rows: topProducts } = await pool.query(`
      SELECT p.product_name, SUM(sl.quantity) as total_qty, SUM(sl.line_amount) as total_amount
      FROM sales_order_lines sl
      JOIN sales_orders s ON sl.sale_id = s.sale_id
      JOIN products p ON sl.product_id = p.product_id
      WHERE s.user_id = $1 AND date(s.sale_date) >= $2 AND date(s.sale_date) <= $3
      GROUP BY sl.product_id, p.product_name ORDER BY total_qty DESC LIMIT 10
    `, [userId, fromDate, toDate]);

    const { rows: dailyRevenue } = await pool.query(`
      SELECT date(sale_date) as date, SUM(final_amount) as revenue
      FROM sales_orders WHERE user_id = $1 AND date(sale_date) >= $2 AND date(sale_date) <= $3
      GROUP BY date(sale_date) ORDER BY date
    `, [userId, fromDate, toDate]);

    res.render('reports', { sales, topProducts, dailyRevenue, fromDate, toDate });
  } catch (e) {
    console.error('Reports error:', e);
    res.render('reports', {
      sales: { total_orders: 0, total_revenue: 0, total_discount: 0, net_revenue: 0 },
      topProducts: [], dailyRevenue: [], fromDate, toDate
    });
  }
});

module.exports = router;
