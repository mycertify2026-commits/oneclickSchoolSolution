-- One Click School Solutions data export
SET FOREIGN_KEY_CHECKS=0;
SET NAMES utf8mb4;

-- bank_details: 1 rows
INSERT INTO `bank_details` (`id`,`account_holder`,`bank_name`,`account_number`,`ifsc`,`branch`,`upi_id`,`qr_code_path`,`updated_by`,`created_at`,`updated_at`) VALUES
('1542d79c-b5d2-4b04-a27a-cd50bad7eeab','One Click School Solutions','State Bank of India','00000000000000','SBIN0000000','Main Branch','oneclickschool@upi',NULL,'faae068a-933e-4e09-9302-805aa717a66a','2026-08-11 09:00:02','2026-08-11 09:00:02');

-- camp_requests: 1 rows
INSERT INTO `camp_requests` (`id`,`school_id`,`distributor_id`,`super_distributor_id`,`camp_name`,`required_docs`,`start_date`,`end_date`,`status`,`attender_name`,`attender_email`,`attender_phone`,`notes`,`created_at`,`updated_at`) VALUES
('5c3fc528-f0e2-4601-92b7-5103abe35da5','30d9fe63-3f2f-4cb7-87e0-12b5cfce32b2',NULL,NULL,'Annual Health Camp','[]','2026-09-01 00:00:00','2026-09-03 00:00:00','pending',NULL,NULL,NULL,NULL,'2026-08-11 09:19:29','2026-08-11 09:19:29');

-- distributors: 1 rows
INSERT INTO `distributors` (`id`,`user_id`,`commission_rate`,`city`,`district`,`address`,`avatar_url`,`deleted_at`,`created_at`,`super_distributor_id`,`area_of_operation`) VALUES
('0eb273dc-cd47-47cc-b5b7-2e0c5e903ee8','e62490c2-1f2f-4b4c-aec9-b3691f6b9d72','10.00',NULL,NULL,NULL,NULL,NULL,'2026-08-11 09:00:02',NULL,NULL);

-- id_card_pricing: 2 rows
INSERT INTO `id_card_pricing` (`id`,`copy_type`,`price`,`updated_by`,`updated_at`) VALUES
('329dcbf7-49f4-4b55-99f8-bc96c405139a','soft','20.00',NULL,'2026-08-11 09:00:01'),
('b9fb4382-e07a-487a-a5fb-9ee25142d41b','hard','100.00',NULL,'2026-08-11 09:00:01');

