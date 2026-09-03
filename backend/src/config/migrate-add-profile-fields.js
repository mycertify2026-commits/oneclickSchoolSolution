// Local-dev (MySQL) counterpart to the Postgres additions in
// migrate-pg-catchup.js: distributors get PAN + payout bank fields (this
// table is shared by both Distributor and Super Distributor profiles), and
// schools get a class_from/class_to range ("which standards this school
// covers", shown on the Add/Edit School forms). Additive-only, safe to re-run.
const mysql = require('mysql2/promise');
require('dotenv').config();

async function columnExists(connection, dbName, table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) as count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return rows[0].count > 0;
}

async function addMissingColumns(connection, dbName, table, columns) {
  for (const col of columns) {
    const exists = await columnExists(connection, dbName, table, col.name);
    if (exists) {
      console.log(`  - ${table}.${col.name}: already present, skipping`);
      continue;
    }
    await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col.name}\` ${col.definition}`);
    console.log(`  + ${table}.${col.name}: added`);
  }
}

const DISTRIBUTOR_PAYOUT_COLUMNS = [
  { name: 'pan_number', definition: 'VARCHAR(20)' },
  { name: 'bank_account_holder', definition: 'VARCHAR(150)' },
  { name: 'bank_name', definition: 'VARCHAR(150)' },
  { name: 'bank_account_number', definition: 'VARCHAR(40)' },
  { name: 'bank_ifsc', definition: 'VARCHAR(20)' },
];

const SCHOOL_CLASS_RANGE_COLUMNS = [
  { name: 'class_from', definition: 'VARCHAR(20)' },
  { name: 'class_to', definition: 'VARCHAR(20)' },
];

const RELATED_STUDENT_COLUMN = [{ name: 'related_student_id', definition: 'VARCHAR(36)' }];

async function ensureRelationPricing(connection, dbName) {
  const [tables] = await connection.query(
    `SELECT COUNT(*) as count FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'certificate_pricing'`,
    [dbName]
  );
  if (tables[0].count === 0) {
    console.log('  - certificate_pricing: table not present yet, skipping relation-price seed (run migrate:add-certificate-pricing first)');
    return;
  }
  const [rows] = await connection.query(`SELECT type FROM certificate_pricing WHERE type = 'relation'`);
  if (rows.length === 0) {
    await connection.query(`INSERT INTO certificate_pricing (type, price) VALUES ('relation', 30.00)`);
    console.log('  + certificate_pricing: seeded relation=30.00');
  } else {
    console.log('  - certificate_pricing.relation: already present, skipping seed');
  }
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
    console.log(`Checking profile-field columns in database '${dbName}'...\n`);
    console.log('distributors (PAN + payout bank details):');
    await addMissingColumns(connection, dbName, 'distributors', DISTRIBUTOR_PAYOUT_COLUMNS);
    console.log('\nschools (class range):');
    await addMissingColumns(connection, dbName, 'schools', SCHOOL_CLASS_RANGE_COLUMNS);
    console.log('\ncertificates (relation certificate — references a second student):');
    await addMissingColumns(connection, dbName, 'certificates', RELATED_STUDENT_COLUMN);
    console.log('\ncart_items (relation certificate — references a second student):');
    await addMissingColumns(connection, dbName, 'cart_items', RELATED_STUDENT_COLUMN);
    console.log('\ncertificate_pricing (relation certificate price):');
    await ensureRelationPricing(connection, dbName);
    console.log('\nProfile-fields migration completed successfully.');
  } catch (err) {
    console.error('Profile-fields migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

migrate();
