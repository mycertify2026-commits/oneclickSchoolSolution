const path = require('path');
const fs   = require('fs');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');
const { createAndSendPasswordToken } = require('./authController');
const { createNotification } = require('./notificationController');
const { logAudit } = require('../utils/audit');
const { sendSchoolApprovedEmail } = require('../utils/email');
const { sendExport } = require('../utils/importExport');
const { UPLOAD_ROOT } = require('../middleware/upload');
const { toJpegPath } = require('../utils/imageConvert');

// Every school-response endpoint below did `SELECT *` and returned the raw
// row, which includes 7 BLOB columns (logo/signature/stamp/template
// images) - confirmed live: a single response ballooned to 1.3MB because
// of this, once a background image was uploaded. The frontend never reads
// these fields directly (it builds /uploads/... URLs from the *_url
// sibling columns instead), so stripping them is purely a payload-size
// fix, not a behavior change.
const SCHOOL_BLOB_FIELDS = ['logo_data', 'signature_data', 'stamp_data', 'bonafide_template_data', 'lc_template_data', 'id_card_template_data', 'id_card_bg_data'];
function stripBlobFields(schoolRow) {
  if (!schoolRow) return schoolRow;
  const clean = { ...schoolRow };
  SCHOOL_BLOB_FIELDS.forEach(f => { delete clean[f]; });
  return clean;
}

// Deletes PDF files for all certificates belonging to a school so that
// the next download always regenerates them with current settings
// (logo, signature, principal name, ID card color, etc.).
// typesFilter: optional array like ['idcard'] to only delete a subset.
async function deleteSchoolPdfs(schoolId, typesFilter = null) {
  try {
    const [rows] = await pool.query('SELECT serial_number, type FROM certificates WHERE school_id = ?', [schoolId]);
    for (const { serial_number, type } of rows) {
      if (typesFilter && !typesFilter.includes(type)) continue;
      const subdir   = type === 'idcard' ? 'idcards' : 'certificates';
      const filePath = path.join(UPLOAD_ROOT, subdir, `${serial_number}.pdf`);
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
    }
  } catch (e) {
    console.error('deleteSchoolPdfs error:', e.message);
  }
}

const SORTABLE_SCHOOL_FIELDS = ['name', 'city', 'district', 'status', 'created_at'];

