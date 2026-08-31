// Incremental migration for existing One Click School Solutions databases (created before
// the ID Card Designer and certificate header/footer features were added).
// Safe to run on a fresh database too - every ALTER checks if the column
// already exists first, so running this twice (or running it on a brand
// new database that already has these columns from the updated schema.sql)
// does nothing destructive either way.
const mysql = require('mysql2/promise');
require('dotenv').config();

const NEW_COLUMNS = [
  { name: 'cert_header', definition: 'TEXT' },
  { name: 'cert_footer', definition: 'TEXT' },
  { name: 'id_card_primary_color', definition: "VARCHAR(100) DEFAULT 'linear-gradient(135deg,#1a6fd4,#1557b0)'" },
  { name: 'id_card_school_name', definition: 'VARCHAR(200)' },
  { name: 'id_card_subtitle', definition: "VARCHAR(200) DEFAULT 'Student ID Card'" },
  { name: 'id_card_footer_text', definition: "VARCHAR(255) DEFAULT 'If found, please contact the school office.'" },
  { name: 'id_card_show_register_number', definition: 'TINYINT(1) NOT NULL DEFAULT 1' },
  { name: 'id_card_show_aadhaar', definition: 'TINYINT(1) NOT NULL DEFAULT 1' },
  { name: 'id_card_show_dob', definition: 'TINYINT(1) NOT NULL DEFAULT 1' },
  { name: 'id_card_show_address', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
  { name: 'id_card_show_emergency_contact', definition: 'TINYINT(1) NOT NULL DEFAULT 1' }
];

async function columnExists(connection, dbName, table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) as count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return rows[0].count > 0;
}

async function migrateAddIdCardDesign() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    console.log(`Checking 'schools' table for ID Card Designer columns in database '${process.env.DB_NAME}'...`);
    let added = 0;

    for (const col of NEW_COLUMNS) {
      const exists = await columnExists(connection, process.env.DB_NAME, 'schools', col.name);
      if (exists) {
        console.log(`  - ${col.name}: already present, skipping`);
        continue;
      }
      await connection.query(`ALTER TABLE schools ADD COLUMN ${col.name} ${col.definition}`);
      console.log(`  + ${col.name}: added`);
      added++;
    }

    console.log(added > 0
      ? `Migration completed: ${added} new column(s) added to 'schools'.`
      : 'Migration completed: no changes needed, schema already up to date.');
  } catch (err) {
    console.error('Incremental migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

migrateAddIdCardDesign();
