// Replaces the single all-or-nothing feature-strip toggle with per-icon
// control: each of the 5 card-material icons (PVC/water-resistant/anti-
// fade/scratch-resistant/long-life) can be individually shown or hidden,
// and its caption text customized, by the school. Stored as one JSON
// column (5 fixed slots, each {key, visible, caption1, caption2}) rather
// than 15+ individual columns, since the slot count is fixed and the
// shape is naturally one array. id_card_show_feature_strip (added in
// migrate-add-idcard-bg-opacity.js) is kept as a master on/off switch on
// top of this - additive, not replaced. Idempotent, safe to re-run.
const mysql = require('mysql2/promise');
require('dotenv').config();

const DEFAULT_ICONS = JSON.stringify([
  { key: 'shield', visible: true, caption1: '760 MICRON PVC', caption2: '' },
  { key: 'drop', visible: true, caption1: 'WATER RESISTANT', caption2: '' },
  { key: 'sun', visible: true, caption1: 'ANTI FADE PRINT', caption2: '' },
  { key: 'arrows', visible: true, caption1: 'SCRATCH RESISTANT', caption2: '' },
  { key: 'hourglass', visible: true, caption1: 'LONG LIFE', caption2: '(5-10 YEARS)' },
]);

async function columnExists(connection, dbName, table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) as count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return rows[0].count > 0;
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
    console.log(`Checking 'schools' table for per-icon feature strip column in database '${dbName}'...`);
    const exists = await columnExists(connection, dbName, 'schools', 'id_card_feature_icons');
    if (exists) {
      console.log('  - id_card_feature_icons: already present, skipping');
    } else {
      await connection.query(
        `ALTER TABLE schools ADD COLUMN \`id_card_feature_icons\` TEXT DEFAULT (?)`,
        [DEFAULT_ICONS]
      ).catch(async () => {
        // Older MySQL (< 8.0.13) doesn't support non-literal expression
        // defaults on ALTER - add the column plain, then backfill.
        await connection.query(`ALTER TABLE schools ADD COLUMN \`id_card_feature_icons\` TEXT`);
        await connection.query(`UPDATE schools SET id_card_feature_icons = ? WHERE id_card_feature_icons IS NULL`, [DEFAULT_ICONS]);
      });
      console.log('  + id_card_feature_icons: added');
    }

    console.log('\nID Card per-icon feature strip migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

migrate();