-- master_data: 66 rows
INSERT INTO `master_data` (`id`,`category`,`value`,`display_order`,`is_active`,`created_at`) VALUES
('f7ff9d2a-5768-460e-b08b-c9761c63ac6f','standard','1st',0,1,'2026-08-11 09:00:01'),
('62fc0226-df4b-41d8-a28d-91bf933e7753','standard','2nd',1,1,'2026-08-11 09:00:01'),
('21977a76-da30-4973-ae6f-2c7da1baa5c3','standard','3rd',2,1,'2026-08-11 09:00:01'),
('d98756e1-7709-4882-90d4-7dc7351c1018','standard','4th',3,1,'2026-08-11 09:00:01'),
('7858f019-0449-41c9-9670-1841da7efe70','standard','5th',4,1,'2026-08-11 09:00:01'),
('a2c988ef-36ed-4faa-bcd3-b506e79dbeb8','standard','6th',5,1,'2026-08-11 09:00:01'),
('5aa44f43-e91e-4214-89a0-e0179adb01bb','standard','7th',6,1,'2026-08-11 09:00:01'),
('f92e68c5-13bf-4ed9-b47a-2c9273274563','standard','8th',7,1,'2026-08-11 09:00:01'),
('d6a31802-9f31-4fe3-89fd-9708b3e48d67','standard','9th',8,1,'2026-08-11 09:00:01'),
('8007f3bb-0258-4f57-ae22-0634ffb21d62','standard','10th',9,1,'2026-08-11 09:00:01'),
('50522f92-20ef-4b4d-a51d-285539d687d7','standard','11th',10,1,'2026-08-11 09:00:01'),
('5d99a21a-781c-4c77-96b0-700a28c5953d','standard','12th',11,1,'2026-08-11 09:00:01'),
('a70eea57-c0d9-42fb-993a-150e1a486598','division','A',0,1,'2026-08-11 09:00:01'),
('f30a4a17-dbc2-40f4-8da0-ea80ebb756c8','division','B',1,1,'2026-08-11 09:00:01'),
('26eee5f6-55f1-47f6-8168-bf7c4a6882e3','division','C',2,1,'2026-08-11 09:00:01'),
('9ab7adf6-3c4e-4f15-bea3-eb06edc0cf25','division','D',3,1,'2026-08-11 09:00:01'),
('b5f990c0-615f-4ced-9c6f-0649269e1555','district','Pune',0,1,'2026-08-11 09:00:01'),
('27a964a8-4221-425e-b203-2ce8f6334cad','district','Mumbai',1,1,'2026-08-11 09:00:01'),
('c875abf2-36fd-4a0c-a904-14a2cf824ebe','district','Nashik',2,1,'2026-08-11 09:00:01'),
('c2d0ce36-c508-4af9-81f8-ce3caec26d68','district','Nagpur',3,1,'2026-08-11 09:00:01'),
('60b40e89-64e3-4de8-8fbc-ab258fba4275','district','Aurangabad',4,1,'2026-08-11 09:00:01'),
('b58f48b2-55ee-4c21-89f2-c2949b62486c','district','Solapur',5,1,'2026-08-11 09:00:01'),
('74e2f8ed-0265-4f9c-9fea-8c0e3c2c61d0','district','Kolhapur',6,1,'2026-08-11 09:00:01'),
('bf4a784b-dbef-4b32-800e-72c9f4a008c5','district','Satara',7,1,'2026-08-11 09:00:01'),
('830ab184-728e-4d87-8a40-62c02653e040','district','Sangli',8,1,'2026-08-11 09:00:01'),
('8d91d8d3-9dc1-4026-bbfa-a1469494b27d','district','Ahmednagar',9,1,'2026-08-11 09:00:01'),
('a28c5aa6-c240-4fbf-add5-606538482dff','taluka','Haveli',0,1,'2026-08-11 09:00:01'),
('5e6895e7-19d3-4f79-9973-a1cb269bb2cd','taluka','Mulshi',1,1,'2026-08-11 09:00:01'),
('09663447-1e4f-4013-bb58-ffe9e309c491','taluka','Maval',2,1,'2026-08-11 09:00:02'),
('fe86cc7c-532d-4a56-8191-b1ce609cadb0','taluka','Baramati',3,1,'2026-08-11 09:00:02'),
('effccf97-8a59-45e6-a29b-d1fffdee12b4','taluka','Indapur',4,1,'2026-08-11 09:00:02'),
('b043c906-8fbe-4f8e-83fe-f72dcc7ac38c','city','Pune',0,1,'2026-08-11 09:00:02'),
('46a2e0e5-b11a-4b88-b646-81704eb179c3','city','Mumbai',1,1,'2026-08-11 09:00:02'),
('82910497-fe5d-49c0-aacd-f614e76d7988','city','Nashik',2,1,'2026-08-11 09:00:02'),
('30bfbf9d-56d3-43a0-8ba2-31ea9e260dbb','city','Nagpur',3,1,'2026-08-11 09:00:02'),
('b6b9abe2-d7d5-4b0f-aec2-4afef4394762','medium','Marathi',0,1,'2026-08-11 09:00:02'),
('662316fb-1ecf-468b-a668-65ba206be071','medium','English',1,1,'2026-08-11 09:00:02'),
('bdd6677b-79fc-47ee-85f2-ea789df75bf7','medium','Hindi',2,1,'2026-08-11 09:00:02'),
('294e0d54-d140-4a05-9c22-9831410a5a63','medium','Semi-English',3,1,'2026-08-11 09:00:02'),
('fc309633-05e6-4786-bb49-24c02bf60ffb','medium','Urdu',4,1,'2026-08-11 09:00:02'),
('77de2369-0263-4543-ba7f-73bbb4ba77ab','religion','Hindu',0,1,'2026-08-11 09:00:02'),
('b03f787b-927d-4b84-87c5-06d8dc55cc4b','religion','Muslim',1,1,'2026-08-11 09:00:02'),
('9f08ce76-da27-47ec-9228-0a96fd72b231','religion','Christian',2,1,'2026-08-11 09:00:02'),
('fadad118-73c1-4d9c-a08e-3bae9b16ff51','religion','Sikh',3,1,'2026-08-11 09:00:02'),
('d19fdd62-45bc-42ec-8e91-24e20182a21e','religion','Buddhist',4,1,'2026-08-11 09:00:02'),
('534967de-9296-4d70-b35f-e4503f693909','religion','Jain',5,1,'2026-08-11 09:00:02'),
('7559615b-be35-4de7-aa58-aae25e886de5','religion','Other',6,1,'2026-08-11 09:00:02'),
('b3f11793-ae5b-4342-a1ef-6734fffa5fe8','caste','Open',0,1,'2026-08-11 09:00:02'),
('e8507814-a3ed-4448-9d72-ee2e4c509bf7','caste','OBC',1,1,'2026-08-11 09:00:02'),
('1f04d927-1074-43a5-813d-70612865d3ef','caste','SC',2,1,'2026-08-11 09:00:02'),
('78619cf3-84e8-4e07-8df6-c40436354d5c','caste','ST',3,1,'2026-08-11 09:00:02'),
('0162125c-e40c-455f-8249-c88bf7d3f0e2','caste','NT',4,1,'2026-08-11 09:00:02'),
('0d840fb8-b55e-490b-88b3-7bb4cd209786','caste','VJ',5,1,'2026-08-11 09:00:02'),
('e94013ba-681e-49ff-8a80-ba68acd3f865','caste','SBC',6,1,'2026-08-11 09:00:02'),
('b3af69fd-aa06-48d5-ad50-1885d88b002b','grant_type','Government Aided',0,1,'2026-08-11 09:00:02'),
('d2fb5f65-c068-4e13-85b6-e15f65b7f2b6','grant_type','Permanently Unaided',1,1,'2026-08-11 09:00:02'),
('3b847229-d70c-4806-a0cf-0ffababd2507','grant_type','Government',2,1,'2026-08-11 09:00:02'),
('17f3d8fc-4cd9-408d-82e2-5a4d9f9298cc','grant_type','Self-Financed',3,1,'2026-08-11 09:00:02'),
('1b7a1c76-cad4-434e-bd2d-8e301fa0d17f','board_name','SSC (Maharashtra State Board)',0,1,'2026-08-11 09:00:02'),
('1a2d8432-f76a-4e5e-b318-728691df3cdb','board_name','CBSE',1,1,'2026-08-11 09:00:02'),
('af597e20-3ede-41c4-8695-473874cef111','board_name','ICSE',2,1,'2026-08-11 09:00:02'),
('264bcf17-2f18-46fb-b471-bba3cbef6cae','board_name','IB',3,1,'2026-08-11 09:00:02'),
('8d2113ff-d00b-4e08-97b2-64fb40d940e3','management_type','Government',0,1,'2026-08-11 09:00:02'),
('9dcc5568-40d6-426f-9b58-68dced64b3c3','management_type','Private Aided',1,1,'2026-08-11 09:00:02'),
('c1742e3a-e677-496e-9388-a7a13b150c5b','management_type','Private Unaided',2,1,'2026-08-11 09:00:02'),
('8448cf93-ac3f-40ef-a592-299b8b2d9224','management_type','Trust',3,1,'2026-08-11 09:00:02');

