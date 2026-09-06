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

const SCHOOL_ID_CARD_AND_SIGNATURE_COLUMNS = [
  { name: 'id_card_orientation', definition: "VARCHAR(10) NOT NULL DEFAULT 'horizontal'" },
  { name: 'lc_signature_label', definition: 'VARCHAR(50)' },
  { name: 'bonafide_signature_label', definition: 'VARCHAR(50)' },
  { name: 'idcard_signature_label', definition: 'VARCHAR(50)' },
];

const STUDENT_ID_COLUMNS = [
  { name: 'apaar_id', definition: 'VARCHAR(12)' },
  { name: 'student_id_no', definition: 'VARCHAR(20)' },
  { name: 'pen_no', definition: 'VARCHAR(11)' },
  { name: 'loc_no', definition: 'VARCHAR(20)' },
];

const SCHOOL_SECTION_COLUMN = [
  { name: 'school_section', definition: 'VARCHAR(30)' },
];

const SCHOOL_WATERMARK_COLUMNS = [
  { name: 'id_card_watermark_url', definition: 'VARCHAR(500)' },
  { name: 'id_card_watermark_data', definition: 'MEDIUMBLOB' },
  { name: 'id_card_watermark_opacity', definition: 'DECIMAL(3,2) NOT NULL DEFAULT 0.10' },
  { name: 'id_card_watermark_enabled', definition: 'SMALLINT NOT NULL DEFAULT 0' },
];

const HARD_COPY_BATCH_COLUMNS = [
  { name: 'batch_id', definition: 'VARCHAR(36)' },
  { name: 'certificate_id', definition: 'VARCHAR(36)' },
  { name: 'pdf_path', definition: 'VARCHAR(500)' },
  { name: 'receipt_id', definition: 'VARCHAR(36)' },
];

const EMAIL_LOG_RETRY_COLUMNS = [
  { name: 'attempt_count', definition: 'INT NOT NULL DEFAULT 1' },
  { name: 'next_retry_at', definition: 'DATETIME' },
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
    console.log(`Checking profile-field columns in database '${dbName}'...\n`);
    console.log('distributors (PAN + payout bank details):');
    await addMissingColumns(connection, dbName, 'distributors', DISTRIBUTOR_PAYOUT_COLUMNS);
    console.log('\nschools (class range):');
    await addMissingColumns(connection, dbName, 'schools', SCHOOL_CLASS_RANGE_COLUMNS);
    console.log('\nschools (ID card orientation + signature designation):');
    await addMissingColumns(connection, dbName, 'schools', SCHOOL_ID_CARD_AND_SIGNATURE_COLUMNS);
    console.log('\nstudents (APAAR / Student ID / PEN / LOC):');
    await addMissingColumns(connection, dbName, 'students', STUDENT_ID_COLUMNS);
    console.log('\nschools (school section):');
    await addMissingColumns(connection, dbName, 'schools', SCHOOL_SECTION_COLUMN);
    console.log('\nschools (ID card watermark):');
    await addMissingColumns(connection, dbName, 'schools', SCHOOL_WATERMARK_COLUMNS);
    console.log('\nid_card_hard_copy_requests (batch grouping + generated PDF + receipt):');
    await addMissingColumns(connection, dbName, 'id_card_hard_copy_requests', HARD_COPY_BATCH_COLUMNS);
    console.log('\nemail_logs (retry tracking):');
    await addMissingColumns(connection, dbName, 'email_logs', EMAIL_LOG_RETRY_COLUMNS);
    console.log('\nProfile-fields migration completed successfully.');
  } catch (err) {
    console.error('Profile-fields migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

migrate();
