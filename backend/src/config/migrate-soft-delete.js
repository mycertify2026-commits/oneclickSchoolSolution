// Incremental migration: adds soft-delete support (deleted_at columns) and
// removes the hard UNIQUE constraints that caused the "delete a record,
// re-add the same name/email, get told it already exists" bug.
//
// Safe to run multiple times - every step checks current state first.
// Safe to run on a brand-new database created from the updated schema.sql
// too (everything will already be correct, so this just confirms it).
const mysql = require('mysql2/promise');
require('dotenv').config();

async function columnExists(connection, dbName, table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) as count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return rows[0].count > 0;
}

async function indexExists(connection, dbName, table, indexName) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) as count FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [dbName, table, indexName]
  );
  return rows[0].count > 0;
}

async function migrateSoftDelete() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const dbName = process.env.DB_NAME;

  try {
    console.log(`Running soft-delete migration against database '${dbName}'...\n`);

    // ---- 1. Add deleted_at columns where missing ----
    const deletedAtTargets = ['users', 'schools', 'distributors'];
    for (const table of deletedAtTargets) {
      const exists = await columnExists(connection, dbName, table, 'deleted_at');
      if (exists) {
        console.log(`  - ${table}.deleted_at: already present, skipping`);
      } else {
        await connection.query(`ALTER TABLE ${table} ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL`);
        await connection.query(`ALTER TABLE ${table} ADD INDEX idx_${table}_deleted_at (deleted_at)`);
        console.log(`  + ${table}.deleted_at: added`);
      }
    }

    // ---- 2. Drop hard UNIQUE constraints that block re-use after soft delete ----
    // MySQL auto-names a single-column UNIQUE constraint after the column
    // itself by default, which is what this schema's original CREATE TABLE
    // statements relied on (e.g. `email VARCHAR(150) NOT NULL UNIQUE`
    // creates an index literally named `email`).
    const uniqueDrops = [
      { table: 'users', index: 'email' },
      { table: 'schools', index: 'admin_user_id' },
      { table: 'schools', index: 'login_id' },
      { table: 'distributors', index: 'user_id' },
      { table: 'master_data', index: 'uq_master_category_value' }
    ];

    for (const { table, index } of uniqueDrops) {
      const exists = await indexExists(connection, dbName, table, index);
      if (!exists) {
        console.log(`  - ${table}.${index} unique index: not present, skipping`);
        continue;
      }
      try {
        await connection.query(`ALTER TABLE ${table} DROP INDEX ${index}`);
        console.log(`  + ${table}.${index} unique index: dropped`);
      } catch (err) {
        console.log(`  ! ${table}.${index}: could not drop (${err.message}) - continuing`);
      }
    }

    // ---- 3. Add the non-unique replacement indexes for query performance ----
    const plainIndexes = [
      { table: 'schools', name: 'idx_schools_login_id', column: 'login_id' },
      { table: 'distributors', name: 'idx_distributors_user', column: 'user_id' }
    ];
    for (const { table, name, column } of plainIndexes) {
      const exists = await indexExists(connection, dbName, table, name);
      if (exists) {
        console.log(`  - ${table}.${name}: already present, skipping`);
      } else {
        await connection.query(`ALTER TABLE ${table} ADD INDEX ${name} (${column})`);
        console.log(`  + ${table}.${name}: added`);
      }
    }

    console.log('\nSoft-delete migration completed successfully.');
  } catch (err) {
    console.error('Soft-delete migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

migrateSoftDelete();
