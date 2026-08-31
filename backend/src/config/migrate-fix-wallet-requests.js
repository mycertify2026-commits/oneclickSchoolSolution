// Fixes 'wallet_requests': the live table predates the current
// walletRequestController.js — school_id/status were left as INT from an
// older schema (should be CHAR(36)/VARCHAR to match schools.id and hold
// values like 'pending'/'approved'), and 4 columns the controller already
// reads/writes (rejection_reason, reviewed_by, reviewed_at,
// wallet_transaction_id) don't exist yet. Same idempotent, additive-only
// pattern as the other migrate-* scripts. Safe to re-run.
const mysql = require('mysql2/promise');
require('dotenv').config();

async function columnExists(connection, dbName, table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) as count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return rows[0].count > 0;
}

async function migrateFixWalletRequests() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const dbName = process.env.DB_NAME;

  try {
    console.log(`Fixing 'wallet_requests' schema in database '${dbName}'...`);

    const [rows] = await connection.query('SELECT COUNT(*) as c FROM wallet_requests');
    const hasData = rows[0].c > 0;
    if (hasData) {
      console.log(`  ! wallet_requests has ${rows[0].c} existing row(s) — school_id/status type change will be skipped to avoid data loss. Review manually.`);
    } else {
      // Table is empty (confirmed before writing this migration) — safe to
      // correct the column types outright rather than leave them wrong.
      const [schoolIdCol] = await connection.query(
        `SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'wallet_requests' AND COLUMN_NAME = 'school_id'`,
        [dbName]
      );
      if (schoolIdCol[0] && schoolIdCol[0].COLUMN_TYPE.toLowerCase() !== 'char(36)' && schoolIdCol[0].COLUMN_TYPE.toLowerCase() !== 'varchar(36)') {
        await connection.query(
          `ALTER TABLE wallet_requests MODIFY school_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL`
        );
        console.log('  + wallet_requests.school_id: converted INT -> CHAR(36)');
      } else {
        console.log('  - wallet_requests.school_id: already correct type, skipping');
      }

      const [statusCol] = await connection.query(
        `SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'wallet_requests' AND COLUMN_NAME = 'status'`,
        [dbName]
      );
      if (statusCol[0] && statusCol[0].DATA_TYPE.toLowerCase() === 'int') {
        await connection.query(
          `ALTER TABLE wallet_requests MODIFY status VARCHAR(20) NOT NULL DEFAULT 'pending'`
        );
        console.log("  + wallet_requests.status: converted INT -> VARCHAR(20) DEFAULT 'pending'");
      } else {
        console.log('  - wallet_requests.status: already correct type, skipping');
      }

      // payment_date: controller sends a plain date string ('2026-08-25'),
      // matches DATE better than TIMESTAMP (schema.mysql.sql uses DATE).
      const [paymentDateCol] = await connection.query(
        `SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'wallet_requests' AND COLUMN_NAME = 'payment_date'`,
        [dbName]
      );
      if (paymentDateCol[0] && paymentDateCol[0].DATA_TYPE.toLowerCase() === 'timestamp') {
        await connection.query(`ALTER TABLE wallet_requests MODIFY payment_date DATE NOT NULL`);
        console.log('  + wallet_requests.payment_date: converted TIMESTAMP -> DATE');
      } else {
        console.log('  - wallet_requests.payment_date: already correct type, skipping');
      }
    }

    const NEW_COLUMNS = [
      { name: 'rejection_reason', definition: 'TEXT' },
      { name: 'reviewed_by', definition: 'CHAR(36)' },
      { name: 'reviewed_at', definition: 'DATETIME' },
      { name: 'wallet_transaction_id', definition: 'CHAR(36)' },
    ];
    for (const col of NEW_COLUMNS) {
      const exists = await columnExists(connection, dbName, 'wallet_requests', col.name);
      if (exists) {
        console.log(`  - wallet_requests.${col.name}: already present, skipping`);
        continue;
      }
      await connection.query(`ALTER TABLE wallet_requests ADD COLUMN \`${col.name}\` ${col.definition}`);
      console.log(`  + wallet_requests.${col.name}: added`);
    }

    // Add the FK now that types match (schools.id is CHAR(36)) — wrapped so
    // a duplicate-constraint re-run doesn't fail the whole migration.
    try {
      await connection.query(
        `ALTER TABLE wallet_requests ADD CONSTRAINT fk_wallet_requests_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE`
      );
      console.log('  + wallet_requests: added FK to schools(id)');
    } catch (fkErr) {
      if (fkErr.code === 'ER_FK_DUP_NAME' || fkErr.code === 'ER_DUP_KEY' || /Duplicate/i.test(fkErr.message)) {
        console.log('  - wallet_requests: FK to schools(id) already present, skipping');
      } else {
        console.log('  ! wallet_requests: FK add skipped (', fkErr.message, ') — non-fatal, table still usable without it');
      }
    }

    console.log('\nwallet_requests fix completed successfully.');
  } catch (err) {
    console.error('wallet_requests fix failed:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

migrateFixWalletRequests();
