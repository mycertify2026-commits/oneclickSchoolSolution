const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');
const { sendMail } = require('../utils/email');
const { createNotification } = require('./notificationController');

const VALID_STATUSES = ['pending', 'under_review', 'confirmed', 'rejected', 'completed', 'cancelled'];

// ── helpers ────────────────────────────────────────────────────────────────

async function getSchoolDistributorIds(schoolId) {
  const [rows] = await pool.query(
    `SELECT s.distributor_id,
            COALESCE(s.super_distributor_id, d.super_distributor_id) AS super_distributor_id,
            d.user_id AS distributor_user_id
     FROM schools s
     LEFT JOIN distributors d ON d.id = s.distributor_id
     WHERE s.id = ?`,
    [schoolId]
  );
  return rows[0] || {
    distributor_id: null,
    super_distributor_id: null,
    distributor_user_id: null,
  };
}

async function notifyCampStakeholders({ schoolId, campRequest }) {
  const ids = await getSchoolDistributorIds(schoolId);
  const recipients = new Set();

  // Notify the user account of the distributor who owns/submitted the school.
  if (ids.distributor_user_id) recipients.add(ids.distributor_user_id);

  // A school added by an SD stores the SD user id directly. A school added
  // through a distributor resolves the SD through distributors.super_distributor_id.
  if (ids.super_distributor_id) recipients.add(ids.super_distributor_id);

  // Super Admins also need the request in their notification feed because
  // they can see and manage every camp request.
  const [admins] = await pool.query(
    "SELECT id FROM users WHERE role = 'superAdmin' AND is_active = 1 AND deleted_at IS NULL"
  );
  admins.forEach(admin => recipients.add(admin.id));

  const text = `New camp request from ${campRequest.camp_name}. Open Camp Requests to review it.`;
  await Promise.all([...recipients].map(userId => createNotification(userId, text)));
}