-- refresh_tokens: 9 rows
INSERT INTO `refresh_tokens` (`id`,`user_id`,`token_hash`,`expires_at`,`revoked`,`created_at`) VALUES
('3547c2c7-7a43-49ce-8c5b-b753d6e4806b','9f043908-5556-4d6a-bdee-32196a8f8ca2','52d66124009797f93f45ad758e913e0348f7256c315b535cffd9016c2fa5d7cc','2026-08-18 09:16:23',0,'2026-08-11 09:16:23'),
('f1a83799-b476-4c5d-acf8-fe2933dd2eb7','9f043908-5556-4d6a-bdee-32196a8f8ca2','c76174029daf428f146350ac5a29cb2200f9758976f73e4e99d96e92a62340b4','2026-08-18 09:16:59',0,'2026-08-11 09:16:59'),
('533f1c3a-0c17-4f3d-aca3-209a56938f51','9f043908-5556-4d6a-bdee-32196a8f8ca2','c772b069e86d52ac38fe68dc7e53ed5ccdb857e0f1f49d84dd0dc885c2110d5f','2026-08-18 09:17:14',0,'2026-08-11 09:17:14'),
('6562be5b-d857-4692-bd7a-fc23b7fc8b06','9f043908-5556-4d6a-bdee-32196a8f8ca2','dd9febbc9506b4c27fd1a25f1c7d84e9712c4558137eb25b085ce17a07c4a040','2026-08-18 09:17:28',0,'2026-08-11 09:17:28'),
('7ccb3a16-5f84-40a7-bed4-3faf76e91e2d','9f043908-5556-4d6a-bdee-32196a8f8ca2','c122669e1b5cee6b743a8fa7512f9c2a57f0c1620e48e7fc4d5f48079e502e45','2026-08-18 09:17:30',0,'2026-08-11 09:17:30'),
('597c4a20-cf62-4010-945b-eab77bf9274f','9f043908-5556-4d6a-bdee-32196a8f8ca2','c4e0d018333533ad3f357fb80c7d0cc17e91ce7944c6e13b84e275628c1a3187','2026-08-18 09:17:41',0,'2026-08-11 09:17:41'),
('d052c34c-f38f-4d43-9e40-202c3c8a2a05','9f043908-5556-4d6a-bdee-32196a8f8ca2','df01183a3752b2aafd07ddf2960c3942b09d8a100d80feedb84c1c1b2991b7cd','2026-08-18 09:18:21',0,'2026-08-11 09:18:21'),
('074ebfa5-04ba-4062-97b8-c89370aa7bb6','9f043908-5556-4d6a-bdee-32196a8f8ca2','6c9482a4e2d082b97d2731f40f4f00a20d1571a5c4bfdcab48c6dc4a57f3ebdb','2026-08-18 09:19:29',0,'2026-08-11 09:19:29'),
('6a092330-41d2-43b4-b013-9fbe9463d5f3','9f043908-5556-4d6a-bdee-32196a8f8ca2','f666b204c87c1e1f05a41b4702c76d26fd8655e4718b1f80644eaf5143c4c963','2026-08-18 12:31:05',0,'2026-08-11 12:31:05');

