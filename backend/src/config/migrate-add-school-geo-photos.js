// Adds mandatory geo-tagged inside/outside photo columns to 'schools'.
// Columns are nullable (existing schools aren't broken); "mandatory" is
// enforced at the school-creation endpoints, not the schema. Additive-only,
// safe to re-run.
const mysql = require('mysql2/promise');
require('dotenv').config();

async function columnExists(connection, dbName, table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) as count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return rows[0].count > 0;
}

async function migrateAddSchoolGeoPhotos() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const dbName = process.env.DB_NAME;

  try {
    console.log(`Checking schools table for geo-tagged photo columns in database '${dbName}'...`);
    const columns = [
      { name: 'inside_photo_url', definition: 'VARCHAR(500)' },
      { name: 'inside_photo_lat', definition: 'DECIMAL(10,7)' },
      { name: 'inside_photo_lng', definition: 'DECIMAL(10,7)' },
      { name: 'inside_photo_captured_at', definition: 'DATETIME' },
      { name: 'outside_photo_url', definition: 'VARCHAR(500)' },
      { name: 'outside_photo_lat', definition: 'DECIMAL(10,7)' },
      { name: 'outside_photo_lng', definition: 'DECIMAL(10,7)' },
      { name: 'outside_photo_captured_at', definition: 'DATETIME' },
    ];
    for (const col of columns) {
      const exists = await columnExists(connection, dbName, 'schools', col.name);
      if (exists) {
        console.log(`  - schools.${col.name}: already present, skipping`);
        continue;
      }
      await connection.query(`ALTER TABLE schools ADD COLUMN \`${col.name}\` ${col.definition}`);
      console.log(`  + schools.${col.name}: added`);
    }
    console.log('\nSchool geo-photo migration completed successfully.');
  } catch (err) {
    console.error('School geo-photo migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

migrateAddSchoolGeoPhotos();
