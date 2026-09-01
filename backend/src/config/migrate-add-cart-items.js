// Creates the `cart_items` table if it doesn't exist yet. Discovered
// missing on a live production database during deployment - the base
// schema-creation step never ran successfully there (predates this
// session), so this table, which the cart-based OTP checkout flow
// (cartController.js) depends on entirely, was simply never provisioned.
// Idempotent, safe to re-run.
const mysql = require('mysql2/promise');
require('dotenv').config();

async function tableExists(connection, dbName, table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) as count FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table]
  );
  return rows[0].count > 0;
}

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const dbName = process.env.DB_NAME;

  try {
    console.log(`Checking for 'cart_items' table in database '${dbName}'...`);
    if (await tableExists(connection, dbName, 'cart_items')) {
      console.log('  - cart_items: already present, skipping');
    } else {
      await connection.query(`
        CREATE TABLE \`cart_items\` (
          \`id\` VARCHAR(36) NOT NULL DEFAULT (UUID()),
          \`school_id\` VARCHAR(36) NOT NULL,
          \`student_id\` VARCHAR(36) NOT NULL,
          \`type\` VARCHAR(20) NOT NULL,
          \`purpose\` VARCHAR(255),
          \`price\` DECIMAL(10,2) NOT NULL,
          \`gst_amount\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          \`status\` VARCHAR(20) NOT NULL DEFAULT 'in_cart',
          \`added_by\` VARCHAR(36),
          \`certificate_id\` VARCHAR(36),
          \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
          \`certificate_variant\` VARCHAR(20) DEFAULT 'original',
          \`leaving_date\` DATE,
          \`since_when\` DATE,
          \`leaving_reason\` TEXT,
          \`leaving_remark\` TEXT,
          \`check_by_label\` VARCHAR(50) DEFAULT 'Check By',
          PRIMARY KEY (\`id\`),
          FOREIGN KEY (\`school_id\`) REFERENCES \`schools\`(\`id\`) ON DELETE CASCADE,
          FOREIGN KEY (\`student_id\`) REFERENCES \`students\`(\`id\`) ON DELETE CASCADE,
          KEY \`idx_cart_school_status\` (\`school_id\`,\`status\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log('  + cart_items: table created');
    }
    console.log('\ncart_items migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

migrate();
