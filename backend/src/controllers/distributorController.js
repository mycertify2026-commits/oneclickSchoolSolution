const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool, monthExpr } = require('../config/db');
const { createAndSendPasswordToken } = require('./authController');
const { createNotification } = require('./notificationController');
const { logAudit } = require('../utils/audit');
const { sendDistributorCreatedEmail } = require('../utils/email');
const { sendExport } = require('../utils/importExport');
const { stripSchoolBlobFields } = require('../utils/stripBlobFields');

// ===================== SUPER ADMIN SIDE =====================

async function listDistributors(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT d.*, u.name, u.email, u.mobile, u.is_active,
        (SELECT COUNT(*) FROM schools s WHERE s.distributor_id = d.id AND s.deleted_at IS NULL) as school_count
       FROM distributors d JOIN users u ON u.id = d.user_id
       WHERE d.deleted_at IS NULL AND u.role = 'distributor'
       ORDER BY u.created_at DESC`
    );
    res.json({ distributors: rows });
  } catch (err) {
    console.error('listDistributors error:', err.message);
    res.status(500).json({ error: 'Server error fetching distributors' });
  }
}

async function createDistributor(req, res) {
  const conn = await pool.getConnection();
  try {
    const { name, email, mobile, city, district, address, area_of_operation, commission_rate, password, confirmPassword,
            pan_number, bank_account_holder, bank_name, bank_account_number, bank_ifsc } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });

    // Password is optional: if provided, the distributor can log in
    // immediately with it (no email round-trip needed). If omitted, falls
    // back to the original email-setup-link flow.
    if (password !== undefined && password !== '') {
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      if (confirmPassword !== undefined && password !== confirmPassword) {
        return res.status(400).json({ error: 'Password and confirm password do not match' });
      }
    }

    const [existing] = await conn.query('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL', [email.toLowerCase().trim()]);
    if (existing.length > 0) return res.status(409).json({ error: 'A user with this email already exists' });

    await conn.beginTransaction();

    const userId = uuidv4();
    const hasPassword = Boolean(password);
    const passwordHash = hasPassword ? await bcrypt.hash(password, 10) : null;

    await conn.query(
      `INSERT INTO users (id, role, name, email, mobile, password_hash, is_active, password_set, created_by) VALUES (?, 'distributor', ?, ?, ?, ?, 1, ?, ?)`,
      [userId, name, email.toLowerCase().trim(), mobile || null, passwordHash, hasPassword ? 1 : 0, req.user.id]
    );

    const distId = uuidv4();
    await conn.query(
      `INSERT INTO distributors (id, user_id, commission_rate, city, district, address, area_of_operation,
                                  pan_number, bank_account_holder, bank_name, bank_account_number, bank_ifsc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [distId, userId, commission_rate || 10.0, city || null, district || null, address || null, area_of_operation || null,
       pan_number || null, bank_account_holder || null, bank_name || null, bank_account_number || null, bank_ifsc || null]
    );

    await conn.commit();

    let message;
    if (hasPassword) {
      // Password was set directly - the distributor can log in right away,
      // no setup email needed for access (a welcome email is still useful,
      // but isn't a login blocker the way the setup-link email is).
      message = 'Distributor created successfully. They can log in immediately with the password you set.';
      sendDistributorCreatedEmail(email, name, {
        username: email.toLowerCase().trim(),
        password,
        loginUrl: req.headers.origin,
        relatedUserId: userId,
      }).catch(e => console.error('Distributor-created email failed:', e.message));
    } else {
      const emailResult = await createAndSendPasswordToken(
        { id: userId, name, email, role: 'distributor' },
        'setup',
        req.headers.origin,
        { role: 'distributor', username: email.toLowerCase().trim() }
      );
      if (!emailResult.success) console.error('Setup email failed:', emailResult.error);
      message = 'Distributor created. Password setup email sent.';
    }

    const [rows] = await pool.query(
      `SELECT d.*, u.name, u.email, u.mobile, u.is_active FROM distributors d JOIN users u ON u.id = d.user_id WHERE d.id = ?`,
      [distId]
    );
    res.status(201).json({ distributor: rows[0], message });
  } catch (err) {
    await conn.rollback();
    console.error('createDistributor error:', err.message);
    res.status(500).json({ error: 'Server error creating distributor' });
  } finally {
    conn.release();
  }
}

