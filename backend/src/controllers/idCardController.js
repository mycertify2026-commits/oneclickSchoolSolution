const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');
const { debitWallet } = require('./walletController');
const { createNotification } = require('./notificationController');

// ── Pricing ─────────────────────────────────────────────────────────────────

async function getPricing(req, res) {
  try {
    const [rows] = await pool.query('SELECT copy_type, price FROM id_card_pricing ORDER BY copy_type');
    const pricing = {};
    rows.forEach(r => { pricing[r.copy_type] = Number(r.price); });
    res.json({ pricing: { soft: pricing.soft ?? 20, hard: pricing.hard ?? 100 } });
  } catch (err) {
    console.error('getPricing error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function updatePricing(req, res) {
  try {
    const { soft, hard } = req.body;
    if (soft === undefined && hard === undefined) {
      return res.status(400).json({ error: 'At least one price (soft or hard) must be provided' });
    }
    if (soft !== undefined) {
      await pool.query(
        `UPDATE id_card_pricing SET price = ?, updated_by = ?, updated_at = NOW() WHERE copy_type = 'soft'`,
        [soft, req.user.id]
      );
    }
    if (hard !== undefined) {
      await pool.query(
        `UPDATE id_card_pricing SET price = ?, updated_by = ?, updated_at = NOW() WHERE copy_type = 'hard'`,
        [hard, req.user.id]
      );
    }
    const [rows] = await pool.query('SELECT copy_type, price FROM id_card_pricing');
    const pricing = {};
    rows.forEach(r => { pricing[r.copy_type] = Number(r.price); });
    res.json({ pricing: { soft: pricing.soft ?? 20, hard: pricing.hard ?? 100 } });
  } catch (err) {
    console.error('updatePricing error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

// ── Hard Copy Requests ──────────────────────────────────────────────────────

async function createHardCopyRequest(req, res) {
  try {
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ error: 'Student ID is required' });

    // Get hard copy price
    const [priceRows] = await pool.query("SELECT price FROM id_card_pricing WHERE copy_type = 'hard'");
    const price = priceRows.length ? Number(priceRows[0].price) : 100;

    // Get school's distributor chain
    const [schoolRows] = await pool.query(
      `SELECT s.id, s.distributor_id,
              COALESCE(s.super_distributor_id, d.super_distributor_id) AS super_distributor_id
       FROM schools s
       LEFT JOIN distributors d ON d.id = s.distributor_id
       WHERE s.id = ?`,
      [req.schoolId]
    );
    if (!schoolRows.length) return res.status(404).json({ error: 'School not found' });
    const school = schoolRows[0];

    // Verify student belongs to this school
    const [studentRows] = await pool.query(
      'SELECT id, full_name FROM students WHERE id = ? AND school_id = ?',
      [studentId, req.schoolId]
    );
    if (!studentRows.length) return res.status(404).json({ error: 'Student not found' });

    // Check wallet balance
    const [walletRows] = await pool.query('SELECT balance FROM wallets WHERE school_id = ?', [req.schoolId]);
    if (!walletRows.length || Number(walletRows[0].balance) < price) {
      return res.status(402).json({
        error: 'Insufficient wallet balance',
        required: price,
        balance: walletRows.length ? Number(walletRows[0].balance) : 0
      });
    }

    // Debit wallet (throws on failure — no success flag to check)
    const debitResult = await debitWallet(req.schoolId, price, 'id_card_hard_copy', null, `Hard Copy ID Card for ${studentRows[0].full_name}`);

    const id = uuidv4();
    await pool.query(
      `INSERT INTO id_card_hard_copy_requests (id, school_id, student_id, distributor_id, super_distributor_id, amount, wallet_transaction_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [id, req.schoolId, studentId, school.distributor_id, school.super_distributor_id, price, debitResult.transactionId]
    );

    const [rows] = await pool.query(
      `SELECT r.*, s.full_name as student_name, sch.name as school_name
       FROM id_card_hard_copy_requests r
       JOIN students s ON s.id = r.student_id
       JOIN schools sch ON sch.id = r.school_id
       WHERE r.id = ?`,
      [id]
    );

    // Notify super admins + the school's distributor / super distributor (non-fatal)
    try {
      const reqInfo = rows[0];
      const text = `New hard copy ID card request from ${reqInfo.school_name} for student ${reqInfo.student_name}.`;
      const recipients = new Set();
      const [admins] = await pool.query("SELECT id FROM users WHERE role = 'superAdmin'");
      admins.forEach(a => recipients.add(a.id));
      if (school.distributor_id) {
        const [d] = await pool.query('SELECT user_id FROM distributors WHERE id = ?', [school.distributor_id]);
        if (d.length && d[0].user_id) recipients.add(d[0].user_id);
      }
      if (school.super_distributor_id) recipients.add(school.super_distributor_id);
      await Promise.all([...recipients].map(uid => createNotification(uid, text)));
    } catch (nerr) {
      console.error('hard copy notification failed (non-fatal):', nerr.message);
    }
    res.status(201).json({ request: rows[0], message: `₹${price} deducted from wallet. Hard copy request submitted.` });
  } catch (err) {
    console.error('createHardCopyRequest error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function listMyHardCopyRequests(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT r.*, s.full_name as student_name,
              COALESCE(s.current_standard, s.admission_standard) as admission_standard,
              COALESCE(s.current_division, s.admission_division) as admission_division
       FROM id_card_hard_copy_requests r
       JOIN students s ON s.id = r.student_id
       WHERE r.school_id = ?
       ORDER BY r.created_at DESC`,
      [req.schoolId]
    );
    res.json({ requests: rows });
  } catch (err) {
    console.error('listMyHardCopyRequests error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function listDistributorHardCopyRequests(req, res) {
  try {
    const [distRows] = await pool.query('SELECT id FROM distributors WHERE user_id = ?', [req.user.id]);
    if (!distRows.length) return res.json({ requests: [] });
    const distId = distRows[0].id;

    const [rows] = await pool.query(
      `SELECT r.*, s.full_name as student_name, sch.name as school_name,
              u_sd.name as super_distributor_name
       FROM id_card_hard_copy_requests r
       JOIN students s ON s.id = r.student_id
       JOIN schools sch ON sch.id = r.school_id
       LEFT JOIN users u_sd ON u_sd.id = r.super_distributor_id
       WHERE r.distributor_id = ?
       ORDER BY r.created_at DESC`,
      [distId]
    );
    res.json({ requests: rows });
  } catch (err) {
    console.error('listDistributorHardCopyRequests error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function listSdHardCopyRequests(req, res) {
  try {
    const sdId = req.user.id;
    const [rows] = await pool.query(
      `SELECT r.*, s.full_name as student_name, sch.name as school_name,
              u_dist.name as distributor_name
       FROM id_card_hard_copy_requests r
       JOIN students s ON s.id = r.student_id
       JOIN schools sch ON sch.id = r.school_id
       LEFT JOIN distributors d ON d.id = r.distributor_id
       LEFT JOIN users u_dist ON u_dist.id = d.user_id
       WHERE r.super_distributor_id = ?
       ORDER BY r.created_at DESC`,
      [sdId]
    );
    res.json({ requests: rows });
  } catch (err) {
    console.error('listSdHardCopyRequests error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function listAllHardCopyRequests(req, res) {
  try {
    const { status } = req.query;
    let query = `
      SELECT r.*, s.full_name as student_name, s.serial_id as student_uid,
             sch.name as school_name,
             u_dist.name as distributor_name,
             u_sd.name as super_distributor_name
      FROM id_card_hard_copy_requests r
      JOIN students s ON s.id = r.student_id
      JOIN schools sch ON sch.id = r.school_id
      LEFT JOIN distributors d ON d.id = r.distributor_id
      LEFT JOIN users u_dist ON u_dist.id = d.user_id
      LEFT JOIN users u_sd ON u_sd.id = r.super_distributor_id
      WHERE 1=1`;
    const params = [];
    if (status) { query += ' AND r.status = ?'; params.push(status); }
    query += ' ORDER BY r.created_at DESC';
    const [rows] = await pool.query(query, params);
    res.json({ requests: rows });
  } catch (err) {
    console.error('listAllHardCopyRequests error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function updateHardCopyRequest(req, res) {
  try {
    const VALID = ['pending','approved','printing','ready_for_dispatch','dispatched','delivered','rejected','cancelled'];
    const { status, notes } = req.body;
    const [rows] = await pool.query('SELECT * FROM id_card_hard_copy_requests WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Request not found' });

    const updates = ['updated_at = NOW()'];
    const values = [];
    if (status && VALID.includes(status)) { updates.push('status = ?'); values.push(status); }
    if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }
    if (updates.length === 1) return res.status(400).json({ error: 'Nothing to update' });

    values.push(req.params.id);
    await pool.query(`UPDATE id_card_hard_copy_requests SET ${updates.join(', ')} WHERE id = ?`, values);
    const [updated] = await pool.query('SELECT * FROM id_card_hard_copy_requests WHERE id = ?', [req.params.id]);
    res.json({ request: updated[0] });
  } catch (err) {
    console.error('updateHardCopyRequest error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  getPricing, updatePricing,
  createHardCopyRequest, listMyHardCopyRequests,
  listDistributorHardCopyRequests, listSdHardCopyRequests,
  listAllHardCopyRequests, updateHardCopyRequest,
};