// GET /api/schools (superAdmin)
async function listSchools(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const sortBy = SORTABLE_SCHOOL_FIELDS.includes(req.query.sortBy) ? `s.${req.query.sortBy}` : 's.created_at';
    const sortDir = String(req.query.sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const [rows] = await pool.query(
      `SELECT s.*, u.name as admin_name, u.email as admin_email, w.balance as wallet_balance, du.name as distributor_name
       FROM schools s
       LEFT JOIN users u ON u.id = s.admin_user_id
       LEFT JOIN wallets w ON w.school_id = s.id
       LEFT JOIN distributors d ON d.id = s.distributor_id
       LEFT JOIN users du ON du.id = d.user_id
       WHERE s.deleted_at IS NULL
       ORDER BY ${sortBy} ${sortDir} LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const [countRows] = await pool.query('SELECT COUNT(*) as total FROM schools WHERE deleted_at IS NULL');
    const total = countRows[0].total;

    res.json({ schools: rows.map(stripBlobFields), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('listSchools error:', err.message);
    res.status(500).json({ error: 'Server error fetching schools' });
  }
}

async function generateLoginId(conn) {
  const [rows] = await conn.query('SELECT COUNT(*) as count FROM schools');
  const next = String(rows[0].count + 1).padStart(3, '0');
  return `SCH${next}`;
}

// POST /api/schools (superAdmin) - creates school + admin user + wallet, sends setup email
async function createSchool(req, res) {
  const conn = await pool.getConnection();
  try {
    const { name, adminName, adminEmail, adminMobile, udise_code, village, city, district, taluka, pin_code, phone, medium, board, distributorId } = req.body;
    if (!name || !adminName || !adminEmail) {
      return res.status(400).json({ error: 'School name, admin name, and admin email are required' });
    }

    const [existing] = await conn.query('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL', [adminEmail.toLowerCase().trim()]);
    if (existing.length > 0) return res.status(409).json({ error: 'A user with this email already exists' });

    await conn.beginTransaction();

    const userId = uuidv4();
    await conn.query(
      `INSERT INTO users (id, role, name, email, mobile, is_active, password_set, created_by)
       VALUES (?, 'schoolAdmin', ?, ?, ?, 1, 0, ?)`,
      [userId, adminName, adminEmail.toLowerCase().trim(), adminMobile || null, req.user.id]
    );

    const schoolId = uuidv4();
    const loginId = await generateLoginId(conn);
    await conn.query(
      `INSERT INTO schools (id, admin_user_id, distributor_id, name, login_id, udise_code, village, city, district, taluka, pin_code, phone, email, medium, board, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [schoolId, userId, distributorId || null, name, loginId, udise_code, village, city, district, taluka, pin_code, phone, adminEmail.toLowerCase().trim(), medium, board]
    );

    await conn.query(`INSERT INTO wallets (id, school_id, balance) VALUES (?, ?, 0)`, [uuidv4(), schoolId]);

    await conn.commit();

    const emailResult = await createAndSendPasswordToken(
      { id: userId, name: adminName, email: adminEmail, role: 'schoolAdmin' },
      'setup',
      req.headers.origin,
      { role: 'schoolAdmin', username: loginId }
    );
    if (!emailResult.success) console.error('Setup email failed:', emailResult.error);

    const [schoolRows] = await pool.query('SELECT * FROM schools WHERE id = ?', [schoolId]);
    res.status(201).json({ school: schoolRows[0], message: 'School created. Password setup email sent to admin.' });
  } catch (err) {
    await conn.rollback();
    console.error('createSchool error:', err.message);
    res.status(500).json({ error: 'Server error creating school' });
  } finally {
    conn.release();
  }
}

// GET /api/schools/:id
async function getSchool(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT s.*, w.balance as wallet_balance FROM schools s LEFT JOIN wallets w ON w.school_id = s.id WHERE s.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'School not found' });
    res.json({ school: stripBlobFields(rows[0]) });
  } catch (err) {
    console.error('getSchool error:', err.message);
    res.status(500).json({ error: 'Server error fetching school' });
  }
}