async function assignDistributor(req, res) {
  try {
    const { distributorId } = req.body;
    await pool.query('UPDATE schools SET distributor_id = ? WHERE id = ?', [distributorId || null, req.params.id]);
    const [rows] = await pool.query('SELECT * FROM schools WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'School not found' });
    res.json({ school: stripSchoolBlobFields(rows[0]) });
  } catch (err) {
    console.error('assignDistributor error:', err.message);
    res.status(500).json({ error: 'Server error assigning distributor' });
  }
}

// PUT /api/distributors/:id (superAdmin) - edit any distributor's profile and commission rate
const DISTRIBUTOR_ADMIN_EDITABLE_FIELDS = ['city', 'district', 'address', 'area_of_operation', 'commission_rate',
  'pan_number', 'bank_account_holder', 'bank_name', 'bank_account_number', 'bank_ifsc'];

// PUT /api/distributors/:id/avatar (superAdmin) - photo upload for a
// distributor from the admin's own Edit modal (a distributor doesn't exist
// yet at Add-modal time, so this only applies once the row is created).
async function uploadDistributorAvatarByAdmin(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });
    const [rows] = await pool.query(
      `SELECT d.id FROM distributors d JOIN users u ON u.id = d.user_id WHERE d.id = ? AND u.role = 'distributor'`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Distributor not found' });
    const avatarUrl = req.file.path;
    await pool.query('UPDATE distributors SET avatar_url = ? WHERE id = ?', [avatarUrl, req.params.id]);
    res.json({ avatar_url: avatarUrl });
  } catch (err) {
    console.error('uploadDistributorAvatarByAdmin error:', err.message);
    res.status(500).json({ error: 'Server error uploading profile photo' });
  }
}
async function updateDistributorByAdmin(req, res) {
  try {
    const { name, mobile, is_active } = req.body;
    const [distRows] = await pool.query(
      `SELECT d.user_id FROM distributors d JOIN users u ON u.id = d.user_id WHERE d.id = ? AND u.role = 'distributor'`,
      [req.params.id]
    );
    if (distRows.length === 0) return res.status(404).json({ error: 'Distributor not found' });
    const userId = distRows[0].user_id;

    if (name !== undefined) await pool.query('UPDATE users SET name = ? WHERE id = ?', [name, userId]);
    if (mobile !== undefined) await pool.query('UPDATE users SET mobile = ? WHERE id = ?', [mobile, userId]);
    if (is_active !== undefined) await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, userId]);

    const updates = [];
    const values = [];
    DISTRIBUTOR_ADMIN_EDITABLE_FIELDS.forEach(field => {
      if (req.body[field] !== undefined) { updates.push(`${field} = ?`); values.push(req.body[field]); }
    });
    if (updates.length > 0) {
      values.push(req.params.id);
      await pool.query(`UPDATE distributors SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    const [rows] = await pool.query(
      `SELECT d.*, u.name, u.email, u.mobile, u.is_active FROM distributors d JOIN users u ON u.id = d.user_id WHERE d.id = ?`,
      [req.params.id]
    );
    res.json({ distributor: rows[0] });
  } catch (err) {
    console.error('updateDistributorByAdmin error:', err.message);
    res.status(500).json({ error: 'Server error updating distributor' });
  }
}

// DELETE /api/distributors/:id (superAdmin) - blocked if the distributor has
// schools assigned, since deleting them would orphan those schools'
// distributor_id silently. Unassign or reassign schools first.
// DELETE /api/distributors/:id (superAdmin) - SOFT delete, same reasoning
// as deleteSchool above. No longer blocks on assigned schools since
// nothing is actually removed; existing schools keep their distributor_id
// pointing at the (now inactive) distributor record for historical
// reporting, exactly like a suspended account would.
async function deleteDistributor(req, res) {
  try {
    const [distRows] = await pool.query('SELECT user_id FROM distributors WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (distRows.length === 0) return res.status(404).json({ error: 'Distributor not found' });

    await pool.query('UPDATE distributors SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
    await pool.query("UPDATE users SET deleted_at = NOW(), is_active = 0 WHERE id = ? AND role = 'distributor'", [distRows[0].user_id]);

    res.json({ message: 'Distributor deleted successfully' });
  } catch (err) {
    console.error('deleteDistributor error:', err.message);
    res.status(500).json({ error: 'Server error deleting distributor' });
  }
}

// ===================== DISTRIBUTOR'S OWN SIDE =====================

async function getDistributorIdForUser(userId) {
  const [rows] = await pool.query('SELECT id FROM distributors WHERE user_id = ?', [userId]);
  return rows[0]?.id || null;
}

async function getMyProfile(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT d.*, u.name, u.email, u.mobile FROM distributors d JOIN users u ON u.id = d.user_id WHERE d.user_id = ?`,
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Distributor profile not found' });
    res.json({ distributor: rows[0] });
  } catch (err) {
    console.error('getMyProfile error:', err.message);
    res.status(500).json({ error: 'Server error fetching profile' });
  }
}

