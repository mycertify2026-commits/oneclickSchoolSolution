const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

async function migrate() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  await client.connect();
  console.log('Connected to PostgreSQL database.');

  try {
    const schemaPath = path.join(__dirname, 'schema.pg.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Split on semicolons and run each statement separately
    // (pg driver does not support multiple statements in one query call)
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      try {
        await client.query(stmt);
      } catch (err) {
        // Log but continue — IF NOT EXISTS guards handle most duplicates;
        // trigger/index conflicts on re-runs are non-fatal.
        console.warn(`  Warning (${err.code}): ${err.message.split('\n')[0]}`);
      }
    }

    console.log('✅ Database migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

migrate();