-- schools: 1 rows
INSERT INTO `schools` (`id`,`admin_user_id`,`distributor_id`,`name`,`login_id`,`udise_code`,`village`,`city`,`district`,`taluka`,`pin_code`,`phone`,`email`,`medium`,`board`,`logo_url`,`signature_url`,`stamp_url`,`cert_header`,`cert_footer`,`id_card_primary_color`,`id_card_school_name`,`id_card_subtitle`,`id_card_footer_text`,`id_card_show_register_number`,`id_card_show_aadhaar`,`id_card_show_dob`,`id_card_show_address`,`id_card_show_emergency_contact`,`principal_name`,`recog_no`,`status`,`rejection_reason`,`deleted_at`,`created_at`,`updated_at`,`logo_data`,`signature_data`,`stamp_data`,`area_of_operation`,`super_distributor_id`,`id_card_bg_data`) VALUES
('30d9fe63-3f2f-4cb7-87e0-12b5cfce32b2','9f043908-5556-4d6a-bdee-32196a8f8ca2',NULL,'Shri Saraswati Vidyalaya','SCH001',NULL,NULL,'Pune','Pune',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'linear-gradient(135deg,#1a6fd4,#1557b0)',NULL,'Student ID Card','If found, please contact the school office.',1,1,1,0,1,NULL,NULL,'active',NULL,NULL,'2026-08-11 09:00:02','2026-08-11 09:00:02',NULL,NULL,NULL,NULL,NULL,NULL);

