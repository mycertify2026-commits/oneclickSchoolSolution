// Adds the commission engine: a single 'commission_config' row (validated
// percentages) and a 'commission_ledger' table that snapshots the exact
// price/percentages/amounts used for every certificate at issuance time —
// so a later config change never rewrites history. Additive-only, safe to
// re-run.
const mysql = require('mysql2/promise');
require('dotenv').config();

async function tableExists(connection, dbName, table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) as count FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table]
  );
  return rows[0].count > 0;
}

async function migrateAddCommissionEngine() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const dbName = process.env.DB_NAME;

  try {
    console.log(`Checking commission-engine tables in database '${dbName}'...`);

    if (await tableExists(connection, dbName, 'commission_config')) {
      console.log('  - commission_config: table already present, skipping create');
    } else {
      await connection.query(`
        CREATE TABLE \`commission_config\` (
          \`id\` CHAR(36) NOT NULL DEFAULT (UUID()),
          \`school_pct\` DECIMAL(5,2) NOT NULL DEFAULT 50.00,
          \`platform_pct\` DECIMAL(5,2) NOT NULL DEFAULT 50.00,
          \`super_admin_pct\` DECIMAL(5,2) NOT NULL DEFAULT 100.00,
          \`super_distributor_pct\` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
          \`distributor_pct\` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
          \`updated_by\` CHAR(36),
          \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  + commission_config: table created');
    }

    const [countRows] = await connection.query('SELECT COUNT(*) as c FROM commission_config');
    if (countRows[0].c === 0) {
      // Neutral default: full platform share to Super Admin until a Super
      // Admin explicitly configures the Super Distributor / Distributor
      // split. school/platform stays at the spec's 50/50 example.
      await connection.query(
        `INSERT INTO commission_config (id, school_pct, platform_pct, super_admin_pct, super_distributor_pct, distributor_pct)
         VALUES (UUID(), 50.00, 50.00, 100.00, 0.00, 0.00)`
      );
      console.log('  + commission_config: seeded default row (school 50 / platform 50; platform split SA 100 / SD 0 / Dist 0)');
    } else {
      console.log('  - commission_config: row already present, skipping seed');
    }

    if (await tableExists(connection, dbName, 'commission_ledger')) {
      console.log('  - commission_ledger: table already present, skipping create');
    } else {
      await connection.query(`
        CREATE TABLE \`commission_ledger\` (
          \`id\` CHAR(36) NOT NULL DEFAULT (UUID()),
          \`certificate_id\` CHAR(36) NOT NULL,
          \`school_id\` CHAR(36) NOT NULL,
          \`distributor_id\` CHAR(36),
          \`super_distributor_id\` CHAR(36),
          \`certificate_type\` VARCHAR(20) NOT NULL,
          \`certificate_price\` DECIMAL(10,2) NOT NULL,
          \`school_pct\` DECIMAL(5,2) NOT NULL,
          \`school_share\` DECIMAL(10,2) NOT NULL,
          \`platform_pct\` DECIMAL(5,2) NOT NULL,
          \`platform_share\` DECIMAL(10,2) NOT NULL,
          \`super_admin_pct\` DECIMAL(5,2) NOT NULL,
          \`super_admin_amount\` DECIMAL(10,2) NOT NULL,
          \`super_distributor_pct\` DECIMAL(5,2) NOT NULL,
          \`super_distributor_amount\` DECIMAL(10,2) NOT NULL,
          \`distributor_pct\` DECIMAL(5,2) NOT NULL,
          \`distributor_amount\` DECIMAL(10,2) NOT NULL,
          \`status\` VARCHAR(20) NOT NULL DEFAULT 'confirmed',
          \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`commission_ledger_certificate_id_key\` (\`certificate_id\`),
          FOREIGN KEY (\`certificate_id\`) REFERENCES \`certificates\`(\`id\`) ON DELETE CASCADE,
          FOREIGN KEY (\`school_id\`) REFERENCES \`schools\`(\`id\`) ON DELETE CASCADE,
          FOREIGN KEY (\`distributor_id\`) REFERENCES \`distributors\`(\`id\`) ON DELETE SET NULL,
          KEY \`idx_ledger_school\` (\`school_id\`),
          KEY \`idx_ledger_distributor\` (\`distributor_id\`),
          KEY \`idx_ledger_super_distributor\` (\`super_distributor_id\`),
          KEY \`idx_ledger_created\` (\`created_at\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  + commission_ledger: table created');
    }

    console.log('\nCommission engine migration completed successfully.');
  } catch (err) {
    console.error('Commission engine migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

migrateAddCommissionEngine();
