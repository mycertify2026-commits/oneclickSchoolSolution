// Shared helpers for the test suite. Tests run against a real MySQL
// instance pointed to by the same .env the app uses - set NODE_ENV=test
// and point DB_NAME at a disposable test database before running `npm test`.
require('dotenv').config();
const { pool } = require('../src/config/db');

async function closePool() {
  await pool.end();
}

async function clearTable(table) {
  await pool.query(`DELETE FROM ${table}`);
}

module.exports = { pool, closePool, clearTable };
