// Incremental migration: adds the manual wallet recharge system (replaces
// Razorpay) for databases that already existed before this feature was
// built. Safe to run multiple times.
const mysql = require('mysql2/promise');
require('dotenv').config();

async function tableExists(connection, dbName, table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) as count FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table]
  );
  return rows[0].count > 0;
}

async function migrateWalletSystem() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  const dbName = process.env.DB_NAME;

  try {
    console.log(`Running wallet-system migration against database '${dbName}'...\n`);

    // ---- 1. wallet_requests ----
    if (await tableExists(connection, dbName, 'wallet_requests')) {
      console.log('  - wallet_requests: already exists, skipping');
    } else {
      await connection.query(`
        CREATE TABLE wallet_requests (
          id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
          school_id CHAR(36) NOT NULL,
          amount DECIMAL(12,2) NOT NULL,
          utr_number VARCHAR(50) NOT NULL,
          payment_date DATE NOT NULL,
          screenshot_path VARCHAR(500),
          remarks TEXT,
          status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
          rejection_reason TEXT,
          reviewed_by CHAR(36),
          reviewed_at TIMESTAMP NULL,
          wallet_transaction_id CHAR(36),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_walletreq_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
          CONSTRAINT fk_walletreq_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
          CONSTRAINT chk_walletreq_amount_positive CHECK (amount > 0),
          INDEX idx_walletreq_school (school_id),
          INDEX idx_walletreq_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  + wallet_requests: created');
    }

    // ---- 2. bank_details ----
    if (await tableExists(connection, dbName, 'bank_details')) {
      console.log('  - bank_details: already exists, skipping');
    } else {
      await connection.query(`
        CREATE TABLE bank_details (
          id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
          account_holder VARCHAR(150) NOT NULL,
          bank_name VARCHAR(150) NOT NULL,
          account_number VARCHAR(40) NOT NULL,
          ifsc VARCHAR(20) NOT NULL,
          branch VARCHAR(150),
          upi_id VARCHAR(100),
          qr_code_path VARCHAR(500),
          updated_by CHAR(36),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_bankdetails_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  + bank_details: created');

      // Seed a placeholder row so the recharge screen has something to show
      // immediately - Super Admin should replace these with real details.
      const [superAdminRows] = await connection.query("SELECT id FROM users WHERE role = 'superAdmin' AND deleted_at IS NULL LIMIT 1");
      await connection.query(
        `INSERT INTO bank_details (id, account_holder, bank_name, account_number, ifsc, branch, upi_id, updated_by)
         VALUES (UUID(), 'One Click School Solutions', 'State Bank of India', '00000000000000', 'SBIN0000000', 'Main Branch', 'oneclickschool@upi', ?)`,
        [superAdminRows[0]?.id || null]
      );
      console.log('  + bank_details: seeded a placeholder row - UPDATE with real account info before going live');
    }

    // ---- 3. Drop the old payment_method ENUM's 'razorpay' option ----
    const [columnRows] = await connection.query(
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'certificates' AND COLUMN_NAME = 'payment_method'`,
      [dbName]
    );
    if (columnRows.length > 0 && columnRows[0].COLUMN_TYPE.includes('razorpay')) {
      await connection.query(`ALTER TABLE certificates MODIFY COLUMN payment_method ENUM('wallet') NOT NULL DEFAULT 'wallet'`);
      console.log("  + certificates.payment_method: removed 'razorpay' option");
    } else {
      console.log('  - certificates.payment_method: already correct, skipping');
    }

    // ---- 4. Drop the old razorpay_orders table entirely, if present ----
    if (await tableExists(connection, dbName, 'razorpay_orders')) {
      await connection.query('DROP TABLE razorpay_orders');
      console.log('  + razorpay_orders: dropped (replaced by wallet_requests)');
    } else {
      console.log('  - razorpay_orders: not present, skipping');
    }

    console.log('\nWallet-system migration completed successfully.');
  } catch (err) {
    console.error('Wallet-system migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

migrateWalletSystem();
