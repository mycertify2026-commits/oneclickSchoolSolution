// Adds the 'receipts' table (spec: every successfully-issued certificate
// gets a receipt for 2x its configured price). Additive-only, safe to re-run.
const mysql = require('mysql2/promise');
require('dotenv').config();

async function tableExists(connection, dbName, table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) as count FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table]
  );
  return rows[0].count > 0;
}

async function migrateAddReceipts() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const dbName = process.env.DB_NAME;

  try {
    console.log(`Checking 'receipts' table in database '${dbName}'...`);
    if (await tableExists(connection, dbName, 'receipts')) {
      console.log('  - receipts: table already present, skipping create');
    } else {
      await connection.query(`
        CREATE TABLE \`receipts\` (
          \`id\` CHAR(36) NOT NULL DEFAULT (UUID()),
          \`certificate_id\` CHAR(36) NOT NULL,
          \`school_id\` CHAR(36) NOT NULL,
          \`student_id\` CHAR(36) NOT NULL,
          \`receipt_number\` VARCHAR(50) NOT NULL,
          \`certificate_type\` VARCHAR(20) NOT NULL,
          \`certificate_variant\` VARCHAR(20) DEFAULT 'original',
          \`base_price\` DECIMAL(10,2) NOT NULL,
          \`receipt_amount\` DECIMAL(10,2) NOT NULL,
          \`pdf_path\` VARCHAR(500),
          \`generated_by\` CHAR(36),
          \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`receipts_receipt_number_key\` (\`receipt_number\`),
          UNIQUE KEY \`receipts_certificate_id_key\` (\`certificate_id\`),
          FOREIGN KEY (\`certificate_id\`) REFERENCES \`certificates\`(\`id\`) ON DELETE CASCADE,
          FOREIGN KEY (\`school_id\`) REFERENCES \`schools\`(\`id\`) ON DELETE CASCADE,
          FOREIGN KEY (\`student_id\`) REFERENCES \`students\`(\`id\`) ON DELETE CASCADE,
          FOREIGN KEY (\`generated_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  + receipts: table created');
    }
    console.log('\nReceipts migration completed successfully.');
  } catch (err) {
    console.error('Receipts migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

migrateAddReceipts();
