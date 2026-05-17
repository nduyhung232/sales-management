const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.SQLITE_PATH || path.join(__dirname, 'data', 'sales.db');
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

let db = null;

// Save DB to disk periodically
function saveDb() {
  if (db) {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  }
}

// Convert PostgreSQL $1,$2... to ? and fix syntax differences
function convertSql(text) {
  let sql = text;
  // Reorder params: $1,$2... → ? but need to handle param order
  // sql.js uses ? positional, same order as $1,$2,$3...
  sql = sql.replace(/\$\d+/g, '?');
  sql = sql.replace(/\bSERIAL\b/gi, 'INTEGER');
  sql = sql.replace(/\bNUMERIC\b/gi, 'REAL');
  sql = sql.replace(/\bTIMESTAMP\b/gi, 'TEXT');
  sql = sql.replace(/\bDEFAULT NOW\(\)/gi, "DEFAULT (datetime('now'))");
  sql = sql.replace(/\bILIKE\b/gi, 'LIKE');
  sql = sql.replace(/\bNOW\(\)/gi, "datetime('now')");
  sql = sql.replace(/(\w+)::date/gi, 'date($1)');
  return sql;
}

function execQuery(text, params = []) {
  // Sanitize params - convert undefined/null to null-safe values for sql.js
  const safeParams = params.map(p => p === undefined ? null : p);
  let sqliteText = convertSql(text);

  // Handle RETURNING clause
  let returningCol = null;
  const returningMatch = sqliteText.match(/\bRETURNING\s+(\w+)/i);
  if (returningMatch) {
    returningCol = returningMatch[1];
    sqliteText = sqliteText.replace(/\s*RETURNING\s+\w+/i, '');
  }

  const statements = sqliteText.split(';').map(s => s.trim()).filter(s => s.length > 0);

  if (statements.length > 1) {
    for (const stmt of statements) {
      db.run(stmt);
    }
    saveDb();
    return { rows: [], rowCount: 0 };
  }

  const sql = statements[0];
  const upperSql = sql.trim().toUpperCase();

  if (upperSql.startsWith('BEGIN') || upperSql.startsWith('COMMIT') || upperSql.startsWith('ROLLBACK')) {
    // SQLite in sql.js: skip transaction commands (single-writer, auto-commit)
    return { rows: [], rowCount: 0 };
  }

  if (upperSql.startsWith('SELECT') || upperSql.startsWith('WITH')) {
    const stmt = db.prepare(sql);
    stmt.bind(safeParams);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return { rows, rowCount: rows.length };
  }

  if (upperSql.startsWith('INSERT') || upperSql.startsWith('UPDATE') || upperSql.startsWith('DELETE')) {
    const stmt = db.prepare(sql);
    if (safeParams.length > 0) stmt.bind(safeParams);
    stmt.step();
    stmt.free();
    const changes = db.getRowsModified();
    if (returningCol) {
      const lastId = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
      saveDb();
      return { rows: [{ [returningCol]: lastId }], rowCount: changes };
    }
    saveDb();
    return { rows: [], rowCount: changes };
  }

  const stmtFallback = db.prepare(sql);
  if (safeParams.length > 0) stmtFallback.bind(safeParams);
  stmtFallback.step();
  stmtFallback.free();
  saveDb();
  return { rows: [], rowCount: 0 };
}

// Adapter: mimic pg pool interface
const pool = {
  query: async (text, params = []) => execQuery(text, params),
  connect: async () => ({
    query: async (text, params = []) => execQuery(text, params),
    release: () => {}
  })
};

async function initDb() {
  const SQL = await initSqlJs();

  // Load existing DB or create new
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run("PRAGMA foreign_keys = ON");

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      phone TEXT,
      email TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      category_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(user_id),
      category_name TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      product_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(user_id),
      category_id INTEGER REFERENCES categories(category_id),
      product_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      unit TEXT,
      sell_price REAL DEFAULT 0,
      stock_qty REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, product_code)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS import_orders (
      import_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(user_id),
      import_code TEXT NOT NULL,
      supplier_name TEXT,
      total_amount REAL DEFAULT 0,
      note TEXT,
      import_date TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, import_code)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS import_order_lines (
      line_id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_id INTEGER NOT NULL REFERENCES import_orders(import_id),
      product_id INTEGER NOT NULL REFERENCES products(product_id),
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      line_amount REAL NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS sales_orders (
      sale_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(user_id),
      sale_code TEXT NOT NULL,
      customer_name TEXT,
      customer_phone TEXT,
      total_amount REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      final_amount REAL DEFAULT 0,
      payment_method TEXT DEFAULT 'CASH',
      note TEXT,
      sale_date TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, sale_code)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS sales_order_lines (
      line_id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales_orders(sale_id),
      product_id INTEGER NOT NULL REFERENCES products(product_id),
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      line_amount REAL NOT NULL
    )
  `);

  saveDb();
  console.log('[DB] SQLite mode - data stored at:', dbPath);
}

module.exports = { pool, initDb };
