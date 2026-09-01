// Creates 6 tables that a live production database was missing entirely
// (discovered during deployment via a full SHOW TABLES audit against
// schema.mysql.sql's table list): camp_requests, cart_items,
// certificate_requests, id_card_hard_copy_requests, id_card_pricing,
// otp_verifications. Predates this session - the original base schema
// setup on that server simply never created these.
//
// IMPORTANT: id/FK columns are CHAR(36), not VARCHAR(36) as schema.mysql.sql
// itself inconsistently uses in a few places - confirmed live that
// schools.id/students.id/users.id are CHAR(36) utf8mb4_unicode_ci, and
// InnoDB requires an exact type match (VARCHAR vs CHAR are NOT
// interchangeable for FK purposes even at the same length/charset) - a
// VARCHAR(36) attempt failed with errno 150 before this was caught.
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

const TABLES = [
  {
    name: 'camp_requests',
    sql: `CREATE TABLE \`camp_requests\` (
      \`id\` CHAR(36) NOT NULL DEFAULT (UUID()),
      \`school_id\` CHAR(36) NOT NULL,
      \`distributor_id\` CHAR(36),
      \`super_distributor_id\` CHAR(36),
      \`camp_name\` VARCHAR(200) NOT NULL,
      \`required_docs\` JSON NOT NULL,
      \`start_date\` DATE NOT NULL,
      \`end_date\` DATE NOT NULL,
      \`status\` VARCHAR(30) NOT NULL DEFAULT 'pending',
      \`attender_name\` VARCHAR(200),
      \`attender_email\` VARCHAR(200),
      \`attender_phone\` VARCHAR(30),
      \`notes\` TEXT,
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      FOREIGN KEY (\`school_id\`) REFERENCES \`schools\`(\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'cart_items',
    sql: `CREATE TABLE \`cart_items\` (
      \`id\` CHAR(36) NOT NULL DEFAULT (UUID()),
      \`school_id\` CHAR(36) NOT NULL,
      \`student_id\` CHAR(36) NOT NULL,
      \`type\` VARCHAR(20) NOT NULL,
      \`purpose\` VARCHAR(255),
      \`price\` DECIMAL(10,2) NOT NULL,
      \`gst_amount\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      \`status\` VARCHAR(20) NOT NULL DEFAULT 'in_cart',
      \`added_by\` CHAR(36),
      \`certificate_id\` CHAR(36),
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'certificate_requests',
    sql: `CREATE TABLE \`certificate_requests\` (
      \`id\` CHAR(36) NOT NULL DEFAULT (UUID()),
      \`school_id\` CHAR(36) NOT NULL,
      \`student_id\` CHAR(36) NOT NULL,
      \`type\` VARCHAR(20) NOT NULL,
      \`purpose\` VARCHAR(255),
      \`price\` DECIMAL(10,2) NOT NULL,
      \`gst_amount\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      \`approval_code\` VARCHAR(6) NOT NULL,
      \`status\` VARCHAR(20) NOT NULL DEFAULT 'pending',
      \`rejection_reason\` TEXT,
      \`approved_by\` CHAR(36),
      \`resolved_at\` DATETIME,
      \`certificate_id\` CHAR(36),
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      FOREIGN KEY (\`approved_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL,
      FOREIGN KEY (\`school_id\`) REFERENCES \`schools\`(\`id\`) ON DELETE CASCADE,
      FOREIGN KEY (\`student_id\`) REFERENCES \`students\`(\`id\`) ON DELETE CASCADE,
      KEY \`idx_certreq_created\` (\`created_at\`),
      KEY \`idx_certreq_school\` (\`school_id\`),
      KEY \`idx_certreq_status\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'id_card_hard_copy_requests',
    sql: `CREATE TABLE \`id_card_hard_copy_requests\` (
      \`id\` CHAR(36) NOT NULL DEFAULT (UUID()),
      \`school_id\` CHAR(36) NOT NULL,
      \`student_id\` CHAR(36) NOT NULL,
      \`distributor_id\` CHAR(36),
      \`super_distributor_id\` CHAR(36),
      \`amount\` DECIMAL(10,2) NOT NULL DEFAULT 0,
      \`wallet_transaction_id\` CHAR(36),
      \`status\` VARCHAR(30) NOT NULL DEFAULT 'pending',
      \`notes\` TEXT,
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      FOREIGN KEY (\`school_id\`) REFERENCES \`schools\`(\`id\`) ON DELETE CASCADE,
      FOREIGN KEY (\`student_id\`) REFERENCES \`students\`(\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'id_card_pricing',
    sql: `CREATE TABLE \`id_card_pricing\` (
      \`id\` CHAR(36) NOT NULL DEFAULT (UUID()),
      \`copy_type\` VARCHAR(20) NOT NULL,
      \`price\` DECIMAL(10,2) NOT NULL DEFAULT 20.00,
      \`updated_by\` CHAR(36),
      \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`id_card_pricing_copy_type_key\` (\`copy_type\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    seed: async (connection) => {
      await connection.query(
        `INSERT INTO id_card_pricing (id, copy_type, price) VALUES (UUID(), 'soft', 20.00), (UUID(), 'hard', 20.00)`
      );
      console.log('  + id_card_pricing: seeded soft=20.00, hard=20.00 (review/adjust from Super Admin > Pricing)');
    },
  },
  {
    name: 'otp_verifications',
    sql: `CREATE TABLE \`otp_verifications\` (
      \`id\` CHAR(36) NOT NULL DEFAULT (UUID()),
      \`user_id\` CHAR(36) NOT NULL,
      \`purpose\` VARCHAR(50) NOT NULL DEFAULT 'cart_submission',
      \`otp_hash\` VARCHAR(255) NOT NULL,
      \`cart_snapshot\` TEXT,
      \`attempts\` INT NOT NULL DEFAULT 0,
      \`used\` SMALLINT NOT NULL DEFAULT 0,
      \`expires_at\` DATETIME NOT NULL,
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE,
      KEY \`idx_otp_user_purpose\` (\`user_id\`,\`purpose\`,\`used\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
];

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
    console.log(`Checking for 6 core tables in database '${dbName}'...`);
    for (const t of TABLES) {
      if (await tableExists(connection, dbName, t.name)) {
        console.log(`  - ${t.name}: already present, skipping`);
        continue;
      }
      await connection.query(t.sql);
      console.log(`  + ${t.name}: table created`);
      if (t.seed) await t.seed(connection);
    }
    console.log('\nCore-tables migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

migrate();
