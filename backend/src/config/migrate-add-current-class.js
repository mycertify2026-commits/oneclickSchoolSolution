// Adds students.current_standard / current_division — the student's
// present class, distinct from admission_standard/admission_division
// (kept untouched as permanent historical record). Nullable: falls back to
// the admission fields everywhere it's read, so existing students behave
// exactly as before until a school explicitly sets a current class.
// Additive-only, safe to re-run.
const mysql = require('mysql2/promise');
require('dotenv').config();

async function columnExists(connection, dbName, table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) as count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return rows[0].count > 0;
}

async function migrateAddCurrentClass() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const dbName = process.env.DB_NAME;

  try {
    console.log(`Checking students table for current-class columns in database '${dbName}'...`);
    const columns = [
      { name: 'current_standard', definition: 'VARCHAR(20)' },
      { name: 'current_division', definition: 'VARCHAR(10)' },
    ];
    for (const col of columns) {
      const exists = await columnExists(connection, dbName, 'students', col.name);
      if (exists) {
        console.log(`  - students.${col.name}: already present, skipping`);
        continue;
      }
      await connection.query(`ALTER TABLE students ADD COLUMN \`${col.name}\` ${col.definition}`);
      console.log(`  + students.${col.name}: added`);
    }
    console.log('\nCurrent-class migration completed successfully.');
  } catch (err) {
    console.error('Current-class migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

migrateAddCurrentClass();
