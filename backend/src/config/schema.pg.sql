-- ============================================
-- CERTIFYPRO POSTGRESQL SCHEMA
-- Converted from MySQL. Uses VARCHAR(36) UUIDs
-- to match application-generated uuidv4() strings.
-- ============================================

-- Trigger function: keep updated_at current on every UPDATE
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- USERS
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  role VARCHAR(30) NOT NULL,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL,
  mobile VARCHAR(15),
  password_hash VARCHAR(255),
  is_active SMALLINT NOT NULL DEFAULT 1,
  password_set SMALLINT NOT NULL DEFAULT 0,
  created_by VARCHAR(36),
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users (deleted_at);
CREATE OR REPLACE TRIGGER trigger_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- PASSWORD SETUP / RESET TOKENS
-- ============================================
CREATE TABLE IF NOT EXISTS password_tokens (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  user_id VARCHAR(36) NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  type VARCHAR(10) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pwtoken_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pwtoken_token ON password_tokens (token);

-- ============================================
-- DISTRIBUTORS
-- ============================================
CREATE TABLE IF NOT EXISTS distributors (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  user_id VARCHAR(36) NOT NULL,
  super_distributor_id VARCHAR(36),
  commission_rate DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  city VARCHAR(100),
  district VARCHAR(100),
  address TEXT,
  area_of_operation VARCHAR(255),
  avatar_url VARCHAR(500),
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_distributor_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_distributors_user ON distributors (user_id);
CREATE INDEX IF NOT EXISTS idx_distributors_deleted_at ON distributors (deleted_at);
CREATE INDEX IF NOT EXISTS idx_distributors_super_distributor ON distributors (super_distributor_id);

-- ============================================
-- SCHOOLS
-- ============================================
CREATE TABLE IF NOT EXISTS schools (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  admin_user_id VARCHAR(36),
  distributor_id VARCHAR(36),
  super_distributor_id VARCHAR(36),
  name VARCHAR(200) NOT NULL,
  login_id VARCHAR(30),
  udise_code VARCHAR(20),
  village VARCHAR(100),
  city VARCHAR(100),
  district VARCHAR(100),
  taluka VARCHAR(100),
  pin_code VARCHAR(10),
  phone VARCHAR(15),
  email VARCHAR(150),
  medium VARCHAR(30),
  board VARCHAR(50),
  area_of_operation VARCHAR(255),
  logo_url VARCHAR(500),
  signature_url VARCHAR(500),
  stamp_url VARCHAR(500),
   bonafide_template_url VARCHAR(500),
   bonafide_template_data BYTEA,
   lc_template_url VARCHAR(500),
   lc_template_data BYTEA,
   id_card_template_url VARCHAR(500),
   id_card_template_data BYTEA,
  cert_header TEXT,
  cert_footer TEXT,
  id_card_primary_color VARCHAR(100) DEFAULT 'linear-gradient(135deg,#1a6fd4,#1557b0)',
  id_card_school_name VARCHAR(200),
  id_card_subtitle VARCHAR(200) DEFAULT 'Student ID Card',
  id_card_footer_text VARCHAR(255) DEFAULT 'If found, please contact the school office.',
  id_card_show_register_number SMALLINT NOT NULL DEFAULT 1,
  id_card_show_aadhaar SMALLINT NOT NULL DEFAULT 1,
  id_card_show_dob SMALLINT NOT NULL DEFAULT 1,
  id_card_show_address SMALLINT NOT NULL DEFAULT 0,
  id_card_show_emergency_contact SMALLINT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_school_admin FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_school_distributor FOREIGN KEY (distributor_id) REFERENCES distributors(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_schools_status ON schools (status);
CREATE INDEX IF NOT EXISTS idx_schools_distributor ON schools (distributor_id);
CREATE INDEX IF NOT EXISTS idx_schools_super_distributor ON schools (super_distributor_id);
CREATE INDEX IF NOT EXISTS idx_schools_login_id ON schools (login_id);
CREATE INDEX IF NOT EXISTS idx_schools_deleted_at ON schools (deleted_at);
CREATE OR REPLACE TRIGGER trigger_schools_updated_at
  BEFORE UPDATE ON schools FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- CAMP REQUESTS
-- ============================================
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
  CONSTRAINT fk_camp_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_camp_requests_school ON camp_requests (school_id);
CREATE INDEX IF NOT EXISTS idx_camp_requests_distributor ON camp_requests (distributor_id);
CREATE INDEX IF NOT EXISTS idx_camp_requests_super_distributor ON camp_requests (super_distributor_id);

-- ============================================
-- WALLETS (one per school)
-- ============================================
CREATE TABLE IF NOT EXISTS wallets (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  school_id VARCHAR(36) NOT NULL UNIQUE,
  balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_wallet_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT chk_wallet_balance_nonneg CHECK (balance >= 0)
);
CREATE OR REPLACE TRIGGER trigger_wallets_updated_at
  BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- WALLET TRANSACTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  wallet_id VARCHAR(36) NOT NULL,
  type VARCHAR(10) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL,
  reason VARCHAR(50) NOT NULL,
  reference_id VARCHAR(36),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_wallettx_wallet FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
  CONSTRAINT chk_wallettx_amount_positive CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS idx_wallettx_wallet ON wallet_transactions (wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallettx_created ON wallet_transactions (created_at);

-- ============================================
-- WALLET RECHARGE REQUESTS
-- ============================================
CREATE TABLE IF NOT EXISTS wallet_requests (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  school_id VARCHAR(36) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  utr_number VARCHAR(50) NOT NULL,
  payment_date DATE NOT NULL,
  screenshot_path VARCHAR(500),
  remarks TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  reviewed_by VARCHAR(36),
  reviewed_at TIMESTAMP NULL,
  wallet_transaction_id VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_walletreq_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT fk_walletreq_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_walletreq_amount_positive CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS idx_walletreq_school ON wallet_requests (school_id);
CREATE INDEX IF NOT EXISTS idx_walletreq_status ON wallet_requests (status);

-- ============================================
-- BANK DETAILS
-- ============================================
CREATE TABLE IF NOT EXISTS bank_details (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  account_holder VARCHAR(150) NOT NULL,
  bank_name VARCHAR(150) NOT NULL,
  account_number VARCHAR(40) NOT NULL,
  ifsc VARCHAR(20) NOT NULL,
  branch VARCHAR(150),
  upi_id VARCHAR(100),
  qr_code_path VARCHAR(500),
  updated_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bankdetails_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE OR REPLACE TRIGGER trigger_bank_details_updated_at
  BEFORE UPDATE ON bank_details FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- STUDENTS
-- ============================================
CREATE TABLE IF NOT EXISTS students (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  school_id VARCHAR(36) NOT NULL,
  register_number VARCHAR(50),
  serial_id VARCHAR(50),
  full_name VARCHAR(150) NOT NULL,
  mother_name VARCHAR(150),
  father_name VARCHAR(150),
  gender VARCHAR(10),
  dob DATE,
  aadhaar VARCHAR(20),
  religion VARCHAR(50),
  caste VARCHAR(50),
  sub_caste VARCHAR(50),
  nationality VARCHAR(50) DEFAULT 'Indian',
  mother_tongue VARCHAR(50),
  birth_village VARCHAR(100),
  birth_taluka VARCHAR(100),
  birth_district VARCHAR(100),
  birth_state VARCHAR(100),
  birth_country VARCHAR(100) DEFAULT 'India',
  admission_standard VARCHAR(20),
  admission_division VARCHAR(10),
  admission_date DATE,
  prev_school VARCHAR(200),
  prev_standard VARCHAR(20),
  roll_number VARCHAR(20),
  blood_group VARCHAR(5),
  parent_mobile VARCHAR(15),
  address TEXT,
  photo_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_student_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_students_school ON students (school_id);
CREATE INDEX IF NOT EXISTS idx_students_name ON students (full_name);
CREATE OR REPLACE TRIGGER trigger_students_updated_at
  BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- CERTIFICATES
-- ============================================
CREATE TABLE IF NOT EXISTS certificates (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  school_id VARCHAR(36) NOT NULL,
  student_id VARCHAR(36) NOT NULL,
  type VARCHAR(20) NOT NULL,
  serial_number VARCHAR(50) NOT NULL UNIQUE,
  price DECIMAL(10,2) NOT NULL,
  gst_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  payment_method VARCHAR(20) NOT NULL DEFAULT 'wallet',
  wallet_transaction_id VARCHAR(36),
  pdf_path VARCHAR(500),
  purpose VARCHAR(255),
  certificate_variant VARCHAR(20) DEFAULT 'original',
  leaving_date DATE,
  since_when DATE,
  leaving_reason TEXT,
  leaving_remark TEXT,
  check_by_label VARCHAR(50) DEFAULT 'Check By',
  qr_payload TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_certificate_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT fk_certificate_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_certificate_wallettx FOREIGN KEY (wallet_transaction_id) REFERENCES wallet_transactions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_certificates_school ON certificates (school_id);
CREATE INDEX IF NOT EXISTS idx_certificates_student ON certificates (student_id);
CREATE INDEX IF NOT EXISTS idx_certificates_serial ON certificates (serial_number);

-- ============================================
-- MASTER DATA
-- ============================================
CREATE TABLE IF NOT EXISTS master_data (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  category VARCHAR(50) NOT NULL,
  value VARCHAR(100) NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_master_category ON master_data (category);
CREATE INDEX IF NOT EXISTS idx_master_category_active ON master_data (category, is_active);

-- ============================================
-- NOTIFICATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  user_id VARCHAR(36) NOT NULL,
  text VARCHAR(500) NOT NULL,
  is_read SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, is_read);

-- ============================================
-- AUDIT LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  user_id VARCHAR(36),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id VARCHAR(36),
  ip_address VARCHAR(45),
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at);

-- ============================================
-- REFRESH TOKENS
-- ============================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  user_id VARCHAR(36) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_refreshtoken_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_refreshtoken_user ON refresh_tokens (user_id);

-- ============================================
-- CERTIFICATE REQUESTS (approval flow)
-- ============================================
CREATE TABLE IF NOT EXISTS certificate_requests (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  school_id VARCHAR(36) NOT NULL,
  student_id VARCHAR(36) NOT NULL,
  type VARCHAR(20) NOT NULL,
  purpose VARCHAR(255),
  certificate_variant VARCHAR(20) DEFAULT 'original',
  leaving_date DATE,
  since_when DATE,
  leaving_reason TEXT,
  leaving_remark TEXT,
  check_by_label VARCHAR(50) DEFAULT 'Check By',
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