async function sendCampConfirmationEmail(campReq) {
  try {
    const [schoolRows] = await pool.query(
      `SELECT s.name as school_name, u.email as admin_email, u.name as admin_name
       FROM schools s JOIN users u ON u.id = s.admin_user_id WHERE s.id = ?`,
      [campReq.school_id]
    );
    if (!schoolRows.length) return;
    const { school_name, admin_email, admin_name } = schoolRows[0];

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px">
        <h2 style="color:#1A6FD4">✅ Camp Confirmed — ${campReq.camp_name}</h2>
        <p>Hi ${admin_name},</p>
        <p>Your camp request from <strong>${school_name}</strong> has been <strong style="color:#16a34a">confirmed</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 0;color:#64748b;width:140px">Camp Name</td><td style="padding:8px 0;font-weight:600">${campReq.camp_name}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b">Start Date</td><td style="padding:8px 0">${new Date(campReq.start_date).toLocaleDateString('en-IN')}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b">End Date</td><td style="padding:8px 0">${new Date(campReq.end_date).toLocaleDateString('en-IN')}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b">Camp Attender</td><td style="padding:8px 0;font-weight:600">${campReq.attender_name || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b">Attender Email</td><td style="padding:8px 0">${campReq.attender_email || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b">Attender Phone</td><td style="padding:8px 0">${campReq.attender_phone || '—'}</td></tr>
        </table>
        <p style="color:#94a3b8;font-size:12px;margin-top:24px;border-top:1px solid #e2e8f0;padding-top:16px">
          One Click School Solutions — automated notification
        </p>
      </div>`;
    await sendMail({ to: admin_email, subject: `Camp Confirmed: ${campReq.camp_name}`, html });
  } catch (e) {
    console.error('[Camp] confirmation email failed:', e.message);
  }
}

// ── SCHOOL ADMIN ────────────────────────────────────────────────────────────

async function listMyCampRequests(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT cr.*, u_dist.name as distributor_name
       FROM camp_requests cr
       LEFT JOIN distributors d ON d.id = cr.distributor_id
       LEFT JOIN users u_dist ON u_dist.id = d.user_id
       WHERE cr.school_id = ?
       ORDER BY cr.created_at DESC`,
      [req.schoolId]
    );
    // Only reveal attender info if confirmed
    const safe = rows.map(r => ({
      ...r,
      attender_name:  r.status === 'confirmed' ? r.attender_name  : null,
      attender_email: r.status === 'confirmed' ? r.attender_email : null,
      attender_phone: r.status === 'confirmed' ? r.attender_phone : null,
    }));
    res.json({ campRequests: safe });
  } catch (err) {
    console.error('listMyCampRequests error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function createCampRequest(req, res) {
  try {
    const { camp_name, required_docs, start_date, end_date } = req.body;
    if (!camp_name || !start_date || !end_date) {
      return res.status(400).json({ error: 'Camp name, start date, and end date are required' });
    }

    const ids = await getSchoolDistributorIds(req.schoolId);
    const id = uuidv4();

    await pool.query(
      `INSERT INTO camp_requests (id, school_id, distributor_id, super_distributor_id, camp_name, required_docs, start_date, end_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [id, req.schoolId, ids.distributor_id, ids.super_distributor_id, camp_name,
       JSON.stringify(required_docs || []), start_date, end_date]
    );

    const [rows] = await pool.query('SELECT * FROM camp_requests WHERE id = ?', [id]);
    await notifyCampStakeholders({ schoolId: req.schoolId, campRequest: rows[0] });
    res.status(201).json({ campRequest: rows[0] });
  } catch (err) {
    console.error('createCampRequest error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function cancelMyCampRequest(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM camp_requests WHERE id = ? AND school_id = ?', [req.params.id, req.schoolId]);
    if (!rows.length) return res.status(404).json({ error: 'Camp request not found' });
    if (!['pending', 'under_review'].includes(rows[0].status)) {
      return res.status(409).json({ error: 'Only pending or under_review requests can be cancelled' });
    }
    await pool.query("UPDATE camp_requests SET status = 'cancelled', updated_at = NOW() WHERE id = ?", [req.params.id]);
    res.json({ message: 'Camp request cancelled' });
  } catch (err) {
    console.error('cancelMyCampRequest error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

// ── DISTRIBUTOR ─────────────────────────────────────────────────────────────

async function listDistributorCampRequests(req, res) {
  try {
    const distUserId = req.user.id;
    const [distRows] = await pool.query('SELECT id FROM distributors WHERE user_id = ?', [distUserId]);
    if (!distRows.length) return res.json({ campRequests: [] });
    const distId = distRows[0].id;

    const [rows] = await pool.query(
      `SELECT cr.*, s.name as school_name
       FROM camp_requests cr
       JOIN schools s ON s.id = cr.school_id
       WHERE cr.distributor_id = ?
       ORDER BY cr.created_at DESC`,
      [distId]
    );
    res.json({ campRequests: rows });
  } catch (err) {
    console.error('listDistributorCampRequests error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function updateDistributorCampRequest(req, res) {
  try {
    const distUserId = req.user.id;
    const [distRows] = await pool.query('SELECT id FROM distributors WHERE user_id = ?', [distUserId]);
    if (!distRows.length) return res.status(403).json({ error: 'Access denied' });
    const distId = distRows[0].id;

    const [rows] = await pool.query('SELECT * FROM camp_requests WHERE id = ? AND distributor_id = ?', [req.params.id, distId]);
    if (!rows.length) return res.status(404).json({ error: 'Camp request not found' });

    const { attender_name, attender_email, attender_phone, status, notes } = req.body;
    const allowedStatuses = ['under_review'];
    const updates = ['updated_at = NOW()'];
    const values = [];

    if (attender_name !== undefined) { updates.push('attender_name = ?'); values.push(attender_name); }
    if (attender_email !== undefined) { updates.push('attender_email = ?'); values.push(attender_email); }
    if (attender_phone !== undefined) { updates.push('attender_phone = ?'); values.push(attender_phone); }
    if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }
    if (status !== undefined && allowedStatuses.includes(status)) { updates.push('status = ?'); values.push(status); }

    values.push(req.params.id);
    await pool.query(`UPDATE camp_requests SET ${updates.join(', ')} WHERE id = ?`, values);

    const [updated] = await pool.query('SELECT * FROM camp_requests WHERE id = ?', [req.params.id]);
    res.json({ campRequest: updated[0] });
  } catch (err) {
    console.error('updateDistributorCampRequest error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

// ── SUPER DISTRIBUTOR ───────────────────────────────────────────────────────

async function listSdCampRequests(req, res) {
  try {
    const sdId = req.user.id;
    const [rows] = await pool.query(
      `SELECT cr.*, s.name as school_name,
              u_dist.name as distributor_name
       FROM camp_requests cr
       JOIN schools s ON s.id = cr.school_id
       LEFT JOIN distributors d ON d.id = cr.distributor_id
       LEFT JOIN users u_dist ON u_dist.id = d.user_id
      WHERE cr.super_distributor_id = ? OR d.super_distributor_id = ?
       ORDER BY cr.created_at DESC`,
      [sdId, sdId]
    );
    res.json({ campRequests: rows });
  } catch (err) {
    console.error('listSdCampRequests error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

// ── SUPER ADMIN ─────────────────────────────────────────────────────────────

async function listAllCampRequests(req, res) {
  try {
    const { status } = req.query;
    let query = `
      SELECT cr.*,
             s.name as school_name,
             u_dist.name as distributor_name,
             u_sd.name as super_distributor_name
      FROM camp_requests cr
      JOIN schools s ON s.id = cr.school_id
      LEFT JOIN distributors d ON d.id = cr.distributor_id
      LEFT JOIN users u_dist ON u_dist.id = d.user_id
      LEFT JOIN users u_sd ON u_sd.id = cr.super_distributor_id
      WHERE 1=1`;
    const params = [];
    if (status) { query += ' AND cr.status = ?'; params.push(status); }
    query += ' ORDER BY cr.created_at DESC';

    const [rows] = await pool.query(query, params);
    res.json({ campRequests: rows });
  } catch (err) {
    console.error('listAllCampRequests error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function updateCampRequestByAdmin(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM camp_requests WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Camp request not found' });

    const { attender_name, attender_email, attender_phone, status, notes } = req.body;
    const updates = ['updated_at = NOW()'];
    const values = [];

    if (attender_name !== undefined) { updates.push('attender_name = ?'); values.push(attender_name); }
    if (attender_email !== undefined) { updates.push('attender_email = ?'); values.push(attender_email); }
    if (attender_phone !== undefined) { updates.push('attender_phone = ?'); values.push(attender_phone); }
    if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }
    if (status !== undefined && VALID_STATUSES.includes(status)) { updates.push('status = ?'); values.push(status); }

    values.push(req.params.id);
    await pool.query(`UPDATE camp_requests SET ${updates.join(', ')} WHERE id = ?`, values);

    const [updated] = await pool.query('SELECT * FROM camp_requests WHERE id = ?', [req.params.id]);
    const campReq = updated[0];

    // Send confirmation email when status changes to confirmed
    if (status === 'confirmed' && rows[0].status !== 'confirmed') {
      await sendCampConfirmationEmail(campReq);
    }

    res.json({ campRequest: campReq });
  } catch (err) {
    console.error('updateCampRequestByAdmin error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  listMyCampRequests, createCampRequest, cancelMyCampRequest,
  listDistributorCampRequests, updateDistributorCampRequest,
  listSdCampRequests,
  listAllCampRequests, updateCampRequestByAdmin,
};
