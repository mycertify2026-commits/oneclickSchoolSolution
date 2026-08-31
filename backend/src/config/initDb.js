/**
 * initDb.js — runs on every backend startup.
 * Creates all tables (IF NOT EXISTS) and seeds default data
 * if the database is empty. Safe to call multiple times.
 */
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Build pool config same way as db.js
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
    }
  : {
      host: process.env.PGHOST || process.env.DB_HOST,
      port: parseInt(process.env.PGPORT || process.env.DB_PORT) || 5432,
      database: process.env.PGDATABASE || process.env.DB_NAME,
      user: process.env.PGUSER || process.env.DB_USER,
      password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
    };

const SCHEMA = `
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  role VARCHAR(30) NOT NULL, name VARCHAR(150) NOT NULL, email VARCHAR(150) NOT NULL,
  mobile VARCHAR(15), password_hash VARCHAR(255),
  is_active SMALLINT NOT NULL DEFAULT 1, password_set SMALLINT NOT NULL DEFAULT 0,
  created_by VARCHAR(36), deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users (deleted_at);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trigger_users_updated_at') THEN
    CREATE TRIGGER trigger_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS password_tokens (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  user_id VARCHAR(36) NOT NULL, token VARCHAR(255) NOT NULL UNIQUE,
  type VARCHAR(10) NOT NULL, expires_at TIMESTAMP NOT NULL,
  used SMALLINT NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pwtoken_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pwtoken_token ON password_tokens (token);

CREATE TABLE IF NOT EXISTS distributors (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  user_id VARCHAR(36) NOT NULL, super_distributor_id VARCHAR(36),
  commission_rate DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  city VARCHAR(100), district VARCHAR(100), address TEXT, avatar_url VARCHAR(500),
  deleted_at TIMESTAMP NULL DEFAULT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_distributor_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_distributors_user ON distributors (user_id);
CREATE INDEX IF NOT EXISTS idx_distributors_deleted_at ON distributors (deleted_at);

CREATE TABLE IF NOT EXISTS schools (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  admin_user_id VARCHAR(36), distributor_id VARCHAR(36), super_distributor_id VARCHAR(36),
  name VARCHAR(200) NOT NULL, login_id VARCHAR(30), udise_code VARCHAR(20),
  village VARCHAR(100), city VARCHAR(100), district VARCHAR(100), taluka VARCHAR(100),
  pin_code VARCHAR(10), phone VARCHAR(15), email VARCHAR(150), medium VARCHAR(30), board VARCHAR(50),
  logo_url VARCHAR(500), signature_url VARCHAR(500), stamp_url VARCHAR(500),
  cert_header TEXT, cert_footer TEXT,
  id_card_primary_color VARCHAR(100) DEFAULT 'linear-gradient(135deg,#1a6fd4,#1557b0)',
  id_card_school_name VARCHAR(200), id_card_subtitle VARCHAR(200) DEFAULT 'Student ID Card',
  id_card_footer_text VARCHAR(255) DEFAULT 'If found, please contact the school office.',
  id_card_show_register_number SMALLINT NOT NULL DEFAULT 1,
  id_card_show_aadhaar SMALLINT NOT NULL DEFAULT 1, id_card_show_dob SMALLINT NOT NULL DEFAULT 1,
  id_card_show_address SMALLINT NOT NULL DEFAULT 0, id_card_show_emergency_contact SMALLINT NOT NULL DEFAULT 1,
  principal_name VARCHAR(200),
  recog_no VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'pending', rejection_reason TEXT,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_school_admin FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_school_distributor FOREIGN KEY (distributor_id) REFERENCES distributors(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_schools_status ON schools (status);
CREATE INDEX IF NOT EXISTS idx_schools_distributor ON schools (distributor_id);
CREATE INDEX IF NOT EXISTS idx_schools_login_id ON schools (login_id);
CREATE INDEX IF NOT EXISTS idx_schools_deleted_at ON schools (deleted_at);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trigger_schools_updated_at') THEN
    CREATE TRIGGER trigger_schools_updated_at BEFORE UPDATE ON schools FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS wallets (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  school_id VARCHAR(36) NOT NULL UNIQUE, balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_wallet_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT chk_wallet_balance_nonneg CHECK (balance >= 0)
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trigger_wallets_updated_at') THEN
    CREATE TRIGGER trigger_wallets_updated_at BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  wallet_id VARCHAR(36) NOT NULL, type VARCHAR(10) NOT NULL,
  amount DECIMAL(12,2) NOT NULL, balance_after DECIMAL(12,2) NOT NULL,
  reason VARCHAR(50) NOT NULL, reference_id VARCHAR(36), description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_wallettx_wallet FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
  CONSTRAINT chk_wallettx_amount_positive CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS idx_wallettx_wallet ON wallet_transactions (wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallettx_created ON wallet_transactions (created_at);

CREATE TABLE IF NOT EXISTS wallet_requests (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  school_id VARCHAR(36) NOT NULL, amount DECIMAL(12,2) NOT NULL,
  utr_number VARCHAR(50) NOT NULL, payment_date DATE NOT NULL,
  screenshot_path VARCHAR(500), remarks TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', rejection_reason TEXT,
  reviewed_by VARCHAR(36), reviewed_at TIMESTAMP NULL, wallet_transaction_id VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_walletreq_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT fk_walletreq_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_walletreq_amount_positive CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS idx_walletreq_school ON wallet_requests (school_id);
CREATE INDEX IF NOT EXISTS idx_walletreq_status ON wallet_requests (status);

CREATE TABLE IF NOT EXISTS bank_details (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  account_holder VARCHAR(150) NOT NULL, bank_name VARCHAR(150) NOT NULL,
  account_number VARCHAR(40) NOT NULL, ifsc VARCHAR(20) NOT NULL,
  branch VARCHAR(150), upi_id VARCHAR(100), qr_code_path VARCHAR(500),
  updated_by VARCHAR(36), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bankdetails_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trigger_bank_details_updated_at') THEN
    CREATE TRIGGER trigger_bank_details_updated_at BEFORE UPDATE ON bank_details FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS students (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  school_id VARCHAR(36) NOT NULL, register_number VARCHAR(50), serial_id VARCHAR(50),
  full_name VARCHAR(150) NOT NULL, mother_name VARCHAR(150), father_name VARCHAR(150),
  gender VARCHAR(10), dob DATE, aadhaar VARCHAR(20), religion VARCHAR(50), caste VARCHAR(50),
  sub_caste VARCHAR(50), nationality VARCHAR(50) DEFAULT 'Indian', mother_tongue VARCHAR(50),
  birth_village VARCHAR(100), birth_taluka VARCHAR(100), birth_district VARCHAR(100),
  birth_state VARCHAR(100), birth_country VARCHAR(100) DEFAULT 'India',
  admission_standard VARCHAR(20), admission_division VARCHAR(10), admission_date DATE,
  prev_school VARCHAR(200), prev_standard VARCHAR(20), roll_number VARCHAR(20),
  blood_group VARCHAR(5), parent_mobile VARCHAR(15), address TEXT, photo_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_student_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_students_school ON students (school_id);
CREATE INDEX IF NOT EXISTS idx_students_name ON students (full_name);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trigger_students_updated_at') THEN
    CREATE TRIGGER trigger_students_updated_at BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS certificates (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  school_id VARCHAR(36) NOT NULL, student_id VARCHAR(36) NOT NULL,
  cart_item_id VARCHAR(36),
  type VARCHAR(20) NOT NULL, serial_number VARCHAR(50) NOT NULL UNIQUE,
  price DECIMAL(10,2) NOT NULL, gst_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  payment_method VARCHAR(20) NOT NULL DEFAULT 'wallet', wallet_transaction_id VARCHAR(36),
  pdf_path VARCHAR(500), purpose VARCHAR(255), qr_payload TEXT,
  expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_certificate_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT fk_certificate_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_certificate_wallettx FOREIGN KEY (wallet_transaction_id) REFERENCES wallet_transactions(id) ON DELETE SET NULL
);
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS cart_item_id VARCHAR(36);

-- Persistent file storage: keeps uploaded image bytes in PostgreSQL so they
-- survive ephemeral autoscale container restarts (uploaded files on disk are
-- wiped on each new deployment; the DB row persists forever).
ALTER TABLE schools  ADD COLUMN IF NOT EXISTS logo_data      BYTEA;
ALTER TABLE schools  ADD COLUMN IF NOT EXISTS signature_data BYTEA;
ALTER TABLE schools  ADD COLUMN IF NOT EXISTS stamp_data     BYTEA;
ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_data     BYTEA;
ALTER TABLE schools  ADD COLUMN IF NOT EXISTS bonafide_template_url  VARCHAR(500);
ALTER TABLE schools  ADD COLUMN IF NOT EXISTS bonafide_template_data BYTEA;
ALTER TABLE schools  ADD COLUMN IF NOT EXISTS lc_template_url        VARCHAR(500);
ALTER TABLE schools  ADD COLUMN IF NOT EXISTS lc_template_data       BYTEA;
ALTER TABLE schools  ADD COLUMN IF NOT EXISTS id_card_template_url   VARCHAR(500);
ALTER TABLE schools  ADD COLUMN IF NOT EXISTS id_card_template_data  BYTEA;

CREATE INDEX IF NOT EXISTS idx_certificates_school ON certificates (school_id);
CREATE INDEX IF NOT EXISTS idx_certificates_student ON certificates (student_id);
CREATE INDEX IF NOT EXISTS idx_certificates_serial ON certificates (serial_number);

CREATE TABLE IF NOT EXISTS master_data (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  category VARCHAR(50) NOT NULL, value VARCHAR(100) NOT NULL,
  display_order INT NOT NULL DEFAULT 0, is_active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_master_category ON master_data (category);
CREATE INDEX IF NOT EXISTS idx_master_category_active ON master_data (category, is_active);

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  user_id VARCHAR(36) NOT NULL, text VARCHAR(500) NOT NULL,
  is_read SMALLINT NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, is_read);

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  user_id VARCHAR(36), action VARCHAR(100) NOT NULL, entity_type VARCHAR(50),
  entity_id VARCHAR(36), ip_address VARCHAR(45), details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  user_id VARCHAR(36) NOT NULL, token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL, revoked SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_refreshtoken_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_refreshtoken_user ON refresh_tokens (user_id);

CREATE TABLE IF NOT EXISTS cart_items (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  school_id VARCHAR(36) NOT NULL,
  student_id VARCHAR(36) NOT NULL,
  type VARCHAR(20) NOT NULL,
  purpose VARCHAR(255),
  price DECIMAL(10,2) NOT NULL,
  gst_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status VARCHAR(20) NOT NULL DEFAULT 'in_cart',
  added_by VARCHAR(36),
  certificate_id VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cart_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT fk_cart_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cart_school_status ON cart_items (school_id, status);

CREATE TABLE IF NOT EXISTS otp_verifications (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  user_id VARCHAR(36) NOT NULL,
  purpose VARCHAR(50) NOT NULL DEFAULT 'cart_submission',
  otp_hash VARCHAR(255) NOT NULL,
  cart_snapshot TEXT,
  attempts INT NOT NULL DEFAULT 0,
  used SMALLINT NOT NULL DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_otp_user_purpose ON otp_verifications (user_id, purpose, used);

CREATE TABLE IF NOT EXISTS certificate_requests (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  school_id VARCHAR(36) NOT NULL,
  student_id VARCHAR(36) NOT NULL,
  type VARCHAR(20) NOT NULL,
  purpose VARCHAR(255),
  price DECIMAL(10,2) NOT NULL,
  gst_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  approval_code VARCHAR(6) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  approved_by VARCHAR(36),
  resolved_at TIMESTAMP NULL,
  certificate_id VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_certreq_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT fk_certreq_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_certreq_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_certreq_school ON certificate_requests (school_id);
CREATE INDEX IF NOT EXISTS idx_certreq_status ON certificate_requests (status);
CREATE INDEX IF NOT EXISTS idx_certreq_created ON certificate_requests (created_at);
`;

