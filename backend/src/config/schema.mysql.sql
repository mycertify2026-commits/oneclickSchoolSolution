-- One Click School Solutions MySQL schema (generated from live PostgreSQL on 2026-08-14)
-- Import via phpMyAdmin into database 'certifypro'
SET FOREIGN_KEY_CHECKS=0;
SET sql_mode='NO_AUTO_VALUE_ON_ZERO';

DROP TABLE IF EXISTS `audit_logs`;
CREATE TABLE `audit_logs` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `user_id` VARCHAR(36),
  `action` VARCHAR(100) NOT NULL,
  `entity_type` VARCHAR(50),
  `entity_id` VARCHAR(36),
  `ip_address` VARCHAR(45),
  `details` JSON,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  KEY `idx_audit_created` (`created_at`),
  KEY `idx_audit_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `bank_details`;
CREATE TABLE `bank_details` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `account_holder` VARCHAR(150) NOT NULL,
  `bank_name` VARCHAR(150) NOT NULL,
  `account_number` VARCHAR(40) NOT NULL,
  `ifsc` VARCHAR(20) NOT NULL,
  `branch` VARCHAR(150),
  `upi_id` VARCHAR(100),
  `qr_code_path` VARCHAR(500),
  `updated_by` VARCHAR(36),
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `camp_requests`;
CREATE TABLE `camp_requests` (
  `id` VARCHAR(36) NOT NULL,
  `school_id` VARCHAR(36) NOT NULL,
  `distributor_id` VARCHAR(36),
  `super_distributor_id` VARCHAR(36),
  `camp_name` VARCHAR(200) NOT NULL,
  `required_docs` JSON NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
  `attender_name` VARCHAR(200),
  `attender_email` VARCHAR(200),
  `attender_phone` VARCHAR(30),
  `notes` TEXT,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `cart_items`;
CREATE TABLE `cart_items` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `school_id` VARCHAR(36) NOT NULL,
  `student_id` VARCHAR(36) NOT NULL,
  `type` VARCHAR(20) NOT NULL,
  `purpose` VARCHAR(255),
  `price` DECIMAL(10,2) NOT NULL,
  `gst_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `status` VARCHAR(20) NOT NULL DEFAULT 'in_cart',
  `added_by` VARCHAR(36),
  `certificate_id` VARCHAR(36),
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `certificate_variant` VARCHAR(20) DEFAULT 'original',
  `leaving_date` DATE,
  `since_when` DATE,
  `leaving_reason` TEXT,
  `leaving_remark` TEXT,
  `check_by_label` VARCHAR(50) DEFAULT 'Check By',
  PRIMARY KEY (`id`),
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE,
  KEY `idx_cart_school_status` (`school_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `certificate_requests`;
CREATE TABLE `certificate_requests` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `school_id` VARCHAR(36) NOT NULL,
  `student_id` VARCHAR(36) NOT NULL,
  `type` VARCHAR(20) NOT NULL,
  `purpose` VARCHAR(255),
  `price` DECIMAL(10,2) NOT NULL,
  `gst_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `approval_code` VARCHAR(6) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `rejection_reason` TEXT,
  `approved_by` VARCHAR(36),
  `resolved_at` DATETIME,
  `certificate_id` VARCHAR(36),
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE,
  KEY `idx_certreq_created` (`created_at`),
  KEY `idx_certreq_school` (`school_id`),
  KEY `idx_certreq_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `certificates`;
CREATE TABLE `certificates` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `school_id` VARCHAR(36) NOT NULL,
  `student_id` VARCHAR(36) NOT NULL,
  `cart_item_id` VARCHAR(36),
  `type` VARCHAR(20) NOT NULL,
  `serial_number` VARCHAR(50) NOT NULL,
  `price` DECIMAL(10,2) NOT NULL,
  `gst_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `payment_method` VARCHAR(20) NOT NULL DEFAULT 'wallet',
  `wallet_transaction_id` VARCHAR(36),
  `pdf_path` VARCHAR(500),
  `purpose` VARCHAR(255),
  `qr_payload` TEXT,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `certificate_variant` VARCHAR(20) DEFAULT 'original',
  `leaving_date` DATE,
  `since_when` DATE,
  `leaving_reason` TEXT,
  `leaving_remark` TEXT,
  `check_by_label` VARCHAR(50) DEFAULT 'Check By',
  PRIMARY KEY (`id`),
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`wallet_transaction_id`) REFERENCES `wallet_transactions`(`id`) ON DELETE SET NULL,
  UNIQUE KEY `certificates_serial_number_key` (`serial_number`),
  KEY `idx_certificates_school` (`school_id`),
  KEY `idx_certificates_serial` (`serial_number`),
  KEY `idx_certificates_student` (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `distributors`;
CREATE TABLE `distributors` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `user_id` VARCHAR(36) NOT NULL,
  `commission_rate` DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  `city` VARCHAR(100),
  `district` VARCHAR(100),
  `address` TEXT,
  `avatar_url` VARCHAR(500),
  `deleted_at` DATETIME,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `super_distributor_id` VARCHAR(36),
  `area_of_operation` VARCHAR(255),
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  KEY `idx_distributors_deleted_at` (`deleted_at`),
  KEY `idx_distributors_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `id_card_hard_copy_requests`;
CREATE TABLE `id_card_hard_copy_requests` (
  `id` VARCHAR(36) NOT NULL,
  `school_id` VARCHAR(36) NOT NULL,
  `student_id` VARCHAR(36) NOT NULL,
  `distributor_id` VARCHAR(36),
  `super_distributor_id` VARCHAR(36),
  `amount` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `wallet_transaction_id` VARCHAR(36),
  `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
  `notes` TEXT,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `id_card_pricing`;
CREATE TABLE `id_card_pricing` (
  `id` VARCHAR(36) NOT NULL,
  `copy_type` VARCHAR(20) NOT NULL,
  `price` DECIMAL(10,2) NOT NULL DEFAULT 20.00,
  `updated_by` VARCHAR(36),
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_card_pricing_copy_type_key` (`copy_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `master_data`;
CREATE TABLE `master_data` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `category` VARCHAR(50) NOT NULL,
  `value` VARCHAR(100) NOT NULL,
  `display_order` INT NOT NULL DEFAULT 0,
  `is_active` SMALLINT NOT NULL DEFAULT 1,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_master_category` (`category`),
  KEY `idx_master_category_active` (`category`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `template_fields`;
DROP TABLE IF EXISTS `certificate_templates`;
CREATE TABLE `certificate_templates` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `school_id` CHAR(36) NOT NULL,
  `doc_type` VARCHAR(20) NOT NULL,
  `name` VARCHAR(150),
  `version` VARCHAR(30),
  `source_file_url` VARCHAR(500),
  `source_file_data` MEDIUMBLOB,
  `source_file_type` VARCHAR(10) NOT NULL,
  `background_url` VARCHAR(500),
  `background_data` MEDIUMBLOB,
  `page_width_pt` DECIMAL(8,2) NOT NULL,
  `page_height_pt` DECIMAL(8,2) NOT NULL,
  `page_count` INT NOT NULL DEFAULT 1,
  `orientation` VARCHAR(10) NOT NULL DEFAULT 'portrait',
  `analysis_status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `analysis_error` TEXT,
  `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
  `is_active` TINYINT(1) NOT NULL DEFAULT 0,
  `created_by` CHAR(36),
  `deleted_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE,
  KEY `idx_cert_templates_school` (`school_id`),
  KEY `idx_cert_templates_school_type_active` (`school_id`, `doc_type`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `template_fields` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `template_id` CHAR(36) NOT NULL,
  `field_type` VARCHAR(20) NOT NULL DEFAULT 'text',
  `field_key` VARCHAR(60),
  `static_text` VARCHAR(255),
  `label` VARCHAR(100),
  `x` DECIMAL(8,2) NOT NULL,
  `y` DECIMAL(8,2) NOT NULL,
  `width` DECIMAL(8,2) NOT NULL,
  `height` DECIMAL(8,2) NOT NULL,
  `font_size` DECIMAL(5,2) NOT NULL DEFAULT 11.00,
  `font_weight` VARCHAR(10) NOT NULL DEFAULT 'normal',
  `align` VARCHAR(10) NOT NULL DEFAULT 'left',
  `color` VARCHAR(20) NOT NULL DEFAULT '#1a1a1a',
  `source` VARCHAR(20) NOT NULL DEFAULT 'manual',
  `confidence` DECIMAL(5,2),
  `is_confirmed` TINYINT(1) NOT NULL DEFAULT 0,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`template_id`) REFERENCES `certificate_templates`(`id`) ON DELETE CASCADE,
  KEY `idx_template_fields_template` (`template_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `notifications`;
CREATE TABLE `notifications` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `user_id` VARCHAR(36) NOT NULL,
  `text` VARCHAR(500) NOT NULL,
  `is_read` SMALLINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  KEY `idx_notifications_user` (`user_id`,`is_read`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `email_logs`;
CREATE TABLE `email_logs` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `recipient` VARCHAR(255) NOT NULL,
  `sender` VARCHAR(255),
  `email_type` VARCHAR(100),
  `related_user_id` VARCHAR(36),
  `related_school_id` VARCHAR(36),
  `related_certificate_id` VARCHAR(36),
  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  `error_message` TEXT,
  `sent_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_email_logs_recipient` (`recipient`),
  KEY `idx_email_logs_type` (`email_type`),
  KEY `idx_email_logs_related_user` (`related_user_id`),
  KEY `idx_email_logs_related_school` (`related_school_id`),
  KEY `idx_email_logs_related_certificate` (`related_certificate_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `otp_verifications`;
CREATE TABLE `otp_verifications` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `user_id` VARCHAR(36) NOT NULL,
  `purpose` VARCHAR(50) NOT NULL DEFAULT 'cart_submission',
  `otp_hash` VARCHAR(255) NOT NULL,
  `cart_snapshot` TEXT,
  `attempts` INT NOT NULL DEFAULT 0,
  `used` SMALLINT NOT NULL DEFAULT 0,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  KEY `idx_otp_user_purpose` (`user_id`,`purpose`,`used`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `password_tokens`;
CREATE TABLE `password_tokens` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `user_id` VARCHAR(36) NOT NULL,
  `token` VARCHAR(255) NOT NULL,
  `type` VARCHAR(10) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `used` SMALLINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  KEY `idx_pwtoken_token` (`token`),
  UNIQUE KEY `password_tokens_token_key` (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `refresh_tokens`;
CREATE TABLE `refresh_tokens` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `user_id` VARCHAR(36) NOT NULL,
  `token_hash` VARCHAR(255) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `revoked` SMALLINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  KEY `idx_refreshtoken_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `schools`;
CREATE TABLE `schools` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `admin_user_id` VARCHAR(36),
  `distributor_id` VARCHAR(36),
  `name` VARCHAR(200) NOT NULL,
  `login_id` VARCHAR(30),
  `udise_code` VARCHAR(20),
  `village` VARCHAR(100),
  `city` VARCHAR(100),
  `district` VARCHAR(100),
  `taluka` VARCHAR(100),
  `pin_code` VARCHAR(10),
  `phone` VARCHAR(15),
  `email` VARCHAR(150),
  `medium` VARCHAR(30),
  `board` VARCHAR(50),
  `logo_url` VARCHAR(500),
  `signature_url` VARCHAR(500),
  `stamp_url` VARCHAR(500),
  `bonafide_template_url` VARCHAR(500),
  `bonafide_template_data` MEDIUMBLOB,
  `lc_template_url` VARCHAR(500),
  `lc_template_data` MEDIUMBLOB,
  `id_card_template_url` VARCHAR(500),
  `id_card_template_data` MEDIUMBLOB,
  `cert_header` TEXT,
  `cert_footer` TEXT,
  `id_card_primary_color` VARCHAR(100) DEFAULT 'linear-gradient(135deg,#1a6fd4,#1557b0)',
  `id_card_school_name` VARCHAR(200),
  `id_card_subtitle` VARCHAR(200) DEFAULT 'Student ID Card',
  `id_card_footer_text` VARCHAR(255) DEFAULT 'If found, please contact the school office.',
  `id_card_show_register_number` SMALLINT NOT NULL DEFAULT 1,
  `id_card_show_aadhaar` SMALLINT NOT NULL DEFAULT 1,
  `id_card_show_dob` SMALLINT NOT NULL DEFAULT 1,
  `id_card_show_address` SMALLINT NOT NULL DEFAULT 0,
  `id_card_show_emergency_contact` SMALLINT NOT NULL DEFAULT 1,
  `principal_name` VARCHAR(200),
  `recog_no` VARCHAR(100),
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `rejection_reason` TEXT,
  `deleted_at` DATETIME,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `logo_data` TEXT,
  `signature_data` TEXT,
  `stamp_data` TEXT,
  `area_of_operation` VARCHAR(255),
  `super_distributor_id` VARCHAR(36),
  `id_card_bg_data` MEDIUMBLOB,
  `id_card_bg_opacity` DECIMAL(3,2) NOT NULL DEFAULT 0.15,
  `id_card_border_color` VARCHAR(20),
  `id_card_show_feature_strip` TINYINT(1) NOT NULL DEFAULT 1,
  `id_card_feature_icons` TEXT,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`admin_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`distributor_id`) REFERENCES `distributors`(`id`) ON DELETE SET NULL,
  KEY `idx_schools_deleted_at` (`deleted_at`),
  KEY `idx_schools_distributor` (`distributor_id`),
  KEY `idx_schools_login_id` (`login_id`),
  KEY `idx_schools_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `students`;
CREATE TABLE `students` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `school_id` VARCHAR(36) NOT NULL,
  `register_number` VARCHAR(50),
  `serial_id` VARCHAR(50),
  `full_name` VARCHAR(150) NOT NULL,
  `mother_name` VARCHAR(150),
  `father_name` VARCHAR(150),
  `gender` VARCHAR(10),
  `dob` DATE,
  `aadhaar` VARCHAR(20),
  `religion` VARCHAR(50),
  `caste` VARCHAR(50),
  `sub_caste` VARCHAR(50),
  `nationality` VARCHAR(50) DEFAULT 'Indian',
  `mother_tongue` VARCHAR(50),
  `birth_village` VARCHAR(100),
  `birth_taluka` VARCHAR(100),
  `birth_district` VARCHAR(100),
  `birth_state` VARCHAR(100),
  `birth_country` VARCHAR(100) DEFAULT 'India',
  `admission_standard` VARCHAR(20),
  `admission_division` VARCHAR(10),
  `current_standard` VARCHAR(20),
  `current_division` VARCHAR(10),
  `admission_date` DATE,
  `prev_school` VARCHAR(200),
  `prev_standard` VARCHAR(20),
  `roll_number` VARCHAR(20),
  `blood_group` VARCHAR(5),
  `parent_mobile` VARCHAR(15),
  `address` TEXT,
  `photo_url` VARCHAR(500),
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `photo_data` TEXT,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE,
  KEY `idx_students_name` (`full_name`),
  KEY `idx_students_school` (`school_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `role` VARCHAR(30) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `mobile` VARCHAR(15),
  `password_hash` VARCHAR(255),
  `is_active` SMALLINT NOT NULL DEFAULT 1,
  `password_set` SMALLINT NOT NULL DEFAULT 0,
  `created_by` VARCHAR(36),
  `deleted_at` DATETIME,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  KEY `idx_users_deleted_at` (`deleted_at`),
  KEY `idx_users_email` (`email`),
  KEY `idx_users_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `wallet_requests`;
CREATE TABLE `wallet_requests` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `school_id` VARCHAR(36) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `utr_number` VARCHAR(50) NOT NULL,
  `payment_date` DATE NOT NULL,
  `screenshot_path` VARCHAR(500),
  `remarks` TEXT,
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `rejection_reason` TEXT,
  `reviewed_by` VARCHAR(36),
  `reviewed_at` DATETIME,
  `wallet_transaction_id` VARCHAR(36),
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE,
  KEY `idx_walletreq_school` (`school_id`),
  KEY `idx_walletreq_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `wallet_transactions`;
CREATE TABLE `wallet_transactions` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `wallet_id` VARCHAR(36) NOT NULL,
  `type` VARCHAR(10) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `balance_after` DECIMAL(12,2) NOT NULL,
  `reason` VARCHAR(50) NOT NULL,
  `reference_id` VARCHAR(36),
  `description` TEXT,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE CASCADE,
  KEY `idx_wallettx_created` (`created_at`),
  KEY `idx_wallettx_wallet` (`wallet_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS `wallets`;
CREATE TABLE `wallets` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
  `school_id` VARCHAR(36) NOT NULL,
  `balance` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `wallets_school_id_key` (`school_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS=1;
