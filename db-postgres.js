const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize tables
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      phone TEXT,
      email TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS categories (
      category_id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(user_id),
      category_name TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS products (
      product_id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(user_id),
      category_id INTEGER REFERENCES categories(category_id),
      product_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      unit TEXT,
      sell_price NUMERIC DEFAULT 0,
      stock_qty NUMERIC DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, product_code)
    );

    CREATE TABLE IF NOT EXISTS import_orders (
      import_id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(user_id),
      import_code TEXT NOT NULL,
      supplier_name TEXT,
      total_amount NUMERIC DEFAULT 0,
      note TEXT,
      import_date TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, import_code)
    );

    CREATE TABLE IF NOT EXISTS import_order_lines (
      line_id SERIAL PRIMARY KEY,
      import_id INTEGER NOT NULL REFERENCES import_orders(import_id),
      product_id INTEGER NOT NULL REFERENCES products(product_id),
      quantity NUMERIC NOT NULL,
      unit_price NUMERIC NOT NULL,
      line_amount NUMERIC NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sales_orders (
      sale_id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(user_id),
      sale_code TEXT NOT NULL,
      customer_name TEXT,
      customer_phone TEXT,
      total_amount NUMERIC DEFAULT 0,
      discount NUMERIC DEFAULT 0,
      final_amount NUMERIC DEFAULT 0,
      payment_method TEXT DEFAULT 'CASH',
      note TEXT,
      sale_date TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, sale_code)
    );

    CREATE TABLE IF NOT EXISTS sales_order_lines (
      line_id SERIAL PRIMARY KEY,
      sale_id INTEGER NOT NULL REFERENCES sales_orders(sale_id),
      product_id INTEGER NOT NULL REFERENCES products(product_id),
      quantity NUMERIC NOT NULL,
      unit_price NUMERIC NOT NULL,
      line_amount NUMERIC NOT NULL
    );
  `);
}

module.exports = { pool, initDb };
