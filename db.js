const DB_MODE = process.env.DB_MODE || 'sqlite'; // 'sqlite' or 'postgres'

let db;

if (DB_MODE === 'postgres') {
  db = require('./db-postgres');
} else {
  db = require('./db-sqlite');
}

module.exports = db;
