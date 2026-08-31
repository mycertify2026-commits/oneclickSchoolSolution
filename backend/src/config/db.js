// Dual-database support:
//  - Default: PostgreSQL (Replit built-in) via DATABASE_URL / PG* env vars
//  - MySQL mode: set DB_TYPE=mysql (e.g. for local XAMPP/WAMP) with DB_HOST/DB_USER/DB_PASSWORD/DB_NAME
const isMysql = (process.env.DB_TYPE || '').toLowerCase() === 'mysql';

// SQL expression for "YYYY-MM" month bucket, portable across both databases.
function monthExpr(col) {
  return isMysql ? `DATE_FORMAT(${col}, '%Y-%m')` : `TO_CHAR(${col}, 'YYYY-MM')`;
}

let wrappedPool;
let testConnection;

if (isMysql) {
  // ---------------- MySQL (mysql2 is natively ?-placeholder based) ----------------
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'certifypro',
    waitForConnections: true,
    connectionLimit: 20,
    dateStrings: false,
    // Keep JS Date params and DB NOW() on the same clock regardless of server timezone
    timezone: 'Z',
  });

  wrappedPool = pool; // mysql2 pool already exposes query/execute/getConnection/end

  testConnection = async function testConnection() {
    const conn = await pool.getConnection();
    await conn.query('SELECT 1');
    conn.release();
  };
} else {
  // ---------------- PostgreSQL ----------------
  const { Pool } = require('pg');

  // Convert mysql2-style ? placeholders to PostgreSQL $1, $2, ...
  function toPositional(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }

  // Use Replit's built-in PostgreSQL env vars (DATABASE_URL or PG* vars)
  const poolConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
      }
    : {
        host: process.env.PGHOST || process.env.DB_HOST,
        port: parseInt(process.env.PGPORT || process.env.DB_PORT) || 5432,
        database: process.env.PGDATABASE || process.env.DB_NAME,
        user: process.env.PGUSER || process.env.DB_USER,
        password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
      };

  const pool = new Pool({
    ...poolConfig,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (err) => {
    console.error('Unexpected DB pool error:', err.message);
  });

  // Returns [rows, fields] matching mysql2's promise interface.
  // rows.affectedRows and rows.insertId are set for compatibility.
  async function wrappedQuery(sql, params = []) {
    const pgSql = toPositional(sql);
    const result = await pool.query(pgSql, params.length ? params : undefined);
    const rows = result.rows;
    rows.affectedRows = result.rowCount;
    rows.insertId = rows[0]?.id ?? null;
    return [rows, result.fields || []];
  }

  // mysql2-compatible pool wrapper
  wrappedPool = {
    query: wrappedQuery,
    execute: wrappedQuery,

    async getConnection() {
      const client = await pool.connect();
      return {
        async query(sql, params = []) {
          const pgSql = toPositional(sql);
          const result = await client.query(pgSql, params.length ? params : undefined);
          const rows = result.rows;
          rows.affectedRows = result.rowCount;
          rows.insertId = rows[0]?.id ?? null;
          return [rows, result.fields || []];
        },
        beginTransaction: () => client.query('BEGIN'),
        commit:           () => client.query('COMMIT'),
        rollback:         () => client.query('ROLLBACK'),
        ping:             () => client.query('SELECT 1'),
        release:          () => client.release(),
        end:              () => client.release(),
      };
    },

    async end() {
      await pool.end();
    },
  };

  testConnection = async function testConnection() {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
  };
}

module.exports = { pool: wrappedPool, testConnection, isMysql, monthExpr };
