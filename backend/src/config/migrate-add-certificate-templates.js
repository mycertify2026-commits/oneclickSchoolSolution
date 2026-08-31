// Adds custom certificate template support: a school can upload its own
// existing LC/Bonafide/ID-Card format (PDF/PNG/JPEG), the platform OCR-scans
// it to suggest where each dynamic field should be drawn, and once the
// School Admin confirms the mapping and activates the template, real
// certificate generation composites onto that uploaded design instead of
// the platform default. A school with no active template keeps rendering
// exactly as before this migration — these are two new, standalone tables,
// no ALTER on any existing table. Additive-only, safe to re-run.
const mysql = require('mysql2/promise');
require('dotenv').config();

async function tableExists(connection, dbName, table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) as count FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table]
  );
  return rows[0].count > 0;
}

async function migrateAddCertificateTemplates() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const dbName = process.env.DB_NAME;

  try {
    console.log(`Checking certificate-template tables in database '${dbName}'...`);

    if (await tableExists(connection, dbName, 'certificate_templates')) {
      console.log('  - certificate_templates: table already present, skipping create');
    } else {
      await connection.query(`
        CREATE TABLE \`certificate_templates\` (
          \`id\` CHAR(36) NOT NULL DEFAULT (UUID()),
          \`school_id\` CHAR(36) NOT NULL,
          \`doc_type\` VARCHAR(20) NOT NULL,
          \`name\` VARCHAR(150),
          \`version\` VARCHAR(30),
          \`source_file_url\` VARCHAR(500),
          \`source_file_data\` MEDIUMBLOB,
          \`source_file_type\` VARCHAR(10) NOT NULL,
          \`background_url\` VARCHAR(500),
          \`background_data\` MEDIUMBLOB,
          \`page_width_pt\` DECIMAL(8,2) NOT NULL,
          \`page_height_pt\` DECIMAL(8,2) NOT NULL,
          \`page_count\` INT NOT NULL DEFAULT 1,
          \`orientation\` VARCHAR(10) NOT NULL DEFAULT 'portrait',
          \`analysis_status\` VARCHAR(20) NOT NULL DEFAULT 'pending',
          \`analysis_error\` TEXT,
          \`status\` VARCHAR(20) NOT NULL DEFAULT 'draft',
          \`is_active\` TINYINT(1) NOT NULL DEFAULT 0,
          \`created_by\` CHAR(36),
          \`deleted_at\` DATETIME DEFAULT NULL,
          \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          FOREIGN KEY (\`school_id\`) REFERENCES \`schools\`(\`id\`) ON DELETE CASCADE,
          KEY \`idx_cert_templates_school\` (\`school_id\`),
          KEY \`idx_cert_templates_school_type_active\` (\`school_id\`, \`doc_type\`, \`is_active\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  + certificate_templates: table created');
    }

    if (await tableExists(connection, dbName, 'template_fields')) {
      console.log('  - template_fields: table already present, skipping create');
    } else {
      await connection.query(`
        CREATE TABLE \`template_fields\` (
          \`id\` CHAR(36) NOT NULL DEFAULT (UUID()),
          \`template_id\` CHAR(36) NOT NULL,
          \`field_type\` VARCHAR(20) NOT NULL DEFAULT 'text',
          \`field_key\` VARCHAR(60),
          \`static_text\` VARCHAR(255),
          \`label\` VARCHAR(100),
          \`x\` DECIMAL(8,2) NOT NULL,
          \`y\` DECIMAL(8,2) NOT NULL,
          \`width\` DECIMAL(8,2) NOT NULL,
          \`height\` DECIMAL(8,2) NOT NULL,
          \`font_size\` DECIMAL(5,2) NOT NULL DEFAULT 11.00,
          \`font_weight\` VARCHAR(10) NOT NULL DEFAULT 'normal',
          \`align\` VARCHAR(10) NOT NULL DEFAULT 'left',
          \`color\` VARCHAR(20) NOT NULL DEFAULT '#1a1a1a',
          \`source\` VARCHAR(20) NOT NULL DEFAULT 'manual',
          \`confidence\` DECIMAL(5,2),
          \`is_confirmed\` TINYINT(1) NOT NULL DEFAULT 0,
          \`sort_order\` INT NOT NULL DEFAULT 0,
          \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          FOREIGN KEY (\`template_id\`) REFERENCES \`certificate_templates\`(\`id\`) ON DELETE CASCADE,
          KEY \`idx_template_fields_template\` (\`template_id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  + template_fields: table created');
    }

    console.log('\nCertificate-templates migration completed successfully.');
  } catch (err) {
    console.error('Certificate-templates migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

migrateAddCertificateTemplates();
