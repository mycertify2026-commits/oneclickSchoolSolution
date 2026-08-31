// Adds 'certificate_pricing' (LC / Bonafide base prices, configurable by
// Super Admin instead of hardcoded in controller files). ID Card pricing
// already has its own DB-backed table (id_card_pricing, soft/hard copy) —
// this does not duplicate that. Additive-only, safe to re-run.
const mysql = require('mysql2/promise');
require('dotenv').config();

const DEFAULTS = [
  { type: 'lc', price: 50.00 },
  { type: 'bonafide', price: 30.00 },
];

async function tableExists(connection, dbName, table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) as count FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table]
  );
  return rows[0].count > 0;
}

async function migrateAddCertificatePricing() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const dbName = process.env.DB_NAME;

  try {
    console.log(`Checking 'certificate_pricing' table in database '${dbName}'...`);
    if (await tableExists(connection, dbName, 'certificate_pricing')) {
      console.log('  - certificate_pricing: table already present, skipping create');
    } else {
      await connection.query(`
        CREATE TABLE \`certificate_pricing\` (
          \`type\` VARCHAR(20) NOT NULL,
          \`price\` DECIMAL(10,2) NOT NULL,
          \`updated_by\` CHAR(36),
          \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`type\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  + certificate_pricing: table created');
    }

    const [countRows] = await connection.query('SELECT COUNT(*) as c FROM certificate_pricing');
    if (countRows[0].c === 0) {
      for (const d of DEFAULTS) {
        await connection.query('INSERT INTO certificate_pricing (type, price) VALUES (?, ?)', [d.type, d.price]);
      }
      console.log(`  + certificate_pricing: seeded ${DEFAULTS.map(d => `${d.type}=${d.price}`).join(', ')}`);
    } else {
      console.log('  - certificate_pricing: rows already present, skipping seed');
    }

    console.log('\nCertificate pricing migration completed successfully.');
  } catch (err) {
    console.error('Certificate pricing migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

migrateAddCertificatePricing();