async function updateMyProfile(req, res) {
  try {
    const { name, mobile, city, district, address, area_of_operation, pan_number,
            bank_account_holder, bank_name, bank_account_number, bank_ifsc } = req.body;
    if (name !== undefined) await pool.query('UPDATE users SET name = ? WHERE id = ?', [name, req.user.id]);
    if (mobile !== undefined) await pool.query('UPDATE users SET mobile = ? WHERE id = ?', [mobile, req.user.id]);

    const updates = [];
    const values = [];
    if (city !== undefined) { updates.push('city = ?'); values.push(city); }
    if (district !== undefined) { updates.push('district = ?'); values.push(district); }
    if (address !== undefined) { updates.push('address = ?'); values.push(address); }
    if (area_of_operation !== undefined) { updates.push('area_of_operation = ?'); values.push(area_of_operation); }
    if (pan_number !== undefined) { updates.push('pan_number = ?'); values.push(pan_number); }
    if (bank_account_holder !== undefined) { updates.push('bank_account_holder = ?'); values.push(bank_account_holder); }
    if (bank_name !== undefined) { updates.push('bank_name = ?'); values.push(bank_name); }
    if (bank_account_number !== undefined) { updates.push('bank_account_number = ?'); values.push(bank_account_number); }
    if (bank_ifsc !== undefined) { updates.push('bank_ifsc = ?'); values.push(bank_ifsc); }

    if (updates.length > 0) {
      values.push(req.user.id);
      await pool.query(`UPDATE distributors SET ${updates.join(', ')} WHERE user_id = ?`, values);
    }

    const [rows] = await pool.query(
      `SELECT d.*, u.name, u.email, u.mobile FROM distributors d JOIN users u ON u.id = d.user_id WHERE d.user_id = ?`,
      [req.user.id]
    );
    res.json({ distributor: rows[0] });
  } catch (err) {
    console.error('updateMyProfile error:', err.message);
    res.status(500).json({ error: 'Server error updating profile' });
  }
}

// PUT /api/distributors/me/avatar - profile photo upload
async function uploadMyAvatar(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });
    const avatarUrl = req.file.path;
    await pool.query('UPDATE distributors SET avatar_url = ? WHERE user_id = ?', [avatarUrl, req.user.id]);
    res.json({ avatar_url: avatarUrl });
  } catch (err) {
    console.error('uploadMyAvatar error:', err.message);
    res.status(500).json({ error: 'Server error uploading profile photo' });
  }
}

async function changeMyPassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password are required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });

    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, rows[0]?.password_hash || '');
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    await logAudit({ userId: req.user.id, action: 'PASSWORD_CHANGED', ipAddress: req.ip });
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('changeMyPassword error:', err.message);
    res.status(500).json({ error: 'Server error changing password' });
  }
}

