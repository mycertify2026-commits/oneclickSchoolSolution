// Creates the tables for the "Request from Distributor" educational document
// feature. Two-level design: edu_doc_requests is the BATCH/parent (one row
// per Submit+OTP-verify action — one Request ID, one status, one total,
// covering however many students were in that submission), and
// edu_doc_request_students is one row per student within that batch — this
// split is what lets a single Request ID legitimately cover multiple
// students, matching the spec's "Request ID: EDR-...; Students: 3; Total:
// ₹804" shape (a single-table design can't do this once request_number is
// UNIQUE). educational_document_types is the pricing lookup (mirrors
// certificate_pricing/id_card_pricing). edu_doc_request_status_history is
// one row per status change on the parent, for audit. Idempotent, safe to
// re-run.
//
// id/FK columns are CHAR(36), matching migrate-add-missing-core-tables.js's
// confirmed-live finding that schools.id/students.id/users.id are CHAR(36)
// utf8mb4_unicode_ci — InnoDB requires an exact type match for FKs, so
// VARCHAR(36) here would fail with errno 150.
const mysql = require('mysql2/promise');
require('dotenv').config();

async function tableExists(connection, dbName, table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) as count FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table]
  );
  return rows[0].count > 0;
}

async function columnExists(connection, dbName, table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) as count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return rows[0].count > 0;
}

const TABLES = [
  {
    name: 'educational_document_types',
    sql: `CREATE TABLE \`educational_document_types\` (
      \`doc_type\` VARCHAR(40) NOT NULL,
      \`name\` VARCHAR(150) NOT NULL,
      \`price\` DECIMAL(10,2) NOT NULL,
      \`distributor_pct\` DECIMAL(5,2) NOT NULL DEFAULT 0,
      \`super_distributor_pct\` DECIMAL(5,2) NOT NULL DEFAULT 0,
      \`active\` TINYINT(1) NOT NULL DEFAULT 1,
      \`updated_by\` CHAR(36),
      \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`doc_type\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    seed: async (connection) => {
      await connection.query(
        `INSERT INTO educational_document_types (doc_type, name, price) VALUES
          ('caste-certificate', 'Caste Certificate', 268.00),
          ('income-certificate', 'Income Certificate', 189.00),
          ('age-domicile-nationality', 'Age, Domicile and Nationality Certificate', 199.00),
          ('non-creamy-layer', 'Non-Creamy Layer Certificate', 199.00)`
      );
      console.log('  + educational_document_types: seeded 4 document types');
    },
  },
  {
    name: 'edu_doc_requests',
    sql: `CREATE TABLE \`edu_doc_requests\` (
      \`id\` CHAR(36) NOT NULL DEFAULT (UUID()),
      \`request_number\` VARCHAR(50) NOT NULL,
      \`school_id\` CHAR(36) NOT NULL,
      \`distributor_id\` CHAR(36),
      \`super_distributor_id\` CHAR(36),
      \`total_amount\` DECIMAL(10,2) NOT NULL,
      \`wallet_transaction_id\` CHAR(36),
      \`status\` VARCHAR(20) NOT NULL DEFAULT 'submitted',
      \`otp_verification_id\` CHAR(36),
      \`created_by\` CHAR(36),
      \`submitted_at\` DATETIME,
      \`closed_at\` DATETIME,
      \`closed_by\` CHAR(36),
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`edu_doc_requests_request_number_key\` (\`request_number\`),
      FOREIGN KEY (\`school_id\`) REFERENCES \`schools\`(\`id\`) ON DELETE CASCADE,
      KEY \`idx_edu_doc_requests_distributor\` (\`distributor_id\`),
      KEY \`idx_edu_doc_requests_status\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'edu_doc_request_students',
    sql: `CREATE TABLE \`edu_doc_request_students\` (
      \`id\` CHAR(36) NOT NULL DEFAULT (UUID()),
      \`request_id\` CHAR(36) NOT NULL,
      \`student_id\` CHAR(36) NOT NULL,
      \`doc_type\` VARCHAR(40) NOT NULL,
      \`price\` DECIMAL(10,2) NOT NULL,
      \`distributor_amount\` DECIMAL(10,2) NOT NULL DEFAULT 0,
      \`super_distributor_amount\` DECIMAL(10,2) NOT NULL DEFAULT 0,
      \`pdf_path\` VARCHAR(500) NOT NULL,
      \`pdf_data\` MEDIUMBLOB,
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      FOREIGN KEY (\`request_id\`) REFERENCES \`edu_doc_requests\`(\`id\`) ON DELETE CASCADE,
      FOREIGN KEY (\`student_id\`) REFERENCES \`students\`(\`id\`) ON DELETE CASCADE,
      KEY \`idx_edu_doc_request_students_request\` (\`request_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'edu_doc_request_status_history',
    sql: `CREATE TABLE \`edu_doc_request_status_history\` (
      \`id\` CHAR(36) NOT NULL DEFAULT (UUID()),
      \`request_id\` CHAR(36) NOT NULL,
      \`old_status\` VARCHAR(20),
      \`new_status\` VARCHAR(20) NOT NULL,
      \`changed_by\` CHAR(36),
      \`changed_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      \`remarks\` TEXT,
      PRIMARY KEY (\`id\`),
      FOREIGN KEY (\`request_id\`) REFERENCES \`edu_doc_requests\`(\`id\`) ON DELETE CASCADE
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
    console.log(`Checking for educational document request tables in database '${dbName}'...`);
    for (const t of TABLES) {
      if (await tableExists(connection, dbName, t.name)) {
        console.log(`  - ${t.name}: already present, skipping`);
        continue;
      }
      await connection.query(t.sql);
      console.log(`  + ${t.name}: table created`);
      if (t.seed) await t.seed(connection);
    }

    // Retrofit columns for the distributor/super-distributor commission
    // split, added in a follow-up pass after this migration first shipped —
    // covers a database where these tables already existed before this
    // column was added to the CREATE TABLE definitions above.
    const RETROFIT_COLUMNS = [
      ['educational_document_types', 'distributor_pct', 'DECIMAL(5,2) NOT NULL DEFAULT 0'],
      ['educational_document_types', 'super_distributor_pct', 'DECIMAL(5,2) NOT NULL DEFAULT 0'],
      ['edu_doc_request_students', 'distributor_amount', 'DECIMAL(10,2) NOT NULL DEFAULT 0'],
      ['edu_doc_request_students', 'super_distributor_amount', 'DECIMAL(10,2) NOT NULL DEFAULT 0'],
    ];
    for (const [table, column, definition] of RETROFIT_COLUMNS) {
      if (await columnExists(connection, dbName, table, column)) continue;
      await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      console.log(`  + ${table}.${column}: added`);
    }

    console.log('\nEducational document requests migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

migrate();
