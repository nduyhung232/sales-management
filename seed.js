require('dotenv').config();
const { pool, initDb } = require('./db');
const bcrypt = require('bcryptjs');

async function seed() {
  await initDb();

  // Check if user exists
  const { rows: existingUsers } = await pool.query("SELECT * FROM users WHERE username = $1", ['demo']);
  let userId;

  if (existingUsers.length > 0) {
    userId = existingUsers[0].user_id;
    console.log('User "demo" already exists, using id:', userId);
  } else {
    const hash = bcrypt.hashSync('demo123', 10);
    const { rows } = await pool.query(
      "INSERT INTO users (username, password_hash, full_name) VALUES ($1, $2, $3) RETURNING user_id",
      ['demo', hash, 'Demo User']
    );
    userId = rows[0].user_id;
    console.log('Created user "demo" (password: demo123), id:', userId);
  }

  // Categories
  const categories = ['Đồ uống', 'Thực phẩm', 'Gia vị', 'Đồ dùng'];
  const catIds = [];
  for (const name of categories) {
    const { rows: ex } = await pool.query("SELECT category_id FROM categories WHERE user_id = $1 AND category_name = $2", [userId, name]);
    if (ex.length > 0) {
      catIds.push(ex[0].category_id);
    } else {
      const { rows } = await pool.query(
        "INSERT INTO categories (user_id, category_name, description) VALUES ($1, $2, $3) RETURNING category_id",
        [userId, name, name + ' các loại']
      );
      catIds.push(rows[0].category_id);
    }
  }
  console.log('Categories ready:', catIds.length);

  // Products
  const products = [
    { code: 'CF001', name: 'Cà phê sữa', unit: 'ly', price: 30000, cat: 0 },
    { code: 'CF002', name: 'Cà phê đen', unit: 'ly', price: 25000, cat: 0 },
    { code: 'TR001', name: 'Trà đào', unit: 'ly', price: 35000, cat: 0 },
    { code: 'TR002', name: 'Trà sữa', unit: 'ly', price: 40000, cat: 0 },
    { code: 'BM001', name: 'Bánh mì thịt', unit: 'cái', price: 20000, cat: 1 },
    { code: 'BM002', name: 'Bánh mì trứng', unit: 'cái', price: 15000, cat: 1 },
    { code: 'MI001', name: 'Mì tôm', unit: 'gói', price: 5000, cat: 1 },
    { code: 'NC001', name: 'Nước mắm', unit: 'chai', price: 25000, cat: 2 },
    { code: 'DG001', name: 'Đường', unit: 'kg', price: 20000, cat: 2 },
    { code: 'KG001', name: 'Khăn giấy', unit: 'gói', price: 10000, cat: 3 },
  ];

  const productIds = [];
  for (const p of products) {
    const { rows: ex } = await pool.query("SELECT product_id FROM products WHERE user_id = $1 AND product_code = $2", [userId, p.code]);
    if (ex.length > 0) {
      productIds.push(ex[0].product_id);
    } else {
      const { rows } = await pool.query(
        "INSERT INTO products (user_id, product_code, product_name, unit, sell_price, category_id, stock_qty) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING product_id",
        [userId, p.code, p.name, p.unit, p.price, catIds[p.cat], 100]
      );
      productIds.push(rows[0].product_id);
    }
  }
  console.log('Products ready:', productIds.length);

  // Sales orders - spread across this month
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  for (let day = 1; day <= Math.min(now.getDate(), 15); day++) {
    const saleDate = new Date(year, month, day, 10, 0, 0).toISOString();
    const saleCode = 'SAL-SEED-' + day;

    const { rows: exSale } = await pool.query("SELECT sale_id FROM sales_orders WHERE user_id = $1 AND sale_code = $2", [userId, saleCode]);
    if (exSale.length > 0) continue;

    // Random 2-4 items per order
    const numItems = 2 + Math.floor(Math.random() * 3);
    const lines = [];
    let total = 0;

    for (let i = 0; i < numItems; i++) {
      const pIdx = Math.floor(Math.random() * productIds.length);
      const qty = 1 + Math.floor(Math.random() * 5);
      const price = products[pIdx].price;
      const amount = qty * price;
      total += amount;
      lines.push({ product_id: productIds[pIdx], quantity: qty, unit_price: price, line_amount: amount });
    }

    const discount = Math.floor(Math.random() * 3) * 5000;
    const finalAmount = total - discount;

    const { rows } = await pool.query(
      "INSERT INTO sales_orders (user_id, sale_code, customer_name, customer_phone, total_amount, discount, final_amount, payment_method, sale_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING sale_id",
      [userId, saleCode, 'Khách ' + day, '090' + String(1000000 + day), total, discount, finalAmount, day % 2 === 0 ? 'CASH' : 'TRANSFER', saleDate]
    );
    const saleId = rows[0].sale_id;

    for (const line of lines) {
      await pool.query(
        "INSERT INTO sales_order_lines (sale_id, product_id, quantity, unit_price, line_amount) VALUES ($1, $2, $3, $4, $5)",
        [saleId, line.product_id, line.quantity, line.unit_price, line.line_amount]
      );
    }
  }
  console.log('Sales orders seeded');

  // Import orders
  for (let day = 1; day <= 5; day++) {
    const importDate = new Date(year, month, day, 8, 0, 0).toISOString();
    const importCode = 'IMP-SEED-' + day;

    const { rows: exImp } = await pool.query("SELECT import_id FROM import_orders WHERE user_id = $1 AND import_code = $2", [userId, importCode]);
    if (exImp.length > 0) continue;

    const numItems = 2 + Math.floor(Math.random() * 3);
    const lines = [];
    let total = 0;

    for (let i = 0; i < numItems; i++) {
      const pIdx = Math.floor(Math.random() * productIds.length);
      const qty = 10 + Math.floor(Math.random() * 50);
      const price = Math.floor(products[pIdx].price * 0.6);
      const amount = qty * price;
      total += amount;
      lines.push({ product_id: productIds[pIdx], quantity: qty, unit_price: price, line_amount: amount });
    }

    const { rows } = await pool.query(
      "INSERT INTO import_orders (user_id, import_code, supplier_name, total_amount, note, import_date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING import_id",
      [userId, importCode, 'NCC ' + day, total, 'Nhập hàng đợt ' + day, importDate]
    );
    const importId = rows[0].import_id;

    for (const line of lines) {
      await pool.query(
        "INSERT INTO import_order_lines (import_id, product_id, quantity, unit_price, line_amount) VALUES ($1, $2, $3, $4, $5)",
        [importId, line.product_id, line.quantity, line.unit_price, line.line_amount]
      );
    }
  }
  console.log('Import orders seeded');

  console.log('\nDone! Login with: demo / demo123');
}

seed().catch(e => { console.error(e); process.exit(1); });
