-- ============================================
-- CERTIFYPRO MYSQL SCHEMA
-- Engine: InnoDB (required for FK support and transactions)
-- Charset: utf8mb4 (required for Marathi/Hindi/Devanagari text)
-- ============================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================
-- USERS (all roles: superAdmin, schoolAdmin, distributor)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  role ENUM('superAdmin', 'schoolAdmin', 'distributor') NOT NULL,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL,
  mobile VARCHAR(15),
  password_hash VARCHAR(255),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  password_set TINYINT(1) NOT NULL DEFAULT 0,
  created_by CHAR(36),
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_users_email (email),
  INDEX idx_users_role (role),
  INDEX idx_users_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- NOTE: email is intentionally NOT a column-level UNIQUE constraint. MySQL
-- has no native partial/conditional unique index, and a hard UNIQUE here
-- would permanently block re-using an email after a soft-deleted user -
-- exactly the "delete ABC School, then create ABC School" requirement.
-- Uniqueness among ACTIVE (non-deleted) users is enforced in application
-- code: every existence check filters `WHERE deleted_at IS NULL`.

-- ============================================
-- PASSWORD SETUP / RESET TOKENS
-- ============================================
CREATE TABLE IF NOT EXISTS password_tokens (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  type ENUM('setup', 'reset') NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pwtoken_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_pwtoken_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- DISTRIBUTORS (profile, linked 1:1 to a user)
-- ============================================
CREATE TABLE IF NOT EXISTS distributors (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  commission_rate DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  city VARCHAR(100),
  district VARCHAR(100),
  address TEXT,
  avatar_url VARCHAR(500),
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_distributor_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_distributors_user (user_id),
  INDEX idx_distributors_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- SCHOOLS
-- ============================================
CREATE TABLE IF NOT EXISTS schools (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  admin_user_id CHAR(36),
  distributor_id CHAR(36),
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
  logo_url VARCHAR(500),
  signature_url VARCHAR(500),
  stamp_url VARCHAR(500),
  cert_header TEXT,
  cert_footer TEXT,
  id_card_primary_color VARCHAR(100) DEFAULT 'linear-gradient(135deg,#1a6fd4,#1557b0)',
  id_card_school_name VARCHAR(200),
  id_card_subtitle VARCHAR(200) DEFAULT 'Student ID Card',
  id_card_footer_text VARCHAR(255) DEFAULT 'If found, please contact the school office.',
  id_card_show_register_number TINYINT(1) NOT NULL DEFAULT 1,
  id_card_show_aadhaar TINYINT(1) NOT NULL DEFAULT 1,
  id_card_show_dob TINYINT(1) NOT NULL DEFAULT 1,
  id_card_show_address TINYINT(1) NOT NULL DEFAULT 0,
  id_card_show_emergency_contact TINYINT(1) NOT NULL DEFAULT 1,
  status ENUM('pending', 'active', 'rejected', 'suspended') NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_school_admin FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_school_distributor FOREIGN KEY (distributor_id) REFERENCES distributors(id) ON DELETE SET NULL,
  INDEX idx_schools_status (status),
  INDEX idx_schools_distributor (distributor_id),
  INDEX idx_schools_login_id (login_id),
  INDEX idx_schools_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- NOTE: login_id and admin_user_id are intentionally not UNIQUE at the
-- column level, for the same soft-delete reason as users.email above.
-- Uniqueness among non-deleted schools is enforced in application code.

-- ============================================
-- WALLETS (one per school)
-- ============================================
CREATE TABLE IF NOT EXISTS wallets (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  school_id CHAR(36) NOT NULL UNIQUE,
  balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_wallet_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT chk_wallet_balance_nonneg CHECK (balance >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- WALLET TRANSACTIONS (immutable ledger - source of truth for balance)
-- ============================================
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  wallet_id CHAR(36) NOT NULL,
  type ENUM('credit', 'debit') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL,
  reason VARCHAR(50) NOT NULL,
  reference_id CHAR(36),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_wallettx_wallet FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
  CONSTRAINT chk_wallettx_amount_positive CHECK (amount > 0),
  INDEX idx_wallettx_wallet (wallet_id),
  INDEX idx_wallettx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- WALLET RECHARGE REQUESTS (manual bank transfer, replaces Razorpay)
-- School submits proof of a manual bank/UPI transfer; Super Admin reviews
-- and approves (credits wallet + creates a wallet_transactions row) or
-- rejects (with a reason, no balance change).
-- ============================================
CREATE TABLE IF NOT EXISTS wallet_requests (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- BANK DETAILS (Super-Admin-managed, shown to schools for manual transfer)
-- Single active row expected in normal use, but stored as a table (not a
-- settings key) so changing it leaves the old row intact for audit_logs
-- to reference ("old QR" in the audit trail means the previous row here).
-- ============================================
CREATE TABLE IF NOT EXISTS bank_details (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- STUDENTS
-- ============================================
CREATE TABLE IF NOT EXISTS students (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  school_id CHAR(36) NOT NULL,
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_student_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  INDEX idx_students_school (school_id),
  INDEX idx_students_name (full_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- CERTIFICATES (LC, Bonafide, ID Card)
-- ============================================
CREATE TABLE IF NOT EXISTS certificates (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  school_id CHAR(36) NOT NULL,
  student_id CHAR(36) NOT NULL,
  type ENUM('lc', 'bonafide', 'idcard') NOT NULL,
  serial_number VARCHAR(50) NOT NULL UNIQUE,
  price DECIMAL(10,2) NOT NULL,
  gst_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  payment_method ENUM('wallet') NOT NULL DEFAULT 'wallet',
  wallet_transaction_id CHAR(36),
  pdf_path VARCHAR(500),
  purpose VARCHAR(255),
  qr_payload TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_certificate_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT fk_certificate_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_certificate_wallettx FOREIGN KEY (wallet_transaction_id) REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  INDEX idx_certificates_school (school_id),
  INDEX idx_certificates_student (student_id),
  INDEX idx_certificates_serial (serial_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- MASTER DATA (Super Admin managed reference lists)
-- One row per value, grouped by category - lets the Settings UI's
-- 11 categories all live in a single table rather than 11 separate ones.
-- ============================================
CREATE TABLE IF NOT EXISTS master_data (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  category ENUM('standard','division','district','taluka','city','medium','religion','caste','grant_type','board_name','management_type') NOT NULL,
  value VARCHAR(100) NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_master_category (category),
  INDEX idx_master_category_active (category, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- NOTE: no hard UNIQUE(category, value) here - this was the confirmed root
-- cause of "delete an item, re-add the same value, get told it already
-- exists": MySQL's unique index covers ALL rows including soft-deleted
-- (is_active=0) ones, so the old row permanently blocked the name forever.
-- Uniqueness among ACTIVE items only is enforced in createMasterData().

-- ============================================
-- NOTIFICATIONS (in-app bell, per prototype's header dropdown)
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  text VARCHAR(500) NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notifications_user (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- AUDIT LOGS (security requirement from master prompt)
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id CHAR(36),
  ip_address VARCHAR(45),
  details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- REFRESH TOKENS (JWT refresh token rotation)
-- ============================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_refreshtoken_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_refreshtoken_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
