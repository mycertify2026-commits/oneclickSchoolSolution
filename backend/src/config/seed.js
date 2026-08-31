const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('./db');
require('dotenv').config();

const MASTER_DATA_SEED = {
  standard: ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'],
  division: ['A', 'B', 'C', 'D'],
  district: ['Pune', 'Mumbai', 'Nashik', 'Nagpur', 'Aurangabad', 'Solapur', 'Kolhapur', 'Satara', 'Sangli', 'Ahmednagar'],
  taluka: ['Haveli', 'Mulshi', 'Maval', 'Baramati', 'Indapur'],
  city: ['Pune', 'Mumbai', 'Nashik', 'Nagpur'],
  medium: ['Marathi', 'English', 'Hindi', 'Semi-English', 'Urdu'],
  religion: ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Other'],
  caste: ['Open', 'OBC', 'SC', 'ST', 'NT', 'VJ', 'SBC'],
  grant_type: ['Government Aided', 'Permanently Unaided', 'Government', 'Self-Financed'],
  board_name: ['SSC (Maharashtra State Board)', 'CBSE', 'ICSE', 'IB'],
  management_type: ['Government', 'Private Aided', 'Private Unaided', 'Trust']
};

async function seed() {
  const conn = await pool.getConnection();
  try {
    // ---- Super Admin ----
    const [existing] = await conn.query("SELECT id FROM users WHERE role = 'superAdmin' LIMIT 1");
    if (existing.length > 0) {
      console.log('Super Admin already exists. Skipping admin seed.');
    } else {
      const email = process.env.SEED_ADMIN_EMAIL || 'admin@certifypro.in';
      const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
      const hash = await bcrypt.hash(password, 10);
      const id = uuidv4();

      await conn.query(
        `INSERT INTO users (id, role, name, email, password_hash, is_active, password_set)
         VALUES (?, 'superAdmin', 'Super Admin', ?, ?, 1, 1)`,
        [id, email, hash]
      );

      console.log('Super Admin created:');
      console.log('  Email:', email);
      console.log('  Password:', password);
      console.log('  (Change this password after first login.)');
    }

    // ---- Master data ----
    const [mdExisting] = await conn.query('SELECT COUNT(*) as count FROM master_data');
    if (mdExisting[0].count > 0) {
      console.log('Master data already seeded. Skipping.');
    } else {
      for (const [category, values] of Object.entries(MASTER_DATA_SEED)) {
        for (let i = 0; i < values.length; i++) {
          await conn.query(
            `INSERT INTO master_data (id, category, value, display_order) VALUES (?, ?, ?, ?)`,
            [uuidv4(), category, values[i], i]
          );
        }
      }
      console.log('Master data seeded (11 categories).');
    }
    // ---- Demo School Admin + Distributor (matching prototype's hardcoded demo credentials) ----
    const [schoolExists] = await conn.query("SELECT id FROM schools WHERE login_id = 'SCH001'");
    if (schoolExists.length > 0) {
      console.log('Demo school SCH001 already exists. Skipping.');
    } else {
      const schAdminId = uuidv4();
      const schAdminHash = await bcrypt.hash('School@123', 10);
      await conn.query(
        `INSERT INTO users (id, role, name, email, password_hash, is_active, password_set)
         VALUES (?, 'schoolAdmin', 'Rajesh Patil', 'sch001@certifypro.in', ?, 1, 1)`,
        [schAdminId, schAdminHash]
      );
      const schoolId = uuidv4();
      await conn.query(
        `INSERT INTO schools (id, admin_user_id, name, login_id, city, district, status)
         VALUES (?, ?, 'Shri Saraswati Vidyalaya', 'SCH001', 'Pune', 'Pune', 'active')`,
        [schoolId, schAdminId]
      );
      await conn.query(`INSERT INTO wallets (id, school_id, balance) VALUES (?, ?, 500)`, [uuidv4(), schoolId]);
      console.log('Demo School Admin created: SCH001 / School@123');
    }

    const [distExists] = await conn.query("SELECT id FROM users WHERE email = 'dist01@certifypro.in'");
    if (distExists.length > 0) {
      console.log('Demo distributor dist01 already exists. Skipping.');
    } else {
      const distUserId = uuidv4();
      const distHash = await bcrypt.hash('Dist@123', 10);
      await conn.query(
        `INSERT INTO users (id, role, name, email, password_hash, is_active, password_set)
         VALUES (?, 'distributor', 'Amit Sharma', 'dist01@certifypro.in', ?, 1, 1)`,
        [distUserId, distHash]
      );
      await conn.query(`INSERT INTO distributors (id, user_id, commission_rate) VALUES (?, ?, 10.00)`, [uuidv4(), distUserId]);
      console.log('Demo Distributor created: dist01 / Dist@123');
    }

    // ---- Default bank details (placeholder - Super Admin should update these
    // with real account info before going live; without this row, the
    // School Admin's wallet recharge screen has nothing to display) ----
    const [bankExists] = await conn.query('SELECT id FROM bank_details LIMIT 1');
    if (bankExists.length > 0) {
      console.log('Bank details already exist. Skipping.');
    } else {
      const [superAdminRows] = await conn.query("SELECT id FROM users WHERE role = 'superAdmin' LIMIT 1");
      await conn.query(
        `INSERT INTO bank_details (id, account_holder, bank_name, account_number, ifsc, branch, upi_id, updated_by)
         VALUES (?, 'One Click School Solutions', 'State Bank of India', '00000000000000', 'SBIN0000000', 'Main Branch', 'oneclickschool@upi', ?)`,
        [uuidv4(), superAdminRows[0]?.id || null]
      );
      console.log('Default bank details seeded - UPDATE THESE with real account info via Super Admin > Wallet > Bank Details before going live.');
    }

  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

seed();
