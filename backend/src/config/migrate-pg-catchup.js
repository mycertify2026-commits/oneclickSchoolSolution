// Every migrate-add-*.js script in this folder except migrate.js itself was
// written against mysql2 directly (hardcoded `require('mysql2/promise')`),
// so none of them ever reached the live PostgreSQL database this app
// actually runs against in production (DB_TYPE is unset, so db.js defaults
// to Postgres — see db.js's isMysql flag). This script closes that gap in
// one pass: every ADD COLUMN / CREATE TABLE those scripts applied to MySQL,
// translated to Postgres and re-checked against the live schema.pg.sql
// (which itself was already correct for some of them — e.g. wallet_requests,
// the idcard-design columns, soft-delete — those are left untouched here).
// Idempotent: IF NOT EXISTS on every statement, safe to re-run.
const { Client } = require('pg');
require('dotenv').config();

async function migrate() {
  const client = new Client({
    host: process.env.PGHOST || process.env.DB_HOST,
    port: parseInt(process.env.PGPORT || process.env.DB_PORT) || 5432,
    database: process.env.PGDATABASE || process.env.DB_NAME,
    user: process.env.PGUSER || process.env.DB_USER,
    password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
  });

  await client.connect();
  console.log('Connected to PostgreSQL database.');

  try {
    console.log('\n1. students — current class columns');
    await client.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS current_standard VARCHAR(20)`);
    await client.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS current_division VARCHAR(10)`);
    console.log('  + current_standard / current_division ensured');

    console.log('\n2. schools — id-card bg opacity / feature strip / geo photos');
    const schoolCols = [
      ['id_card_bg_opacity', "DECIMAL(3,2) NOT NULL DEFAULT 0.15"],
      ['id_card_border_color', 'VARCHAR(20)'],
      ['id_card_show_feature_strip', 'SMALLINT NOT NULL DEFAULT 1'],
      ['id_card_feature_icons', 'TEXT'],
      ['inside_photo_url', 'VARCHAR(500)'],
      ['inside_photo_lat', 'DECIMAL(10,7)'],
      ['inside_photo_lng', 'DECIMAL(10,7)'],
      ['inside_photo_captured_at', 'TIMESTAMP'],
      ['outside_photo_url', 'VARCHAR(500)'],
      ['outside_photo_lat', 'DECIMAL(10,7)'],
      ['outside_photo_lng', 'DECIMAL(10,7)'],
      ['outside_photo_captured_at', 'TIMESTAMP'],
    ];
    for (const [name, def] of schoolCols) {
      await client.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS ${name} ${def}`);
    }
    console.log(`  + ${schoolCols.length} schools columns ensured`);

    console.log('\n3. cart_items table');
    await client.query(`
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
        certificate_variant VARCHAR(20) DEFAULT 'original',
        leaving_date DATE,
        since_when DATE,
        leaving_reason TEXT,
        leaving_remark TEXT,
        check_by_label VARCHAR(50) DEFAULT 'Check By',
        CONSTRAINT fk_cart_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        CONSTRAINT fk_cart_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cart_school_status ON cart_items (school_id, status)`);
    console.log('  + cart_items ensured');

    console.log('\n4. id_card_hard_copy_requests table');
    await client.query(`
      CREATE TABLE IF NOT EXISTS id_card_hard_copy_requests (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
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
        CONSTRAINT fk_idcardhc_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        CONSTRAINT fk_idcardhc_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
      );
    `);
    console.log('  + id_card_hard_copy_requests ensured');

    console.log('\n5. id_card_pricing table (+ seed)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS id_card_pricing (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
        copy_type VARCHAR(20) NOT NULL UNIQUE,
        price DECIMAL(10,2) NOT NULL DEFAULT 20.00,
        updated_by VARCHAR(36),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const pricingCount = await client.query('SELECT COUNT(*) AS c FROM id_card_pricing');
    if (parseInt(pricingCount.rows[0].c) === 0) {
      await client.query(
        `INSERT INTO id_card_pricing (copy_type, price) VALUES ('soft', 20.00), ('hard', 20.00)`
      );
      console.log('  + id_card_pricing seeded soft=20.00, hard=20.00 (adjust from Super Admin > Pricing)');
    } else {
      console.log('  - id_card_pricing rows already present, skipping seed');
    }

    console.log('\n6. email_logs table');
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
        recipient VARCHAR(255) NOT NULL,
        sender VARCHAR(255),
        email_type VARCHAR(100),
        related_user_id VARCHAR(36),
        related_school_id VARCHAR(36),
        related_certificate_id VARCHAR(36),
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        error_message TEXT,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON email_logs (recipient)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_email_logs_type ON email_logs (email_type)`);
    console.log('  + email_logs ensured');

    console.log('\n7. otp_verifications table');
    await client.query(`
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
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_otp_user_purpose ON otp_verifications (user_id, purpose, used)`);
    console.log('  + otp_verifications ensured');

    console.log('\n8. certificate_pricing table (+ seed)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS certificate_pricing (
        type VARCHAR(20) PRIMARY KEY,
        price DECIMAL(10,2) NOT NULL,
        updated_by VARCHAR(36),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const certPricingCount = await client.query('SELECT COUNT(*) AS c FROM certificate_pricing');
    if (parseInt(certPricingCount.rows[0].c) === 0) {
      await client.query(`INSERT INTO certificate_pricing (type, price) VALUES ('lc', 50.00), ('bonafide', 30.00)`);
      console.log('  + certificate_pricing seeded lc=50.00, bonafide=30.00');
    } else {
      console.log('  - certificate_pricing rows already present, skipping seed');
    }

    console.log('\n9. receipts table');
    await client.query(`
      CREATE TABLE IF NOT EXISTS receipts (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
        certificate_id VARCHAR(36) NOT NULL UNIQUE,
        school_id VARCHAR(36) NOT NULL,
        student_id VARCHAR(36) NOT NULL,
        receipt_number VARCHAR(50) NOT NULL UNIQUE,
        certificate_type VARCHAR(20) NOT NULL,
        certificate_variant VARCHAR(20) DEFAULT 'original',
        base_price DECIMAL(10,2) NOT NULL,
        receipt_amount DECIMAL(10,2) NOT NULL,
        pdf_path VARCHAR(500),
        generated_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_receipt_certificate FOREIGN KEY (certificate_id) REFERENCES certificates(id) ON DELETE CASCADE,
        CONSTRAINT fk_receipt_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        CONSTRAINT fk_receipt_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        CONSTRAINT fk_receipt_generated_by FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL
      );
    `);
    console.log('  + receipts ensured');

    console.log('\n10. commission_config table (+ seed default row)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS commission_config (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
        school_pct DECIMAL(5,2) NOT NULL DEFAULT 50.00,
        platform_pct DECIMAL(5,2) NOT NULL DEFAULT 50.00,
        super_admin_pct DECIMAL(5,2) NOT NULL DEFAULT 100.00,
        super_distributor_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        distributor_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        updated_by VARCHAR(36),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const commissionConfigCount = await client.query('SELECT COUNT(*) AS c FROM commission_config');
    if (parseInt(commissionConfigCount.rows[0].c) === 0) {
      await client.query(`
        INSERT INTO commission_config (school_pct, platform_pct, super_admin_pct, super_distributor_pct, distributor_pct)
        VALUES (50.00, 50.00, 100.00, 0.00, 0.00)
      `);
      console.log('  + commission_config seeded default row (school 50 / platform 50; platform split SA 100 / SD 0 / Dist 0)');
    } else {
      console.log('  - commission_config row already present, skipping seed');
    }

    console.log('\n11. commission_ledger table');
    await client.query(`
      CREATE TABLE IF NOT EXISTS commission_ledger (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
        certificate_id VARCHAR(36) NOT NULL UNIQUE,
        school_id VARCHAR(36) NOT NULL,
        distributor_id VARCHAR(36),
        super_distributor_id VARCHAR(36),
        certificate_type VARCHAR(20) NOT NULL,
        certificate_price DECIMAL(10,2) NOT NULL,
        school_pct DECIMAL(5,2) NOT NULL,
        school_share DECIMAL(10,2) NOT NULL,
        platform_pct DECIMAL(5,2) NOT NULL,
        platform_share DECIMAL(10,2) NOT NULL,
        super_admin_pct DECIMAL(5,2) NOT NULL,
        super_admin_amount DECIMAL(10,2) NOT NULL,
        super_distributor_pct DECIMAL(5,2) NOT NULL,
        super_distributor_amount DECIMAL(10,2) NOT NULL,
        distributor_pct DECIMAL(5,2) NOT NULL,
        distributor_amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_ledger_certificate FOREIGN KEY (certificate_id) REFERENCES certificates(id) ON DELETE CASCADE,
        CONSTRAINT fk_ledger_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        CONSTRAINT fk_ledger_distributor FOREIGN KEY (distributor_id) REFERENCES distributors(id) ON DELETE SET NULL
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ledger_school ON commission_ledger (school_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ledger_distributor ON commission_ledger (distributor_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ledger_super_distributor ON commission_ledger (super_distributor_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ledger_created ON commission_ledger (created_at)`);
    console.log('  + commission_ledger ensured');

    console.log('\n12. certificates — soft-delete column');
    await client.query(`ALTER TABLE certificates ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL`);
    console.log('  + certificates.deleted_at ensured');

    console.log('\n13. certificate_templates + template_fields tables');
    await client.query(`
      CREATE TABLE IF NOT EXISTS certificate_templates (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
        school_id VARCHAR(36) NOT NULL,
        doc_type VARCHAR(20) NOT NULL,
        name VARCHAR(150),
        version VARCHAR(30),
        source_file_url VARCHAR(500),
        source_file_data BYTEA,
        source_file_type VARCHAR(10) NOT NULL,
        background_url VARCHAR(500),
        background_data BYTEA,
        page_width_pt DECIMAL(8,2) NOT NULL,
        page_height_pt DECIMAL(8,2) NOT NULL,
        page_count INT NOT NULL DEFAULT 1,
        orientation VARCHAR(10) NOT NULL DEFAULT 'portrait',
        analysis_status VARCHAR(20) NOT NULL DEFAULT 'pending',
        analysis_error TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        is_active SMALLINT NOT NULL DEFAULT 0,
        created_by VARCHAR(36),
        deleted_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_certtpl_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cert_templates_school ON certificate_templates (school_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cert_templates_school_type_active ON certificate_templates (school_id, doc_type, is_active)`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS template_fields (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
        template_id VARCHAR(36) NOT NULL,
        field_type VARCHAR(20) NOT NULL DEFAULT 'text',
        field_key VARCHAR(60),
        static_text VARCHAR(255),
        label VARCHAR(100),
        x DECIMAL(8,2) NOT NULL,
        y DECIMAL(8,2) NOT NULL,
        width DECIMAL(8,2) NOT NULL,
        height DECIMAL(8,2) NOT NULL,
        font_size DECIMAL(5,2) NOT NULL DEFAULT 11.00,
        font_weight VARCHAR(10) NOT NULL DEFAULT 'normal',
        align VARCHAR(10) NOT NULL DEFAULT 'left',
        color VARCHAR(20) NOT NULL DEFAULT '#1a1a1a',
        source VARCHAR(20) NOT NULL DEFAULT 'manual',
        confidence DECIMAL(5,2),
        is_confirmed SMALLINT NOT NULL DEFAULT 0,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_tplfield_template FOREIGN KEY (template_id) REFERENCES certificate_templates(id) ON DELETE CASCADE
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_template_fields_template ON template_fields (template_id)`);
    console.log('  + certificate_templates / template_fields ensured');

    console.log('\n14. distributors — PAN + payout bank details (shared table: also covers Super Distributor profiles)');
    const distributorPayoutCols = [
      ['pan_number', 'VARCHAR(20)'],
      ['bank_account_holder', 'VARCHAR(150)'],
      ['bank_name', 'VARCHAR(150)'],
      ['bank_account_number', 'VARCHAR(40)'],
      ['bank_ifsc', 'VARCHAR(20)'],
    ];
    for (const [name, def] of distributorPayoutCols) {
      await client.query(`ALTER TABLE distributors ADD COLUMN IF NOT EXISTS ${name} ${def}`);
    }
    console.log(`  + ${distributorPayoutCols.length} distributors columns ensured`);

    console.log('\n15. schools — class range (which standards the school covers)');
    await client.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS class_from VARCHAR(20)`);
    await client.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS class_to VARCHAR(20)`);
    console.log('  + schools.class_from / class_to ensured');

    console.log('\nPostgreSQL catch-up migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

migrate();
