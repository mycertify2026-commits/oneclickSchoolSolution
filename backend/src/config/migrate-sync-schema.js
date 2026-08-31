// Incremental migration that brings an existing MySQL 'certifypro' database
// up to date with schema.mysql.sql. Every change checks for its own
// precondition first (column/table/enum-value existence), so this is safe
// to run repeatedly and safe to run on a database that already has some of
// these changes applied by hand or by an earlier partial migration.
const mysql = require('mysql2/promise');
require('dotenv').config();

const SCHOOL_COLUMNS = [
  { name: 'bonafide_template_url', definition: 'VARCHAR(500)' },
  { name: 'bonafide_template_data', definition: 'MEDIUMBLOB' },
  { name: 'lc_template_url', definition: 'VARCHAR(500)' },
  { name: 'lc_template_data', definition: 'MEDIUMBLOB' },
  { name: 'id_card_template_url', definition: 'VARCHAR(500)' },
  { name: 'id_card_template_data', definition: 'MEDIUMBLOB' },
  { name: 'principal_name', definition: 'VARCHAR(200)' },
  { name: 'recog_no', definition: 'VARCHAR(100)' },
  { name: 'area_of_operation', definition: 'VARCHAR(255)' },
  { name: 'super_distributor_id', definition: 'VARCHAR(36)' },
  { name: 'id_card_bg_data', definition: 'TEXT' },
];

const DISTRIBUTOR_COLUMNS = [
  { name: 'super_distributor_id', definition: 'VARCHAR(36)' },
  { name: 'area_of_operation', definition: 'VARCHAR(255)' },
];

const CART_ITEMS_COLUMNS = [
  { name: 'certificate_variant', definition: "VARCHAR(20) DEFAULT 'original'" },
  { name: 'leaving_date', definition: 'DATE' },
  { name: 'since_when', definition: 'DATE' },
  { name: 'leaving_reason', definition: 'TEXT' },
  { name: 'leaving_remark', definition: 'TEXT' },
  { name: 'check_by_label', definition: "VARCHAR(50) DEFAULT 'Check By'" },
];

const CERTIFICATES_COLUMNS = [
  { name: 'cart_item_id', definition: 'VARCHAR(36)' },
  { name: 'certificate_variant', definition: "VARCHAR(20) DEFAULT 'original'" },
  { name: 'leaving_date', definition: 'DATE' },
  { name: 'since_when', definition: 'DATE' },
  { name: 'leaving_reason', definition: 'TEXT' },
  { name: 'leaving_remark', definition: 'TEXT' },
  { name: 'check_by_label', definition: "VARCHAR(50) DEFAULT 'Check By'" },
];

async function columnExists(connection, dbName, table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) as count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return rows[0].count > 0;
}

async function tableExists(connection, dbName, table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) as count FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table]
  );
  return rows[0].count > 0;
}

async function addMissingColumns(connection, dbName, table, columns) {
  let added = 0;
  for (const col of columns) {
    const exists = await columnExists(connection, dbName, table, col.name);
    if (exists) {
      console.log(`  - ${table}.${col.name}: already present, skipping`);
      continue;
    }
    await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col.name}\` ${col.definition}`);
    console.log(`  + ${table}.${col.name}: added`);
    added++;
  }
  return added;
}

async function migrateSyncSchema() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const dbName = process.env.DB_NAME;

  try {
    console.log(`Syncing '${dbName}' schema to match schema.mysql.sql (additive only)...\n`);

    // 1. users.role ENUM — widen to include 'superDistributor' if missing.
    const [roleColRows] = await connection.query(
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'`,
      [dbName]
    );
    const roleColumnType = roleColRows[0]?.COLUMN_TYPE || '';
    if (roleColumnType.includes("'superDistributor'")) {
      console.log("  - users.role ENUM: 'superDistributor' already present, skipping");
    } else {
      await connection.query(
        `ALTER TABLE users MODIFY role ENUM('superAdmin','schoolAdmin','distributor','superDistributor') NOT NULL`
      );
      console.log("  + users.role ENUM: added 'superDistributor'");
    }

    // 2. distributors — super_distributor_id, area_of_operation
    console.log('\nChecking distributors columns...');
    await addMissingColumns(connection, dbName, 'distributors', DISTRIBUTOR_COLUMNS);

    // 3. schools — template columns, principal/recog, SD hierarchy
    console.log('\nChecking schools columns...');
    await addMissingColumns(connection, dbName, 'schools', SCHOOL_COLUMNS);

    // 4. cart_items — LC variant/leaving fields
    console.log('\nChecking cart_items columns...');
    await addMissingColumns(connection, dbName, 'cart_items', CART_ITEMS_COLUMNS);

    // 5. certificates — same fields, plus cart_item_id
    console.log('\nChecking certificates columns...');
    await addMissingColumns(connection, dbName, 'certificates', CERTIFICATES_COLUMNS);

    // 6. id_card_pricing table + seed defaults
    console.log('\nChecking id_card_pricing table...');
    if (await tableExists(connection, dbName, 'id_card_pricing')) {
      console.log('  - id_card_pricing: table already present, skipping create');
    } else {
      await connection.query(`
        CREATE TABLE \`id_card_pricing\` (
          \`id\` VARCHAR(36) NOT NULL,
          \`copy_type\` VARCHAR(20) NOT NULL,
          \`price\` DECIMAL(10,2) NOT NULL DEFAULT 20.00,
          \`updated_by\` VARCHAR(36),
          \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`id_card_pricing_copy_type_key\` (\`copy_type\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  + id_card_pricing: table created');
    }
    const [pricingCount] = await connection.query('SELECT COUNT(*) as c FROM id_card_pricing');
    if (pricingCount[0].c === 0) {
      await connection.query(
        `INSERT INTO id_card_pricing (id, copy_type, price) VALUES (UUID(), 'soft', 20.00), (UUID(), 'hard', 100.00)`
      );
      console.log('  + id_card_pricing: seeded soft=20.00, hard=100.00');
    } else {
      console.log('  - id_card_pricing: rows already present, skipping seed');
    }

    // 7. camp_requests
    console.log('\nChecking camp_requests table...');
    if (await tableExists(connection, dbName, 'camp_requests')) {
      console.log('  - camp_requests: table already present, skipping create');
    } else {
      await connection.query(`
        CREATE TABLE \`camp_requests\` (
          \`id\` CHAR(36) NOT NULL,
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  + camp_requests: table created');
    }

    // 8. certificate_requests
    console.log('\nChecking certificate_requests table...');
    if (await tableExists(connection, dbName, 'certificate_requests')) {
      console.log('  - certificate_requests: table already present, skipping create');
    } else {
      await connection.query(`
        CREATE TABLE \`certificate_requests\` (
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
          FOREIGN KEY (\`student_id\`) REFERENCES \`students\`(\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  + certificate_requests: table created');
    }

    // 9. id_card_hard_copy_requests
    console.log('\nChecking id_card_hard_copy_requests table...');
    if (await tableExists(connection, dbName, 'id_card_hard_copy_requests')) {
      console.log('  - id_card_hard_copy_requests: table already present, skipping create');
    } else {
      await connection.query(`
        CREATE TABLE \`id_card_hard_copy_requests\` (
          \`id\` CHAR(36) NOT NULL,
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  + id_card_hard_copy_requests: table created');
    }

    console.log('\nSchema sync completed successfully.');
  } catch (err) {
    console.error('Schema sync migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

migrateSyncSchema();
