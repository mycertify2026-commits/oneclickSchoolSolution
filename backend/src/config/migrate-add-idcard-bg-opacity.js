// Adds ID Card Designer enhancements: a border-line color option, a toggle
// for the 5-icon feature strip, and an opacity level for the background
// image. Also fixes a pre-existing bug: id_card_bg_data was created as
// TEXT/utf8mb4 (migrate-add-idcard-design.js never explicitly typed it,
// so it inherited a text default) which throws
// ER_TRUNCATED_WRONG_VALUE_FOR_FIELD on any real image upload, since raw
// binary isn't valid utf8mb4 - confirmed live before writing this file.
// Widening it to MEDIUMBLOB (matching id_card_template_data's already-
// correct type) is additive/safe: no school currently has data in this
// column (nothing to lose), and MEDIUMBLOB can store everything TEXT could.
// Idempotent, safe to re-run.
const mysql = require('mysql2/promise');
require('dotenv').config();

const NEW_COLUMNS = [
  { name: 'id_card_bg_opacity', definition: 'DECIMAL(3,2) NOT NULL DEFAULT 0.15' },
  { name: 'id_card_border_color', definition: 'VARCHAR(20)' },
  { name: 'id_card_show_feature_strip', definition: 'TINYINT(1) NOT NULL DEFAULT 1' },
];

async function columnExists(connection, dbName, table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) as count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return rows[0].count > 0;
}

async function columnType(connection, dbName, table, column) {
  const [rows] = await connection.query(
    `SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return rows[0]?.DATA_TYPE || null;
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
    console.log(`Checking 'schools' table for ID Card background/border columns in database '${dbName}'...`);

    for (const col of NEW_COLUMNS) {
      const exists = await columnExists(connection, dbName, 'schools', col.name);
      if (exists) {
        console.log(`  - ${col.name}: already present, skipping`);
        continue;
      }
      await connection.query(`ALTER TABLE schools ADD COLUMN \`${col.name}\` ${col.definition}`);
      console.log(`  + ${col.name}: added`);
    }

    const bgDataType = await columnType(connection, dbName, 'schools', 'id_card_bg_data');
    if (bgDataType && bgDataType !== 'mediumblob') {
      await connection.query('ALTER TABLE schools MODIFY COLUMN `id_card_bg_data` MEDIUMBLOB');
      console.log(`  ~ id_card_bg_data: widened from ${bgDataType} to MEDIUMBLOB (was rejecting real image uploads)`);
    } else {
      console.log('  - id_card_bg_data: already MEDIUMBLOB, skipping');
    }

    console.log('\nID Card background/border migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

migrate();