// POST /api/distributors/me/schools - distributor adds a school themselves;
// it's tagged to them and starts 'pending' until Super Admin approves.
async function addSchool(req, res) {
  const conn = await pool.getConnection();
  try {
    const distributorId = await getDistributorIdForUser(req.user.id);
    if (!distributorId) return res.status(404).json({ error: 'Distributor profile not found' });

    const { name, adminName, adminEmail, adminMobile, udise_code, village, city, district, taluka, pin_code, phone, medium, board,
             class_from, class_to, insideLat, insideLng, outsideLat, outsideLng } = req.body;
    if (!name || !adminName || !adminEmail) {
      return res.status(400).json({ error: 'School name, admin name, and admin email are required' });
    }

    // Geo-tagged inside/outside photos are mandatory for every new school —
    // enforced here (backend), not just hidden/disabled in the frontend.
    const insidePhotoFile = req.files?.insidePhoto?.[0];
    const outsidePhotoFile = req.files?.outsidePhoto?.[0];
    if (!insidePhotoFile) return res.status(400).json({ error: 'Please upload the geo-tagged inside photo of the school.' });
    if (!outsidePhotoFile) return res.status(400).json({ error: 'Please upload the geo-tagged outside photo of the school.' });
    if (!insideLat || !insideLng) return res.status(400).json({ error: 'Location was not captured for the inside photo. Please allow location access and retake the photo.' });
    if (!outsideLat || !outsideLng) return res.status(400).json({ error: 'Location was not captured for the outside photo. Please allow location access and retake the photo.' });

    const [existing] = await conn.query('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL', [adminEmail.toLowerCase().trim()]);
    if (existing.length > 0) return res.status(409).json({ error: 'A user with this email already exists' });

    await conn.beginTransaction();

    const userId = uuidv4();
    await conn.query(
      `INSERT INTO users (id, role, name, email, mobile, is_active, password_set, created_by) VALUES (?, 'schoolAdmin', ?, ?, ?, 1, 0, ?)`,
      [userId, adminName, adminEmail.toLowerCase().trim(), adminMobile || null, req.user.id]
    );

    const schoolId = uuidv4();
    const [countRows] = await conn.query('SELECT COUNT(*) as count FROM schools');
    const loginId = `SCH${String(countRows[0].count + 1).padStart(3, '0')}`;

    await conn.query(
      `INSERT INTO schools (id, admin_user_id, distributor_id, name, login_id, udise_code, village, city, district, taluka, pin_code, phone, email, medium, board, class_from, class_to, status,
              inside_photo_url, inside_photo_lat, inside_photo_lng, inside_photo_captured_at,
              outside_photo_url, outside_photo_lat, outside_photo_lng, outside_photo_captured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, NOW(), ?, ?, ?, NOW())`,
      [schoolId, userId, distributorId, name, loginId, udise_code, village, city, district, taluka, pin_code, phone, adminEmail.toLowerCase().trim(), medium, board, class_from || null, class_to || null,
       insidePhotoFile.path, insideLat, insideLng, outsidePhotoFile.path, outsideLat, outsideLng]
    );

    await conn.query(`INSERT INTO wallets (id, school_id, balance) VALUES (?, ?, 0)`, [uuidv4(), schoolId]);

    await conn.commit();

    // Notify every Super Admin so the approval queue notification reflects real submissions.
    const [superAdmins] = await pool.query("SELECT id FROM users WHERE role = 'superAdmin' AND is_active = 1");
    for (const admin of superAdmins) {
      await createNotification(admin.id, `New school "${name}" submitted by a distributor, awaiting approval.`);
    }

    res.status(201).json({ message: 'School submitted for approval. The school admin will receive a password setup email once approved.' });
  } catch (err) {
    await conn.rollback();
    console.error('addSchool error:', err.message);
    res.status(500).json({ error: 'Server error adding school' });
  } finally {
    conn.release();
  }
}

// GET /api/distributors/me/schools?status=pending|active|rejected|suspended
async function getMySchools(req, res) {
  try {
    const distributorId = await getDistributorIdForUser(req.user.id);
    if (!distributorId) return res.status(404).json({ error: 'Distributor profile not found' });

    const { status } = req.query;
    let query = `
      SELECT s.*, w.balance as wallet_balance, u.name as admin_name, u.email as admin_email
      FROM schools s LEFT JOIN wallets w ON w.school_id = s.id LEFT JOIN users u ON u.id = s.admin_user_id
      WHERE s.distributor_id = ?`;
    const params = [distributorId];
    if (status) { query += ' AND s.status = ?'; params.push(status); }
    query += ' ORDER BY s.created_at DESC';

    const [rows] = await pool.query(query, params);
    res.json({ schools: rows });
  } catch (err) {
    console.error('getMySchools error:', err.message);
    res.status(500).json({ error: 'Server error fetching schools' });
  }
}