// PUT /api/schools/:id/status (superAdmin) - approve/reject/suspend/reactivate
async function updateSchoolStatus(req, res) {
  try {
    const { status, rejectionReason } = req.body;
    if (!['pending', 'active', 'rejected', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    await pool.query('UPDATE schools SET status = ?, rejection_reason = ? WHERE id = ?', [status, rejectionReason || null, req.params.id]);

    const [rows] = await pool.query('SELECT * FROM schools WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'School not found' });

    // If a distributor-submitted school is being approved for the first time,
    // send the school admin's password setup email now (it wasn't sent at
    // creation time for distributor-submitted schools, since they start pending).
    if (status === 'active' && rows[0].admin_user_id) {
      const [userRows] = await pool.query('SELECT * FROM users WHERE id = ? AND password_set = 0', [rows[0].admin_user_id]);
      if (userRows[0]) {
        const emailResult = await createAndSendPasswordToken(
          { ...userRows[0], role: 'schoolAdmin' },
          'setup',
          req.headers.origin,
          { role: 'schoolAdmin', username: rows[0].login_id }
        );
        if (!emailResult.success) console.error('Setup email failed on approval:', emailResult.error);
      } else if (userRows.length === 0) {
        // Password was already set (e.g. re-approval after a suspension) -
        // send the "you're approved, here's your login" email instead of
        // the setup-link email, since there's no link to send.
        const [activeUserRows] = await pool.query('SELECT name, email FROM users WHERE id = ?', [rows[0].admin_user_id]);
        if (activeUserRows[0]) {
          sendSchoolApprovedEmail(activeUserRows[0].email, activeUserRows[0].name, rows[0].name, rows[0].login_id)
            .catch(e => console.error('School-approved email failed:', e.message));
        }
      }
    }

    // Notify the school admin and the submitting distributor (if any) about
    // approval/rejection, so the in-app notification bell reflects real events.
    if ((status === 'active' || status === 'rejected') && rows[0].admin_user_id) {
      const message = status === 'active'
        ? `Your school "${rows[0].name}" has been approved.`
        : `Your school "${rows[0].name}" was rejected.${rejectionReason ? ' Reason: ' + rejectionReason : ''}`;
      await createNotification(rows[0].admin_user_id, message);
    }
    if ((status === 'active' || status === 'rejected') && rows[0].distributor_id) {
      const [distUserRows] = await pool.query('SELECT user_id FROM distributors WHERE id = ?', [rows[0].distributor_id]);
      if (distUserRows[0]) {
        const distMessage = status === 'active'
          ? `School "${rows[0].name}" you submitted has been approved.`
          : `School "${rows[0].name}" you submitted was rejected.${rejectionReason ? ' Reason: ' + rejectionReason : ''}`;
        await createNotification(distUserRows[0].user_id, distMessage);
      }
    }

    res.json({ school: stripBlobFields(rows[0]) });
  } catch (err) {
    console.error('updateSchoolStatus error:', err.message);
    res.status(500).json({ error: 'Server error updating school status' });
  }
}

// GET /api/schools/me (schoolAdmin)
async function getMySchool(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT s.*, w.balance as wallet_balance FROM schools s LEFT JOIN wallets w ON w.school_id = s.id WHERE s.id = ?`,
      [req.schoolId]
    );
    res.json({ school: stripBlobFields(rows[0]) });
  } catch (err) {
    console.error('getMySchool error:', err.message);
    res.status(500).json({ error: 'Server error fetching school profile' });
  }
}

const SCHOOL_EDITABLE_FIELDS = ['name', 'udise_code', 'village', 'city', 'district', 'taluka', 'pin_code', 'phone', 'email', 'medium', 'board', 'cert_header', 'cert_footer', 'principal_name', 'recog_no'];

// PUT /api/schools/me (schoolAdmin) - update profile + upload logo/signature/stamp + cert header/footer text
async function updateMySchool(req, res) {
  try {
    const updates = [];
    const values = [];
    SCHOOL_EDITABLE_FIELDS.forEach(field => {
      if (req.body[field] !== undefined) { updates.push(`${field} = ?`); values.push(req.body[field]); }
    });

    if (req.files) {
      if (req.files.logo?.[0]) {
        const p = await toJpegPath(req.files.logo[0].path);
        updates.push('logo_url = ?', 'logo_data = ?');
        values.push(p, fs.readFileSync(p));
      }
      if (req.files.signature?.[0]) {
        const p = await toJpegPath(req.files.signature[0].path);
        updates.push('signature_url = ?', 'signature_data = ?');
        values.push(p, fs.readFileSync(p));
      }
      if (req.files.stamp?.[0]) {
        const p = await toJpegPath(req.files.stamp[0].path);
        updates.push('stamp_url = ?', 'stamp_data = ?');
        values.push(p, fs.readFileSync(p));
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields provided to update' });

    values.push(req.schoolId);
    await pool.query(`UPDATE schools SET ${updates.join(', ')} WHERE id = ?`, values);

    // Delete cached PDFs so next download regenerates with the updated logo/
    // signature/stamp/principal name — otherwise old files keep showing stale data.
    deleteSchoolPdfs(req.schoolId).catch(() => {});

    const [rows] = await pool.query('SELECT * FROM schools WHERE id = ?', [req.schoolId]);
    res.json({ school: stripBlobFields(rows[0]) });
  } catch (err) {
    console.error('updateMySchool error:', err.message);
    res.status(500).json({ error: 'Server error updating school profile' });
  }
}

const ID_CARD_DESIGN_FIELDS = [
  'id_card_primary_color', 'id_card_school_name', 'id_card_subtitle', 'id_card_footer_text',
  'id_card_show_register_number', 'id_card_show_aadhaar', 'id_card_show_dob', 'id_card_show_address', 'id_card_show_emergency_contact',
  'id_card_border_color', 'id_card_bg_opacity', 'id_card_show_feature_strip', 'id_card_feature_icons'
];

// Validates/normalizes the 5-slot per-icon feature-strip config so a
// malformed value can never reach the database or the PDF renderer.
function normalizeFeatureIcons(raw) {
  let arr;
  try { arr = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return null; }
  if (!Array.isArray(arr)) return null;
  const allowedKeys = ['shield', 'drop', 'sun', 'arrows', 'hourglass'];
  return JSON.stringify(arr.slice(0, 5).map((slot, i) => ({
    key: allowedKeys.includes(slot?.key) ? slot.key : allowedKeys[i] || 'shield',
    visible: Boolean(slot?.visible ?? true),
    caption1: String(slot?.caption1 ?? '').slice(0, 40),
    caption2: String(slot?.caption2 ?? '').slice(0, 40),
  })));
}

// PUT /api/schools/me/id-card-bg  (schoolAdmin) — upload background image for ID card
async function uploadIdCardBg(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image file is required' });
    const imgPath = await toJpegPath(req.file.path);
    const imgData = fs.readFileSync(imgPath);
    await pool.query('UPDATE schools SET id_card_bg_data = ? WHERE id = ?', [imgData, req.schoolId]);
    // Invalidate cached ID card PDFs
    deleteSchoolPdfs(req.schoolId, ['idcard']).catch(() => {});
    res.json({ message: 'ID card background image saved.' });
  } catch (err) {
    console.error('uploadIdCardBg error:', err.message);
    res.status(500).json({ error: 'Server error uploading background image' });
  }
}

// DELETE /api/schools/me/id-card-bg  (schoolAdmin) — remove background image
async function deleteIdCardBg(req, res) {
  try {
    await pool.query('UPDATE schools SET id_card_bg_data = NULL WHERE id = ?', [req.schoolId]);
    deleteSchoolPdfs(req.schoolId, ['idcard']).catch(() => {});
    res.json({ message: 'ID card background image removed.' });
  } catch (err) {
    console.error('deleteIdCardBg error:', err.message);
    res.status(500).json({ error: 'Server error removing background image' });
  }
}

const TEMPLATE_TYPES = {
  bonafide: { url: 'bonafide_template_url', data: 'bonafide_template_data' },
  lc: { url: 'lc_template_url', data: 'lc_template_data' },
  idcard: { url: 'id_card_template_url', data: 'id_card_template_data' },
};

async function uploadCertificateTemplate(req, res) {
  try {
    const type = String(req.params.type || '').toLowerCase();
    const fields = TEMPLATE_TYPES[type];
    if (!fields) return res.status(400).json({ error: 'Invalid certificate template type' });
    if (!req.file) return res.status(400).json({ error: 'PNG template file is required' });
    const pngData = fs.readFileSync(req.file.path);
    await pool.query(`UPDATE schools SET ${fields.url} = ?, ${fields.data} = ? WHERE id = ?`, [req.file.path, pngData, req.schoolId]);
    deleteSchoolPdfs(req.schoolId, type === 'idcard' ? ['idcard'] : [type]).catch(() => {});
    const [rows] = await pool.query('SELECT * FROM schools WHERE id = ?', [req.schoolId]);
    res.json({ school: stripBlobFields(rows[0]), message: 'Certificate PNG template saved.' });
  } catch (err) {
    console.error('uploadCertificateTemplate error:', err.message);
    res.status(500).json({ error: 'Server error saving certificate template' });
  }
}

async function deleteCertificateTemplate(req, res) {
  try {
    const type = String(req.params.type || '').toLowerCase();
    const fields = TEMPLATE_TYPES[type];
    if (!fields) return res.status(400).json({ error: 'Invalid certificate template type' });
    const [rows] = await pool.query(`SELECT ${fields.url} AS template_path FROM schools WHERE id = ?`, [req.schoolId]);
    if (rows[0]?.template_path && fs.existsSync(rows[0].template_path)) {
      try { fs.unlinkSync(rows[0].template_path); } catch (_) {}
    }
    await pool.query(`UPDATE schools SET ${fields.url} = NULL, ${fields.data} = NULL WHERE id = ?`, [req.schoolId]);
    deleteSchoolPdfs(req.schoolId, type === 'idcard' ? ['idcard'] : [type]).catch(() => {});
    res.json({ message: 'Certificate PNG template removed.' });
  } catch (err) {
    console.error('deleteCertificateTemplate error:', err.message);
    res.status(500).json({ error: 'Server error removing certificate template' });
  }
}

// PUT /api/schools/me/id-card-design (schoolAdmin) - the ID Card Designer panel:
// primary color, custom text fields, and which info fields appear on the card.
// Applied to every ID card generated for this school from then on.
async function updateIdCardDesign(req, res) {
  try {
    const updates = [];
    const values = [];
    ID_CARD_DESIGN_FIELDS.forEach(field => {
      if (req.body[field] === undefined) return;
      const isCheckbox = field.startsWith('id_card_show_');
      updates.push(`${field} = ?`);
      if (isCheckbox) {
        values.push(req.body[field] ? 1 : 0);
      } else if (field === 'id_card_bg_opacity') {
        const n = Number(req.body[field]);
        values.push(Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.15);
      } else if (field === 'id_card_feature_icons') {
        const normalized = normalizeFeatureIcons(req.body[field]);
        if (normalized === null) { updates.pop(); return; } // skip malformed value rather than corrupt the column
        values.push(normalized);
      } else {
        values.push(req.body[field]);
      }
    });
    if (updates.length === 0) return res.status(400).json({ error: 'No design fields provided to update' });

    values.push(req.schoolId);
    await pool.query(`UPDATE schools SET ${updates.join(', ')} WHERE id = ?`, values);

    // Delete only ID card PDFs so next download regenerates with new color/fields.
    deleteSchoolPdfs(req.schoolId, ['idcard']).catch(() => {});

    const [rows] = await pool.query('SELECT * FROM schools WHERE id = ?', [req.schoolId]);
    res.json({ school: stripBlobFields(rows[0]) });
  } catch (err) {
    console.error('updateIdCardDesign error:', err.message);
    res.status(500).json({ error: 'Server error updating ID card design' });
  }
}

// POST /api/schools/me/id-card-preview (schoolAdmin) - renders a real sample
// ID card PDF using the CURRENT (possibly unsaved) Designer form values, so
// the Settings panel can show the exact same PDF a real card would use
// instead of a hand-approximated CSS mock. Background image/logo are read
// from whatever is already saved (BgImageUploader/logo upload apply
// immediately, before Save Design is clicked) - only the text/color/toggle
// fields in ID_CARD_DESIGN_FIELDS are overridable per-request, and nothing
// here is persisted to the database.
const { generateIdCardPdf } = require('../utils/idCardPdf');
const SAMPLE_STUDENT = {
  full_name: 'Sample Student Name', register_number: 'GR-SAMPLE-001', serial_id: 'SARAL-SAMPLE-001',
  dob: '2013-05-15', blood_group: 'O+', father_name: 'Sample Father Name',
  current_standard: '8', current_division: 'A', admission_standard: '5', admission_division: 'A',
};
async function previewIdCard(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM schools WHERE id = ?', [req.schoolId]);
    const school = rows[0];
    if (!school) return res.status(404).json({ error: 'School not found' });

    const overrides = {};
    ID_CARD_DESIGN_FIELDS.forEach(field => {
      if (req.body[field] === undefined) return;
      const isCheckbox = field.startsWith('id_card_show_');
      if (isCheckbox) {
        overrides[field] = req.body[field] ? 1 : 0;
      } else if (field === 'id_card_bg_opacity') {
        const n = Number(req.body[field]);
        overrides[field] = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : school.id_card_bg_opacity;
      } else if (field === 'id_card_feature_icons') {
        const normalized = normalizeFeatureIcons(req.body[field]);
        if (normalized !== null) overrides[field] = normalized;
      } else {
        overrides[field] = req.body[field];
      }
    });
    const previewSchool = { ...school, ...overrides };

    const tmpPath = path.join(UPLOAD_ROOT, 'idcards', `preview-${uuidv4()}.pdf`);
    await generateIdCardPdf({
      school: previewSchool,
      student: SAMPLE_STUDENT,
      certificate: { id: 'sample-preview-idcard', serial_number: 'IDC-SAMPLE-0001' },
      outputPath: tmpPath,
      photoPath: null,
      logoPath: school.logo_url || null,
    });

    const pdfBase64 = fs.readFileSync(tmpPath).toString('base64');
    fs.unlink(tmpPath, () => {});
    res.json({ pdfBase64 });
  } catch (err) {
    console.error('previewIdCard error:', err.message);
    res.status(500).json({ error: 'Unable to generate a preview. Please check your design settings.' });
  }
}

// GET /api/schools/:id/students (superAdmin) - student count + list for the School Detail page
async function listStudentsForSchool(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM students WHERE school_id = ? ORDER BY full_name ASC', [req.params.id]);
    res.json({ students: rows });
  } catch (err) {
    console.error('listStudentsForSchool error:', err.message);
    res.status(500).json({ error: 'Server error fetching students' });
  }
}

const SCHOOL_EDITABLE_BY_ADMIN_FIELDS = ['name', 'udise_code', 'village', 'city', 'district', 'taluka', 'pin_code', 'phone', 'email', 'medium', 'board'];

// PUT /api/schools/:id (superAdmin) - full profile edit, unlike updateSchoolStatus which only
// changes the approval status. Closes the gap where a typo in name/address could
// never be corrected after creation.
async function updateSchool(req, res) {
  try {
    const updates = [];
    const values = [];
    SCHOOL_EDITABLE_BY_ADMIN_FIELDS.forEach(field => {
      if (req.body[field] !== undefined) { updates.push(`${field} = ?`); values.push(req.body[field]); }
    });
    if (updates.length === 0) return res.status(400).json({ error: 'No fields provided to update' });

    values.push(req.params.id);
    const [result] = await pool.query(`UPDATE schools SET ${updates.join(', ')} WHERE id = ?`, values);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'School not found' });

    await logAudit({ userId: req.user.id, action: 'SCHOOL_UPDATED', entityType: 'school', entityId: req.params.id, ipAddress: req.ip, details: req.body });

    const [rows] = await pool.query('SELECT * FROM schools WHERE id = ?', [req.params.id]);
    res.json({ school: stripBlobFields(rows[0]) });
  } catch (err) {
    console.error('updateSchool error:', err.message);
    res.status(500).json({ error: 'Server error updating school' });
  }
}

// DELETE /api/schools/:id (superAdmin) - SOFT delete: marks the school and
// its admin user as deleted_at = NOW() rather than removing rows. This is
// what makes "delete a school, then create a new one with the same name/
// email" work - the row still physically exists (preserving certificate/
// student history forever) but no longer counts as active for uniqueness
// checks or listings. No certificate-count restriction is needed anymore
// since nothing is actually destroyed.
async function deleteSchool(req, res) {
  try {
    const [schoolRows] = await pool.query('SELECT admin_user_id, name FROM schools WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (schoolRows.length === 0) return res.status(404).json({ error: 'School not found' });

    await pool.query('UPDATE schools SET deleted_at = NOW() WHERE id = ?', [req.params.id]);

    if (schoolRows[0].admin_user_id) {
      await pool.query("UPDATE users SET deleted_at = NOW(), is_active = 0 WHERE id = ? AND role = 'schoolAdmin'", [schoolRows[0].admin_user_id]);
    }

    await logAudit({ userId: req.user.id, action: 'SCHOOL_DELETED', entityType: 'school', entityId: req.params.id, ipAddress: req.ip, details: { name: schoolRows[0].name } });

    res.json({ message: 'School deleted successfully' });
  } catch (err) {
    console.error('deleteSchool error:', err.message);
    res.status(500).json({ error: 'Server error deleting school' });
  }
}

const SCHOOL_EXPORT_COLUMNS = [
  { header: 'School Name', field: 'name' },
  { header: 'Login ID', field: 'login_id' },
  { header: 'U-DISE Code', field: 'udise_code' },
  { header: 'City', field: 'city' },
  { header: 'District', field: 'district' },
  { header: 'Medium', field: 'medium' },
  { header: 'Board', field: 'board' },
  { header: 'Admin Name', field: 'admin_name' },
  { header: 'Admin Email', field: 'admin_email' },
  { header: 'Distributor', field: 'distributor_name' },
  { header: 'Wallet Balance', field: 'wallet_balance', type: 'currency' },
  { header: 'Status', field: 'status' },
  { header: 'Created Date', field: 'created_at', type: 'date' }
];

// GET /api/schools/export?format=excel|csv&status=active&dateFrom=...&dateTo=...
async function exportSchools(req, res) {
  try {
    const { format, status, dateFrom, dateTo } = req.query;
    let query = `
      SELECT s.*, u.name as admin_name, u.email as admin_email, w.balance as wallet_balance, du.name as distributor_name
      FROM schools s
      LEFT JOIN users u ON u.id = s.admin_user_id
      LEFT JOIN wallets w ON w.school_id = s.id
      LEFT JOIN distributors d ON d.id = s.distributor_id
      LEFT JOIN users du ON du.id = d.user_id
      WHERE s.deleted_at IS NULL`;
    const params = [];
    if (status) { query += ' AND s.status = ?'; params.push(status); }
    if (dateFrom) { query += ' AND s.created_at >= ?'; params.push(dateFrom); }
    if (dateTo) { query += ' AND s.created_at <= ?'; params.push(dateTo); }
    query += ' ORDER BY s.created_at DESC';

    const [rows] = await pool.query(query, params);
    sendExport(res, { rows, columns: SCHOOL_EXPORT_COLUMNS, filename: `schools-export-${Date.now()}`, format });
  } catch (err) {
    console.error('exportSchools error:', err.message);
    res.status(500).json({ error: 'Server error exporting schools' });
  }
}

// POST /api/schools/:id/reset-admin-password (superAdmin)
// Lets a super admin set a temporary password for any school's admin user.
async function resetAdminPassword(req, res) {
  const bcrypt = require('bcryptjs');
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const [rows] = await pool.query('SELECT admin_user_id FROM schools WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'School not found' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = ?, password_set = 1 WHERE id = ?',
      [hash, rows[0].admin_user_id]
    );
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('resetAdminPassword error:', err.message);
    res.status(500).json({ error: 'Server error resetting password' });
  }
}

module.exports = { listSchools, createSchool, getSchool, updateSchoolStatus, getMySchool, updateMySchool, listStudentsForSchool, updateSchool, deleteSchool, updateIdCardDesign, previewIdCard, uploadIdCardBg, deleteIdCardBg, uploadCertificateTemplate, deleteCertificateTemplate, exportSchools, resetAdminPassword, deleteSchoolPdfs };