-- students: 1 rows
INSERT INTO `students` (`id`,`school_id`,`register_number`,`serial_id`,`full_name`,`mother_name`,`father_name`,`gender`,`dob`,`aadhaar`,`religion`,`caste`,`sub_caste`,`nationality`,`mother_tongue`,`birth_village`,`birth_taluka`,`birth_district`,`birth_state`,`birth_country`,`admission_standard`,`admission_division`,`admission_date`,`prev_school`,`prev_standard`,`roll_number`,`blood_group`,`parent_mobile`,`address`,`photo_url`,`created_at`,`updated_at`,`photo_data`) VALUES
('fb7a051c-7525-4144-9165-4a24cdc660cb','30d9fe63-3f2f-4cb7-87e0-12b5cfce32b2','GR001','SAR001','TEST STUDENT','Test Mother','Test Father','Male','2010-06-15 00:00:00',NULL,'Hindu','General',NULL,'Indian',NULL,'Amalner','Amalner','Jalgaon',NULL,NULL,'9','A','2020-06-01 00:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-11 09:17:14','2026-08-11 09:17:14',NULL);

-- users: 3 rows
INSERT INTO `users` (`id`,`role`,`name`,`email`,`mobile`,`password_hash`,`is_active`,`password_set`,`created_by`,`deleted_at`,`created_at`,`updated_at`) VALUES
('faae068a-933e-4e09-9302-805aa717a66a','superAdmin','Super Admin','admin@certifypro.in',NULL,'$2a$10$NR74Z6GBblSoRPbKzM9iBOrbk3nZcxcGepelz4mnwtuAJOwg6S4Da',1,1,NULL,NULL,'2026-08-11 09:00:01','2026-08-11 09:00:01'),
('9f043908-5556-4d6a-bdee-32196a8f8ca2','schoolAdmin','Rajesh Patil','sch001@certifypro.in',NULL,'$2a$10$IT5FaWEdJS7g6QvabdvWe.RW4pPqVf3YPRTqARY0Fs9APbxzHEKFS',1,1,NULL,NULL,'2026-08-11 09:00:02','2026-08-11 09:00:02'),
('e62490c2-1f2f-4b4c-aec9-b3691f6b9d72','distributor','Amit Sharma','dist01@certifypro.in',NULL,'$2a$10$gtAy0cvq4CV0oyqeD4MXA.Ot/IP2kpszL8W7iaQfbFw9/n/4Z588m',1,1,NULL,NULL,'2026-08-11 09:00:02','2026-08-11 09:00:02');

-- wallets: 1 rows
INSERT INTO `wallets` (`id`,`school_id`,`balance`,`updated_at`) VALUES
('7feefbde-6f3b-40e4-8a51-aa1e77fb1d0f','30d9fe63-3f2f-4cb7-87e0-12b5cfce32b2','500.00','2026-08-11 09:00:02');

SET FOREIGN_KEY_CHECKS=1;