const DIST_SCHOOL_EDITABLE_FIELDS = ['name', 'udise_code', 'village', 'city', 'district', 'taluka', 'pin_code', 'phone', 'medium', 'board', 'class_from', 'class_to'];

// PUT /api/distributors/me/schools/:id - a distributor may only edit a
// school they submitted themselves, and only while it's still 'pending' -
// once Super Admin approves or rejects it, it's out of the distributor's
// hands (the school admin or Super Admin owns it from there).
async function updateMySchool(req, res) {
  try {
    const distributorId = await getDistributorIdForUser(req.user.id);
    if (!distributorId) return res.status(404).json({ error: 'Distributor profile not found' });

    const [rows] = await pool.query('SELECT * FROM schools WHERE id = ? AND distributor_id = ?', [req.params.id, distributorId]);
    if (rows.length === 0) return res.status(404).json({ error: 'School not found among your submissions' });
    if (rows[0].status !== 'pending') {
      return res.status(409).json({ error: `This school is already ${rows[0].status} and can no longer be edited here. Contact Super Admin for changes.` });
    }

    const updates = [];
    const values = [];
    DIST_SCHOOL_EDITABLE_FIELDS.forEach(field => {
      if (req.body[field] !== undefined) { updates.push(`${field} = ?`); values.push(req.body[field]); }
    });
    if (updates.length === 0) return res.status(400).json({ error: 'No fields provided to update' });

    values.push(req.params.id);
    await pool.query(`UPDATE schools SET ${updates.join(', ')} WHERE id = ?`, values);

    const [updatedRows] = await pool.query('SELECT * FROM schools WHERE id = ?', [req.params.id]);
    res.json({ school: stripSchoolBlobFields(updatedRows[0]) });
  } catch (err) {
    console.error('updateMySchool (distributor) error:', err.message);
    res.status(500).json({ error: 'Server error updating school' });
  }
}

// DELETE /api/distributors/me/schools/:id - same pending-only restriction as above.
async function deleteMySchool(req, res) {
  try {
    const distributorId = await getDistributorIdForUser(req.user.id);
    if (!distributorId) return res.status(404).json({ error: 'Distributor profile not found' });

    const [rows] = await pool.query('SELECT * FROM schools WHERE id = ? AND distributor_id = ?', [req.params.id, distributorId]);
    if (rows.length === 0) return res.status(404).json({ error: 'School not found among your submissions' });
    if (rows[0].status !== 'pending') {
      return res.status(409).json({ error: `This school is already ${rows[0].status} and can no longer be withdrawn. Contact Super Admin.` });
    }

    const adminUserId = rows[0].admin_user_id;
    await pool.query('DELETE FROM schools WHERE id = ?', [req.params.id]);
    if (adminUserId) {
      await pool.query("DELETE FROM users WHERE id = ? AND role = 'schoolAdmin'", [adminUserId]);
    }

    res.json({ message: 'School submission withdrawn successfully' });
  } catch (err) {
    console.error('deleteMySchool (distributor) error:', err.message);
    res.status(500).json({ error: 'Server error withdrawing school submission' });
  }
}

