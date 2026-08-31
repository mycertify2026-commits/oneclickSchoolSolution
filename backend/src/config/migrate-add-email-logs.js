// Adds the email_logs table — one row per email send attempt, written by the
// single low-level sendMail() choke point in utils/email.js. No foreign keys:
// this is an audit trail across users/schools/certificates, not a strict
// relational entity, so a deleted related record must never block logging.
// Additive-only, safe to re-run.
const mysql = require('mysql2/promise');
require('dotenv').config();

async function tableExists(connection, dbName, table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) as count FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table]
  );
  return rows[0].count > 0;
}

async function migrateAddEmailLogs() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const dbName = process.env.DB_NAME;

  try {
    console.log(`Checking for email_logs table in database '${dbName}'...`);
    const exists = await tableExists(connection, dbName, 'email_logs');
    if (exists) {
      console.log('  - email_logs: already present, skipping');
    } else {
      await connection.query(`
        CREATE TABLE email_logs (
          id VARCHAR(36) NOT NULL DEFAULT (UUID()),
          recipient VARCHAR(255) NOT NULL,
          sender VARCHAR(255),
          email_type VARCHAR(100),
          related_user_id VARCHAR(36),
          related_school_id VARCHAR(36),
          related_certificate_id VARCHAR(36),
          status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
          error_message TEXT,
          sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          INDEX idx_email_logs_recipient (recipient),
          INDEX idx_email_logs_type (email_type),
          INDEX idx_email_logs_related_user (related_user_id),
          INDEX idx_email_logs_related_school (related_school_id),
          INDEX idx_email_logs_related_certificate (related_certificate_id)
        )
      `);
      console.log('  + email_logs: created');
    }
    console.log('\nEmail logs migration completed successfully.');
  } catch (err) {
    console.error('Email logs migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

migrateAddEmailLogs();