const MASTER_DATA = {
  standard: ['1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th','11th','12th'],
  division: ['A','B','C','D'],
  district: ['Pune','Mumbai','Nashik','Nagpur','Aurangabad','Solapur','Kolhapur','Satara','Sangli','Ahmednagar'],
  taluka: ['Haveli','Mulshi','Maval','Baramati','Indapur'],
  city: ['Pune','Mumbai','Nashik','Nagpur'],
  medium: ['Marathi','English','Hindi','Semi-English','Urdu'],
  religion: ['Hindu','Muslim','Christian','Sikh','Buddhist','Jain','Other'],
  caste: ['Open','OBC','SC','ST','NT','VJ','SBC'],
  grant_type: ['Government Aided','Permanently Unaided','Government','Self-Financed'],
  board_name: ['SSC (Maharashtra State Board)','CBSE','ICSE','IB'],
  management_type: ['Government','Private Aided','Private Unaided','Trust'],
};

async function initDb() {
  const pool = new Pool({ ...poolConfig, max: 3, connectionTimeoutMillis: 15000 });
  const client = await pool.connect();
  try {
    console.log('🔧 Running DB init (schema + seed)...');

    // Apply schema
    await client.query(SCHEMA);
    console.log('✅ Schema applied.');

    // Migration: add principal_name column if it doesn't exist (for existing DBs)
    await client.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS principal_name VARCHAR(200)`);
    await client.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS recog_no VARCHAR(100)`);
    await client.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS area_of_operation VARCHAR(255)`);
    await client.query(`ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS certificate_variant VARCHAR(20) DEFAULT 'original'`);
    await client.query(`ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS leaving_date DATE`);
    await client.query(`ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS since_when DATE`);
    await client.query(`ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS leaving_reason TEXT`);
    await client.query(`ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS leaving_remark TEXT`);
    await client.query(`ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS check_by_label VARCHAR(50) DEFAULT 'Check By'`);
    await client.query(`ALTER TABLE certificates ADD COLUMN IF NOT EXISTS certificate_variant VARCHAR(20) DEFAULT 'original'`);
    await client.query(`ALTER TABLE certificates ADD COLUMN IF NOT EXISTS leaving_date DATE`);
    await client.query(`ALTER TABLE certificates ADD COLUMN IF NOT EXISTS since_when DATE`);
    await client.query(`ALTER TABLE certificates ADD COLUMN IF NOT EXISTS leaving_reason TEXT`);
    await client.query(`ALTER TABLE certificates ADD COLUMN IF NOT EXISTS leaving_remark TEXT`);
    await client.query(`ALTER TABLE certificates ADD COLUMN IF NOT EXISTS check_by_label VARCHAR(50) DEFAULT 'Check By'`);

    // Migration: Super Distributor feature — add linking columns
    await client.query(`ALTER TABLE distributors ADD COLUMN IF NOT EXISTS super_distributor_id VARCHAR(36)`);
    await client.query(`ALTER TABLE distributors ADD COLUMN IF NOT EXISTS area_of_operation VARCHAR(255)`);
    await client.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS super_distributor_id VARCHAR(36)`);

    // Migration: Camp Requests
    await client.query(`
      CREATE TABLE IF NOT EXISTS camp_requests (
        id VARCHAR(36) PRIMARY KEY,
        school_id VARCHAR(36) NOT NULL,
        distributor_id VARCHAR(36),
        super_distributor_id VARCHAR(36),
        camp_name VARCHAR(200) NOT NULL,
        required_docs JSONB NOT NULL DEFAULT '[]',
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        attender_name VARCHAR(200),
        attender_email VARCHAR(200),
        attender_phone VARCHAR(30),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
      )
    `);

    // Migration: ID Card Pricing
    await client.query(`
      CREATE TABLE IF NOT EXISTS id_card_pricing (
        id VARCHAR(36) PRIMARY KEY,
        copy_type VARCHAR(20) NOT NULL UNIQUE,
        price DECIMAL(10,2) NOT NULL DEFAULT 20.00,
        updated_by VARCHAR(36),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Seed default pricing
    await client.query(`
      INSERT INTO id_card_pricing (id, copy_type, price)
      VALUES (gen_random_uuid()::varchar, 'soft', 20.00), (gen_random_uuid()::varchar, 'hard', 100.00)
      ON CONFLICT (copy_type) DO NOTHING
    `);

    // Migration: ID Card Hard Copy Requests
    await client.query(`
      CREATE TABLE IF NOT EXISTS id_card_hard_copy_requests (
        id VARCHAR(36) PRIMARY KEY,
        school_id VARCHAR(36) NOT NULL,
        student_id VARCHAR(36) NOT NULL,
        distributor_id VARCHAR(36),
        super_distributor_id VARCHAR(36),
        amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        wallet_transaction_id VARCHAR(36),
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
      )
    `);

    // Migration: ID Card background image for schools
    await client.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS id_card_bg_data BYTEA`);

    // Backfill: auto-generate Saral ID for any existing student that doesn't have one
    await client.query(`
      UPDATE students
      SET serial_id = 'SARAL-' || EXTRACT(YEAR FROM COALESCE(created_at, CURRENT_TIMESTAMP))::text
                      || '-' || LPAD((FLOOR(RANDOM() * 900000) + 100000)::text, 6, '0')
      WHERE serial_id IS NULL OR serial_id = ''
    `);

    // Seed super admin
    const { rows: adminRows } = await client.query("SELECT id FROM users WHERE role='superAdmin' LIMIT 1");
    let adminId;
    if (adminRows.length === 0) {
      const email = process.env.SEED_ADMIN_EMAIL || 'admin@certifypro.in';
      const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
      const hash = await bcrypt.hash(password, 10);
      adminId = uuidv4();
      await client.query(
        `INSERT INTO users (id,role,name,email,password_hash,is_active,password_set) VALUES ($1,'superAdmin','Super Admin',$2,$3,1,1)`,
        [adminId, email, hash]
      );
      console.log(`✅ Super Admin created: ${email} / ${password}`);
    } else {
      adminId = adminRows[0].id;
      console.log('ℹ️  Super Admin already exists.');
    }

    // Seed master data
    const { rows: mdRows } = await client.query('SELECT COUNT(*) as c FROM master_data');
    if (parseInt(mdRows[0].c) === 0) {
      for (const [category, values] of Object.entries(MASTER_DATA)) {
        for (let i = 0; i < values.length; i++) {
          await client.query(
            'INSERT INTO master_data (id,category,value,display_order) VALUES ($1,$2,$3,$4)',
            [uuidv4(), category, values[i], i]
          );
        }
      }
      console.log('✅ Master data seeded.');
    }

    // Seed demo school admin
    const { rows: schoolRows } = await client.query("SELECT id FROM schools WHERE login_id='SCH001'");
    if (schoolRows.length === 0) {
      const schAdminId = uuidv4();
      const schHash = await bcrypt.hash('School@123', 10);
      await client.query(
        `INSERT INTO users (id,role,name,email,password_hash,is_active,password_set) VALUES ($1,'schoolAdmin','Rajesh Patil','sch001@certifypro.in',$2,1,1)`,
        [schAdminId, schHash]
      );
      const schoolId = uuidv4();
      await client.query(
        `INSERT INTO schools (id,admin_user_id,name,login_id,city,district,status) VALUES ($1,$2,'Shri Saraswati Vidyalaya','SCH001','Pune','Pune','active')`,
        [schoolId, schAdminId]
      );
      await client.query('INSERT INTO wallets (id,school_id,balance) VALUES ($1,$2,500)', [uuidv4(), schoolId]);
      console.log('✅ Demo School created: SCH001 / School@123');
    }

    // Seed demo distributor
    const { rows: distRows } = await client.query("SELECT id FROM users WHERE email='dist01@certifypro.in'");
    if (distRows.length === 0) {
      const distUserId = uuidv4();
      const distHash = await bcrypt.hash('Dist@123', 10);
      await client.query(
        `INSERT INTO users (id,role,name,email,password_hash,is_active,password_set) VALUES ($1,'distributor','Amit Sharma','dist01@certifypro.in',$2,1,1)`,
        [distUserId, distHash]
      );
      await client.query('INSERT INTO distributors (id,user_id,commission_rate) VALUES ($1,$2,10.00)', [uuidv4(), distUserId]);
      console.log('✅ Demo Distributor created: dist01@certifypro.in / Dist@123');
    }

    // Seed bank details
    const { rows: bankRows } = await client.query('SELECT id FROM bank_details LIMIT 1');
    if (bankRows.length === 0) {
      await client.query(
        `INSERT INTO bank_details (id,account_holder,bank_name,account_number,ifsc,branch,upi_id,updated_by) VALUES ($1,'One Click School Solutions','State Bank of India','00000000000000','SBIN0000000','Main Branch','oneclickschool@upi',$2)`,
        [uuidv4(), adminId]
      );
      console.log('✅ Default bank details seeded.');
    }

    console.log('🚀 DB init complete.');
  } catch (err) {
    console.error('❌ DB init error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

module.exports = initDb;