// GET /api/distributors/me/commission
// Actual earnings come from the commission ledger's permanent per-certificate
// snapshot (School/Platform split, then Super Admin/Super Distributor/
// Distributor split of the platform share) — never the full certificate
// price times a flat rate, and never recalculated from today's percentages.
// distributors.commission_rate is a separate legacy field kept only for
// display/admin-management purposes; it no longer drives any payout math.
async function getMyCommission(req, res) {
  try {
    const [distRows] = await pool.query('SELECT * FROM distributors WHERE user_id = ?', [req.user.id]);
    const distributor = distRows[0];
    if (!distributor) return res.status(404).json({ error: 'Distributor profile not found' });

    const [totalsRows] = await pool.query(
      `SELECT COALESCE(SUM(c.price), 0) as total_revenue, COUNT(c.id) as total_certificates,
              COALESCE(SUM(cl.distributor_amount), 0) as total_commission
       FROM certificates c
       JOIN schools s ON s.id = c.school_id
       LEFT JOIN commission_ledger cl ON cl.certificate_id = c.id AND cl.status = 'confirmed'
       WHERE s.distributor_id = ?`,
      [distributor.id]
    );
    const totalRevenue = Number(totalsRows[0].total_revenue);
    const totalCertificates = Number(totalsRows[0].total_certificates);
    const totalCommission = Number(totalsRows[0].total_commission);

    const [monthlyRows] = await pool.query(
      `SELECT ${monthExpr('c.created_at')} as month, SUM(c.price) as revenue, COUNT(c.id) as certificate_count,
              COALESCE(SUM(cl.distributor_amount), 0) as commission
       FROM certificates c
       JOIN schools s ON s.id = c.school_id
       LEFT JOIN commission_ledger cl ON cl.certificate_id = c.id AND cl.status = 'confirmed'
       WHERE s.distributor_id = ?
       GROUP BY month ORDER BY month DESC LIMIT 12`,
      [distributor.id]
    );
    const monthly = monthlyRows.map(row => ({
      month: row.month, revenue: Number(row.revenue), certificateCount: Number(row.certificate_count),
      commission: Number(row.commission)
    }));

    const [perSchoolRows] = await pool.query(
      `SELECT s.id, s.name, COALESCE(SUM(c.price), 0) as revenue, COUNT(c.id) as certificate_count,
              COALESCE(SUM(cl.distributor_amount), 0) as commission
       FROM schools s
       LEFT JOIN certificates c ON c.school_id = s.id
       LEFT JOIN commission_ledger cl ON cl.certificate_id = c.id AND cl.status = 'confirmed'
       WHERE s.distributor_id = ?
       GROUP BY s.id, s.name ORDER BY revenue DESC`,
      [distributor.id]
    );
    const perSchool = perSchoolRows.map(row => ({
      schoolId: row.id, schoolName: row.name, revenue: Number(row.revenue), certificateCount: Number(row.certificate_count),
      commission: Number(row.commission)
    }));

    res.json({ commissionRate: Number(distributor.commission_rate), totalRevenue, totalCertificates, totalCommission, monthly, perSchool });
  } catch (err) {
    console.error('getMyCommission error:', err.message);
    res.status(500).json({ error: 'Server error calculating commission' });
  }
}

const DISTRIBUTOR_EXPORT_COLUMNS = [
  { header: 'Name', field: 'name' },
  { header: 'Email', field: 'email' },
  { header: 'Mobile', field: 'mobile' },
  { header: 'City', field: 'city' },
  { header: 'District', field: 'district' },
  { header: 'Commission Rate (%)', field: 'commission_rate' },
  { header: 'Schools Assigned', field: 'school_count' },
  { header: 'Active', field: 'is_active', type: 'boolean' },
  { header: 'Created Date', field: 'created_at', type: 'date' }
];

// GET /api/distributors/export?format=excel|csv
async function exportDistributors(req, res) {
  try {
    const { format } = req.query;
    const [rows] = await pool.query(
      `SELECT d.*, u.name, u.email, u.mobile, u.is_active, u.created_at,
        (SELECT COUNT(*) FROM schools s WHERE s.distributor_id = d.id AND s.deleted_at IS NULL) as school_count
       FROM distributors d JOIN users u ON u.id = d.user_id
       WHERE d.deleted_at IS NULL AND u.role = 'distributor'
       ORDER BY u.created_at DESC`
    );
    sendExport(res, { rows, columns: DISTRIBUTOR_EXPORT_COLUMNS, filename: `distributors-export-${Date.now()}`, format });
  } catch (err) {
    console.error('exportDistributors error:', err.message);
    res.status(500).json({ error: 'Server error exporting distributors' });
  }
}

module.exports = {
  listDistributors, createDistributor, assignDistributor, updateDistributorByAdmin, deleteDistributor,
  uploadDistributorAvatarByAdmin,
  getMyProfile, updateMyProfile, uploadMyAvatar, changeMyPassword,
  addSchool, getMySchools, updateMySchool, deleteMySchool, getMyCommission, exportDistributors
};
