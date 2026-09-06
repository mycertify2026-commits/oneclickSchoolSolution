const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const { debitWallet, creditWallet } = require('./walletController');
const { createNotification } = require('./notificationController');
const { renderCertificatePdf } = require('../utils/certificateRenderDispatch');
const { genSerial } = require('../utils/certificatePdf');
const { generateReceiptPdf } = require('../utils/receiptPdf');
const { recordCommission } = require('../utils/commission');
const { UPLOAD_ROOT } = require('../middleware/upload');
const { restoreIfMissing } = require('../utils/fileStore');

const DOWNLOAD_WINDOW_DAYS = 5;

function resolveUpload(urlOrPath) {
  if (!urlOrPath) return null;
  const s = String(urlOrPath);
  if (s.startsWith(UPLOAD_ROOT) || s.startsWith('/')) return s;
  return path.join(UPLOAD_ROOT, s.replace(/^\/uploads\//, ''));
}

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

// POST /api/id-cards/hard-copy (schoolAdmin) — one or many students in a
// single batch. Each student gets: a real ID-card PDF generated and stored
// as a proper `certificates` row (so it has a serial number, appears in
// certificate history, is QR-verifiable, and gets a commission-ledger row
// exactly like any other issued certificate), its own receipt (2x price,
// matching every other certificate type's existing receipt rule), and one
// `id_card_hard_copy_requests` row referencing that certificate's PDF —
// all sharing one `batch_id` so the Distributor sees them as one request.
//
// The wallet is debited ONCE up front for the whole batch total (one
// wallet_transaction_id shared by every row in the batch). From there each
// student is processed independently, mirroring cartController.js's
// checkout loop: if PDF/certificate/receipt generation fails for one
// student, only that student's share is refunded and their row is marked
// 'failed' — the rest of the batch is unaffected. This is what prevents the
// wallet-debited-but-request-missing / request-created-but-card-missing
// partial states this endpoint previously had no protection against.
async function createHardCopyRequest(req, res) {
  try {
    const rawIds = Array.isArray(req.body.studentIds) ? req.body.studentIds : (req.body.studentId ? [req.body.studentId] : []);
    const studentIds = [...new Set(rawIds.filter(Boolean))];
    if (studentIds.length === 0) return res.status(400).json({ error: 'At least one student is required' });

    const [priceRows] = await pool.query("SELECT price FROM id_card_pricing WHERE copy_type = 'hard'");
    const unitPrice = priceRows.length ? Number(priceRows[0].price) : 100;
    const totalPrice = Math.round(unitPrice * studentIds.length * 100) / 100;

    const [schoolRows] = await pool.query(
      `SELECT sc.*, COALESCE(sc.super_distributor_id, d.super_distributor_id) AS resolved_super_distributor_id
       FROM schools sc
       LEFT JOIN distributors d ON d.id = sc.distributor_id
       WHERE sc.id = ?`,
      [req.schoolId]
    );
    if (!schoolRows.length) return res.status(404).json({ error: 'School not found' });
    const school = schoolRows[0];
    const distributorId = school.distributor_id || null;
    const superDistributorId = school.resolved_super_distributor_id || null;

    const [studentRows] = await pool.query(
      `SELECT * FROM students WHERE school_id = ? AND id IN (${studentIds.map(() => '?').join(',')})`,
      [req.schoolId, ...studentIds]
    );
    if (studentRows.length !== studentIds.length) {
      return res.status(404).json({ error: 'One or more selected students were not found in your school' });
    }
    const studentsById = new Map(studentRows.map(s => [s.id, s]));

    const [walletRows] = await pool.query('SELECT balance FROM wallets WHERE school_id = ?', [req.schoolId]);
    const balance = walletRows.length ? Number(walletRows[0].balance) : 0;
    if (balance < totalPrice) {
      return res.status(402).json({ error: 'Insufficient wallet balance', required: totalPrice, balance });
    }

    // One debit for the whole batch — debitWallet itself is transaction-safe
    // (row-locked, all-or-nothing) so this step alone can't partially apply.
    const debitResult = await debitWallet(
      req.schoolId, totalPrice, 'id_card_hard_copy',
      null, `Hard copy ID card${studentIds.length > 1 ? `s (${studentIds.length} students)` : ''}`
    );

    const batchId = uuidv4();
    const logoPath = resolveUpload(school.logo_url);
    const signaturePath = resolveUpload(school.signature_url);
    const stampPath = resolveUpload(school.stamp_url);
    const [[schoolBlobs]] = await pool.query(
      'SELECT logo_data, signature_data, stamp_data FROM schools WHERE id = ?', [school.id]
    );
    if (schoolBlobs) {
      restoreIfMissing(logoPath, schoolBlobs.logo_data);
      restoreIfMissing(signaturePath, schoolBlobs.signature_data);
      restoreIfMissing(stampPath, schoolBlobs.stamp_data);
    }
    const [adminUserRows] = await pool.query('SELECT name FROM users WHERE id = ?', [school.admin_user_id]);
    const generatedByName = adminUserRows[0]?.name || 'School Admin';

    const results = [];
    let refundedTotal = 0;

    for (const studentId of studentIds) {
      const student = studentsById.get(studentId);
      const requestId = uuidv4();
      try {
        const serial = genSerial('IDC');
        const certId = uuidv4();
        const photoPath = resolveUpload(student.photo_url);
        const [[studentBlob]] = await pool.query('SELECT photo_data FROM students WHERE id = ?', [student.id]);
        if (studentBlob) restoreIfMissing(photoPath, studentBlob.photo_data);

        const idcardDir = path.join(UPLOAD_ROOT, 'idcards');
        if (!fs.existsSync(idcardDir)) fs.mkdirSync(idcardDir, { recursive: true });
        const pdfPath = path.join(idcardDir, `${serial}.pdf`);
        const certificate = { id: certId, serial_number: serial };
        await renderCertificatePdf({ type: 'idcard', school, student, certificate, outputPath: pdfPath, photoPath, logoPath, signaturePath, stampPath });

        await pool.query(
          `INSERT INTO certificates (id, school_id, student_id, type, serial_number, price, gst_amount, payment_method, wallet_transaction_id, pdf_path, purpose, certificate_variant, expires_at)
           VALUES (?, ?, ?, 'idcard', ?, ?, 0, 'wallet', ?, ?, 'hard_copy', 'original', ?)`,
          [certId, req.schoolId, studentId, serial, unitPrice, debitResult.transactionId, pdfPath,
           new Date(Date.now() + DOWNLOAD_WINDOW_DAYS * 24 * 60 * 60 * 1000)]
        );

        let receiptId = null;
        try {
          receiptId = uuidv4();
          const receiptNumber = genSerial('REC');
          const receiptAmount = Math.round(unitPrice * 2 * 100) / 100;
          const receiptDir = path.join(UPLOAD_ROOT, 'receipts');
          if (!fs.existsSync(receiptDir)) fs.mkdirSync(receiptDir, { recursive: true });
          const receiptPath = path.join(receiptDir, `${receiptNumber}.pdf`);
          await generateReceiptPdf({
            school, student,
            certificate: { id: certId, serial_number: serial, type: 'idcard', wallet_transaction_id: debitResult.transactionId },
            receipt: { receipt_number: receiptNumber, base_price: unitPrice, receipt_amount: receiptAmount, certificate_variant: 'original', created_at: new Date() },
            generatedByName,
            outputPath: receiptPath,
          });
          await pool.query(
            `INSERT INTO receipts (id, certificate_id, school_id, student_id, receipt_number, certificate_type, certificate_variant, base_price, receipt_amount, pdf_path, generated_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [receiptId, certId, req.schoolId, studentId, receiptNumber, 'idcard', 'original', unitPrice, receiptAmount, receiptPath, req.user.id]
          );
        } catch (receiptErr) {
          console.error('Hard-copy receipt generation failed for', certId, receiptErr.message);
          receiptId = null;
        }

        try {
          await recordCommission({ certificateId: certId, certificateType: 'idcard', certificatePrice: unitPrice, school });
        } catch (commissionErr) {
          console.error('Hard-copy commission recording failed for', certId, commissionErr.message);
        }

        await pool.query(
          `INSERT INTO id_card_hard_copy_requests (id, school_id, student_id, distributor_id, super_distributor_id, amount, wallet_transaction_id, status, batch_id, certificate_id, pdf_path, receipt_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
          [requestId, req.schoolId, studentId, distributorId, superDistributorId, unitPrice, debitResult.transactionId, batchId, certId, pdfPath, receiptId]
        );

        results.push({ studentId, studentName: student.full_name, status: 'created', requestId, certificateId: certId });
      } catch (genErr) {
        console.error('Hard-copy ID card generation failed for student', studentId, genErr.message);
        try {
          await creditWallet(req.schoolId, unitPrice, 'id_card_hard_copy_failed_refund', null, `Refund: hard copy ID card failed for ${student.full_name}`);
          refundedTotal = Math.round((refundedTotal + unitPrice) * 100) / 100;
        } catch (refundErr) {
          console.error('CRITICAL: refund after failed hard-copy generation also failed:', refundErr.message);
        }
        try {
          await pool.query(
            `INSERT INTO id_card_hard_copy_requests (id, school_id, student_id, distributor_id, super_distributor_id, amount, wallet_transaction_id, status, notes, batch_id)
             VALUES (?, ?, ?, ?, ?, 0, ?, 'cancelled', ?, ?)`,
            [requestId, req.schoolId, studentId, distributorId, superDistributorId, debitResult.transactionId, `Generation failed, refunded: ${genErr.message}`, batchId]
          );
        } catch (logErr) {
          console.error('Failed to record failed hard-copy row:', logErr.message);
        }
        results.push({ studentId, studentName: student.full_name, status: 'failed', error: genErr.message });
      }
    }

    const succeeded = results.filter(r => r.status === 'created');
    try {
      const recipients = new Set();
      const [admins] = await pool.query("SELECT id FROM users WHERE role = 'superAdmin'");
      admins.forEach(a => recipients.add(a.id));
      if (distributorId) {
        const [d] = await pool.query('SELECT user_id FROM distributors WHERE id = ?', [distributorId]);
        if (d.length && d[0].user_id) recipients.add(d[0].user_id);
      }
      if (superDistributorId) recipients.add(superDistributorId);
      const text = `New hard copy ID card request from ${school.name}: ${succeeded.length} card${succeeded.length !== 1 ? 's' : ''}.`;
      await Promise.all([...recipients].map(uid => createNotification(uid, text)));
    } catch (nerr) {
      console.error('hard copy notification failed (non-fatal):', nerr.message);
    }

    const chargedTotal = Math.round((totalPrice - refundedTotal) * 100) / 100;
    res.status(201).json({
      batchId,
      results,
      succeeded: succeeded.length,
      failed: results.length - succeeded.length,
      chargedTotal,
      refundedTotal,
      message: succeeded.length === studentIds.length
        ? `₹${chargedTotal} deducted from wallet. ${succeeded.length} hard copy request${succeeded.length !== 1 ? 's' : ''} submitted.`
        : `${succeeded.length} of ${studentIds.length} succeeded (₹${chargedTotal} charged). ${results.length - succeeded.length} failed and were refunded.`,
    });
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

// GET /api/id-cards/hard-copy/:id/pdf — download the generated ID card for
// one hard-copy request row. Scoped so only the school that owns it, its
// assigned distributor/super distributor, or a Super Admin can fetch it.
async function downloadHardCopyPdf(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM id_card_hard_copy_requests WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Request not found' });
    const reqRow = rows[0];
    if (!reqRow.pdf_path || !fs.existsSync(reqRow.pdf_path)) {
      return res.status(404).json({ error: 'No generated ID card is available for this request' });
    }

    const role = req.user.role;
    let allowed = role === 'superAdmin';
    if (!allowed && role === 'schoolAdmin') {
      const [sch] = await pool.query('SELECT id FROM schools WHERE admin_user_id = ? AND deleted_at IS NULL', [req.user.id]);
      allowed = sch.length > 0 && sch[0].id === reqRow.school_id;
    }
    if (!allowed && role === 'distributor') {
      const [d] = await pool.query('SELECT id FROM distributors WHERE user_id = ?', [req.user.id]);
      allowed = d.length > 0 && d[0].id === reqRow.distributor_id;
    }
    if (!allowed && role === 'superDistributor') allowed = reqRow.super_distributor_id === req.user.id;
    if (!allowed) return res.status(403).json({ error: 'Access denied' });

    res.download(reqRow.pdf_path, `id-card-${reqRow.id}.pdf`);
  } catch (err) {
    console.error('downloadHardCopyPdf error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  getPricing, updatePricing,
  createHardCopyRequest, listMyHardCopyRequests,
  listDistributorHardCopyRequests, listSdHardCopyRequests,
  listAllHardCopyRequests, updateHardCopyRequest, downloadHardCopyPdf,
};
