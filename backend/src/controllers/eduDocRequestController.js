// "Request from Distributor" — School Admin requests a real-world government
// document (Caste/Income/Age-Domicile-Nationality/Non-Creamy-Layer) for a
// student, uploads one combined supporting-documents PDF, pays from the
// school wallet (OTP-verified), and the request is routed to the school's
// assigned Distributor to fulfill, with Super Admin able to monitor it.
//
// This is NOT the LC/Bonafide/ID-card certificate generator — those produce
// a platform-generated PDF; this is a request for the Distributor to obtain
// a real document in the physical world, so no certificates/receipts/
// commission_ledger rows are created here (see the parent PR's plan for why).
//
// Modeled closely on two existing flows: cartController.js's cart+OTP+wallet
// transaction sequence (submitCart/resendOtp/verifyOtp), and
// idCardController.js's hard-copy-request Distributor/Super-Admin access
// patterns (listDistributorHardCopyRequests/updateHardCopyRequest/
// downloadHardCopyPdf).
const { v4: uuid } = require('uuid');
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const { generateOtp, hashOtp, verifyOtpHash } = require('../utils/otp');
const { genSerial } = require('../utils/certificatePdf');
const { isValidEduDocType } = require('../utils/pricing');
const { creditWallet } = require('./walletController');
const { createNotification } = require('./notificationController');
const { restoreIfMissing } = require('../utils/fileStore');
const {
  sendEduDocOtpEmail, sendCartInsufficientBalanceEmail,
  sendEduDocDistributorEmail, sendEduDocSuperAdminEmail,
} = require('../utils/email');
const { UPLOAD_ROOT } = require('../middleware/upload');

const OTP_EXPIRY_MIN = parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10);
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10);
const RESEND_COOLDOWN = parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '60', 10);
const STATUS_VALUES = ['submitted', 'under_process', 'documents_processing', 'completed', 'closed'];
const PENDING_DIR = path.join(UPLOAD_ROOT, 'edu-doc-requests', 'pending');
const EDU_DOC_DIR = path.join(UPLOAD_ROOT, 'edu-doc-requests');

// ── Pricing / document types ────────────────────────────────────────────────

async function getDocTypes(req, res) {
  try {
    const [rows] = await pool.query('SELECT doc_type, name, price FROM educational_document_types WHERE active = 1 ORDER BY name');
    res.json({ types: rows.map(r => ({ docType: r.doc_type, name: r.name, price: Number(r.price) })) });
  } catch (err) {
    console.error('getDocTypes error:', err.message);
    res.status(500).json({ error: 'Server error fetching document types' });
  }
}

// GET /api/edu-doc-requests/types/admin (superAdmin) — includes inactive
// types and the distributor/super-distributor commission-split percentages,
// which the School Admin's own document list never needs to see.
async function listDocTypesForAdmin(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM educational_document_types ORDER BY name');
    res.json({
      types: rows.map(r => ({
        docType: r.doc_type,
        name: r.name,
        price: Number(r.price),
        distributorPct: Number(r.distributor_pct),
        superDistributorPct: Number(r.super_distributor_pct),
        active: Boolean(r.active),
      })),
    });
  } catch (err) {
    console.error('listDocTypesForAdmin error:', err.message);
    res.status(500).json({ error: 'Server error fetching document types' });
  }
}

// PUT /api/edu-doc-requests/types/:docType (superAdmin) — edits price and the
// distributor/super-distributor commission split. Applies to new requests
// only — every already-submitted request keeps the price/split it was
// charged at (price_at_submission-style snapshot on edu_doc_request_students),
// matching how certificate_pricing/id_card_pricing changes work elsewhere.
async function updateDocType(req, res) {
  try {
    const { docType } = req.params;
    const [existingRows] = await pool.query('SELECT * FROM educational_document_types WHERE doc_type = ?', [docType]);
    if (!existingRows.length) return res.status(404).json({ error: 'Document type not found' });
    const existing = existingRows[0];

    const price = req.body.price !== undefined ? Number(req.body.price) : Number(existing.price);
    const distributorPct = req.body.distributorPct !== undefined ? Number(req.body.distributorPct) : Number(existing.distributor_pct);
    const superDistributorPct = req.body.superDistributorPct !== undefined ? Number(req.body.superDistributorPct) : Number(existing.super_distributor_pct);
    const active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : existing.active;

    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Price must be a non-negative number' });
    for (const [label, v] of Object.entries({ distributorPct, superDistributorPct })) {
      if (!Number.isFinite(v) || v < 0 || v > 100) return res.status(400).json({ error: `${label} must be between 0 and 100` });
    }
    if (distributorPct + superDistributorPct > 100) {
      return res.status(400).json({ error: 'Distributor % and Super Distributor % together cannot exceed 100%' });
    }

    await pool.query(
      'UPDATE educational_document_types SET price=?, distributor_pct=?, super_distributor_pct=?, active=?, updated_by=?, updated_at=NOW() WHERE doc_type=?',
      [price, distributorPct, superDistributorPct, active, req.user.id, docType]
    );
    const [updated] = await pool.query('SELECT * FROM educational_document_types WHERE doc_type = ?', [docType]);
    const r = updated[0];
    res.json({
      type: {
        docType: r.doc_type, name: r.name, price: Number(r.price),
        distributorPct: Number(r.distributor_pct), superDistributorPct: Number(r.super_distributor_pct),
        active: Boolean(r.active),
      },
    });
  } catch (err) {
    console.error('updateDocType error:', err.message);
    res.status(500).json({ error: 'Server error updating document type' });
  }
}

// ── Upload ───────────────────────────────────────────────────────────────────

// A file only ever becomes orphaned if the admin uploads then abandons the
// whole flow without ever hitting Submit — 24h is generous enough that it
// never races a legitimate in-progress session, and the sweep piggybacks on
// the next unrelated upload rather than needing a scheduled job.
function cleanupStalePendingUploads() {
  try {
    if (!fs.existsSync(PENDING_DIR)) return;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const f of fs.readdirSync(PENDING_DIR)) {
      const fp = path.join(PENDING_DIR, f);
      try { if (fs.statSync(fp).mtimeMs < cutoff) fs.unlinkSync(fp); } catch (e) { /* ignore */ }
    }
  } catch (e) { /* non-fatal cleanup */ }
}

async function uploadPendingPdf(req, res) {
  cleanupStalePendingUploads();
  if (!req.file) return res.status(400).json({ error: 'A PDF file is required' });
  res.json({ fileToken: req.file.filename, fileName: req.file.originalname, fileSize: req.file.size });
}

// ── Submit (validate + price + OTP) ─────────────────────────────────────────

async function submitRequest(req, res) {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'Please add at least one student before submitting.' });

    for (const it of items) {
      if (!it.studentId || !it.docType || !it.fileToken) {
        return res.status(400).json({ error: 'Each item must include a student, a certificate type, and an uploaded document.' });
      }
      if (!isValidEduDocType(it.docType)) {
        return res.status(400).json({ error: `Invalid certificate type: ${it.docType}` });
      }
      // The pending filename embeds the school id — this is the ownership
      // check for a fileToken, since no DB row tracks pending uploads.
      if (!it.fileToken.startsWith(`pending-${req.schoolId}-`)) {
        return res.status(400).json({ error: 'Invalid or expired file token. Please re-upload the document.' });
      }
      if (!fs.existsSync(path.join(PENDING_DIR, it.fileToken))) {
        return res.status(400).json({ error: 'Uploaded document not found or expired. Please re-upload.' });
      }
    }

    // Student must belong to this school — never trust the id alone.
    const studentIds = [...new Set(items.map(i => i.studentId))];
    const [studentRows] = await pool.query(
      `SELECT * FROM students WHERE school_id=? AND id IN (${studentIds.map(() => '?').join(',')})`,
      [req.schoolId, ...studentIds]
    );
    if (studentRows.length !== studentIds.length) {
      return res.status(404).json({ error: 'One or more selected students were not found in your school.' });
    }
    const studentsById = new Map(studentRows.map(s => [s.id, s]));

    // Distributor must be resolved and blocked BEFORE any OTP is generated —
    // this feature is useless without one, even though other flows in this
    // app silently allow a null distributor.
    const [schoolRows] = await pool.query(
      `SELECT sc.*, COALESCE(sc.super_distributor_id, d.super_distributor_id) AS resolved_super_distributor_id
       FROM schools sc LEFT JOIN distributors d ON d.id = sc.distributor_id WHERE sc.id = ?`,
      [req.schoolId]
    );
    const school = schoolRows[0];
    if (!school) return res.status(404).json({ error: 'School not found' });
    if (!school.distributor_id) {
      return res.status(400).json({ error: 'Your school has no distributor assigned yet. Please contact the Super Admin.' });
    }

    // Price (and the distributor/super-distributor commission split) is
    // always recalculated here from the database — the request payload
    // carries no price field for the server to (mis)trust.
    const [typeRows] = await pool.query('SELECT doc_type, name, price, distributor_pct, super_distributor_pct, active FROM educational_document_types');
    const typeMap = new Map(typeRows.map(t => [t.doc_type, t]));
    const snapshotItems = [];
    for (const it of items) {
      const t = typeMap.get(it.docType);
      if (!t || !Number(t.active)) return res.status(400).json({ error: `${it.docType} is not currently available.` });
      const student = studentsById.get(it.studentId);
      const price = Number(t.price);
      const distributorAmount = Math.round(price * Number(t.distributor_pct) / 100 * 100) / 100;
      const superDistributorAmount = Math.round(price * Number(t.super_distributor_pct) / 100 * 100) / 100;
      snapshotItems.push({
        studentId: it.studentId,
        studentName: student.full_name,
        docType: it.docType,
        docTypeName: t.name,
        price,
        distributorAmount,
        superDistributorAmount,
        fileToken: it.fileToken,
      });
    }
    const total = Math.round(snapshotItems.reduce((s, i) => s + i.price, 0) * 100) / 100;

    const [walletRows] = await pool.query('SELECT * FROM wallets WHERE school_id=?', [req.schoolId]);
    const wallet = walletRows[0];
    const balance = wallet ? parseFloat(wallet.balance) : 0;
    if (balance < total) {
      const shortfall = Math.round((total - balance) * 100) / 100;
      try {
        await sendCartInsufficientBalanceEmail(req.user.email, school.name, { cartTotal: total, walletBalance: balance, shortfall, schoolId: school.id });
      } catch (e) { console.error('Insufficient-balance email failed:', e.message); }
      return res.json({ insufficientBalance: true, shortfall, walletBalance: balance, cartTotal: total });
    }

    const otp = generateOtp();
    const otpHash = await hashOtp(otp);
    const snapshot = { items: snapshotItems, total };
    const otpId = uuid();
    await pool.query(
      "INSERT INTO otp_verifications (id, user_id, purpose, otp_hash, cart_snapshot, expires_at) VALUES (?,?,'edu_doc_request',?,?,?)",
      [otpId, req.user.id, otpHash, JSON.stringify(snapshot), new Date(Date.now() + OTP_EXPIRY_MIN * 60 * 1000)]
    );
    try {
      await sendEduDocOtpEmail(req.user.email, req.user.name, otp, { itemCount: snapshotItems.length, cartTotal: total });
    } catch (emailError) {
      // Never leave an OTP in the database that the user never received.
      await pool.query('DELETE FROM otp_verifications WHERE id=?', [otpId]);
      console.error('submitRequest OTP delivery failed:', emailError.message);
      return res.status(503).json({ error: 'OTP could not be sent to your email. Please try again later.', code: 'OTP_DELIVERY_UNAVAILABLE' });
    }

    res.json({ otpRequired: true, cartTotal: total, itemCount: snapshotItems.length, expiresInMinutes: OTP_EXPIRY_MIN, email: req.user.email });
  } catch (e) {
    console.error('submitRequest error:', e.message);
    res.status(500).json({ error: e.message || 'Failed to submit request' });
  }
}

async function resendOtp(req, res) {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM otp_verifications WHERE user_id=? AND purpose='edu_doc_request' AND used=0 ORDER BY created_at DESC LIMIT 1",
      [req.user.id]
    );
    if (!rows.length) return res.status(400).json({ error: 'No pending OTP found. Please submit your request again.' });
    const existing = rows[0];
    const secondsSince = (Date.now() - new Date(existing.created_at).getTime()) / 1000;
    if (secondsSince < RESEND_COOLDOWN) {
      return res.status(429).json({ error: `Please wait ${Math.ceil(RESEND_COOLDOWN - secondsSince)}s before resending.` });
    }
    const snapshot = typeof existing.cart_snapshot === 'string' ? JSON.parse(existing.cart_snapshot) : existing.cart_snapshot;
    const otp = generateOtp();
    const otpHash = await hashOtp(otp);
    try {
      await sendEduDocOtpEmail(req.user.email, req.user.name, otp, { itemCount: snapshot.items.length, cartTotal: snapshot.total });
    } catch (emailError) {
      console.error('resendOtp delivery failed:', emailError.message);
      return res.status(503).json({ error: 'OTP could not be sent. Please try again later.', code: 'OTP_DELIVERY_UNAVAILABLE' });
    }
    await pool.query(
      'UPDATE otp_verifications SET otp_hash=?, attempts=0, created_at=NOW(), expires_at=? WHERE id=?',
      [otpHash, new Date(Date.now() + OTP_EXPIRY_MIN * 60 * 1000), existing.id]
    );
    res.json({ message: 'OTP resent', expiresInMinutes: OTP_EXPIRY_MIN });
  } catch (e) {
    console.error('resendOtp error:', e.message);
    res.status(500).json({ error: 'Failed to resend OTP' });
  }
}

// ── Verify OTP (the transactional checkout) ─────────────────────────────────

async function verifyOtp(req, res) {
  const conn = await pool.getConnection();
  let released = false;
  const releaseOnce = () => { if (!released) { released = true; conn.release(); } };
  try {
    const { otp } = req.body;
    const [rows] = await pool.query(
      "SELECT * FROM otp_verifications WHERE user_id=? AND purpose='edu_doc_request' AND used=0 ORDER BY created_at DESC LIMIT 1",
      [req.user.id]
    );
    if (!rows.length) { releaseOnce(); return res.status(400).json({ error: 'No pending OTP. Please submit your request again.' }); }
    const record = rows[0];

    if (new Date(record.expires_at) < new Date()) {
      releaseOnce();
      return res.status(400).json({ error: 'OTP expired. Please resend or resubmit your request.', expired: true });
    }
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      releaseOnce();
      return res.status(400).json({ error: 'Too many wrong attempts. Please submit your request again for a fresh code.', invalidated: true });
    }
    const match = await verifyOtpHash(otp, record.otp_hash);
    if (!match) {
      await pool.query('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id=?', [record.id]);
      releaseOnce();
      return res.status(400).json({ error: `Incorrect OTP. ${OTP_MAX_ATTEMPTS - record.attempts - 1} attempt(s) remaining.` });
    }

    const snapshot = typeof record.cart_snapshot === 'string' ? JSON.parse(record.cart_snapshot) : record.cart_snapshot;

    // Re-resolve school/distributor fresh (not from the snapshot) in case
    // the assignment changed between Submit and OTP verification.
    const [schoolRows] = await pool.query(
      `SELECT sc.*, COALESCE(sc.super_distributor_id, d.super_distributor_id) AS resolved_super_distributor_id
       FROM schools sc LEFT JOIN distributors d ON d.id = sc.distributor_id WHERE sc.id = ?`,
      [req.schoolId]
    );
    const school = schoolRows[0];
    if (!school) { releaseOnce(); return res.status(404).json({ error: 'School not found' }); }
    if (!school.distributor_id) {
      releaseOnce();
      return res.status(400).json({ error: 'Your school no longer has a distributor assigned. Please contact the Super Admin.' });
    }

    await conn.beginTransaction();
    const [walletRows] = await conn.query('SELECT * FROM wallets WHERE school_id=? FOR UPDATE', [req.schoolId]);
    const wallet = walletRows[0];
    if (!wallet || parseFloat(wallet.balance) < parseFloat(snapshot.total)) {
      await conn.rollback();
      releaseOnce();
      return res.status(400).json({ error: 'Wallet balance changed since submission and is now insufficient. Please try again.' });
    }

    const newBalance = Math.round((parseFloat(wallet.balance) - parseFloat(snapshot.total)) * 100) / 100;
    const txId = uuid();
    await conn.query('UPDATE wallets SET balance=? WHERE id=?', [newBalance, wallet.id]);
    await conn.query(
      "INSERT INTO wallet_transactions (id, wallet_id, type, amount, balance_after, reason, description) VALUES (?,?,'debit',?,?,'edu_doc_request_submission',?)",
      [txId, wallet.id, snapshot.total, newBalance, `Educational document request (${snapshot.items.length} student(s))`]
    );

    // Hardened duplicate-submission guard: flip used=1 INSIDE the same
    // transaction as the debit (not after commit, in a separate query, the
    // way the cart-OTP flow's own precedent does it) — closes a narrow
    // double-submit race that precedent still has open.
    const [otpUpdateResult] = await conn.query('UPDATE otp_verifications SET used=1 WHERE id=? AND used=0', [record.id]);
    if (otpUpdateResult.affectedRows !== 1) {
      await conn.rollback();
      releaseOnce();
      return res.status(400).json({ error: 'This OTP was already used. Please submit your request again.' });
    }

    const requestId = uuid();
    const requestNumber = genSerial('EDR');
    await conn.query(
      `INSERT INTO edu_doc_requests
       (id, request_number, school_id, distributor_id, super_distributor_id, total_amount, wallet_transaction_id, status, otp_verification_id, created_by, submitted_at)
       VALUES (?,?,?,?,?,?,?,'submitted',?,?,NOW())`,
      [requestId, requestNumber, req.schoolId, school.distributor_id, school.resolved_super_distributor_id, snapshot.total, txId, record.id, req.user.id]
    );

    await conn.commit();
    releaseOnce();

    // Per-item file move + row insert — isolated per item so one bad file
    // can't undo the whole (already-committed) request. Any item that fails
    // here is refunded individually, same resilience pattern as
    // cartController's checkout loop and idCardController's hard-copy batch.
    const successItems = [];
    let refundedTotal = 0;
    for (const it of snapshot.items) {
      try {
        const pendingPath = path.join(PENDING_DIR, it.fileToken);
        if (!fs.existsSync(pendingPath)) throw new Error('Uploaded document is missing');
        const finalPath = path.join(EDU_DOC_DIR, `${requestNumber}-${it.studentId}.pdf`);
        fs.renameSync(pendingPath, finalPath);
        const pdfData = fs.readFileSync(finalPath);

        await pool.query(
          `INSERT INTO edu_doc_request_students (id, request_id, student_id, doc_type, price, distributor_amount, super_distributor_amount, pdf_path, pdf_data)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [uuid(), requestId, it.studentId, it.docType, it.price, it.distributorAmount || 0, it.superDistributorAmount || 0, finalPath, pdfData]
        );
        successItems.push(it);
      } catch (itemErr) {
        console.error('Educational document request item failed for student', it.studentId, itemErr.message);
        try {
          await creditWallet(req.schoolId, it.price, 'edu_doc_request_item_failed_refund', requestId, `Refund: ${it.docTypeName} failed for ${it.studentName}`);
          refundedTotal = Math.round((refundedTotal + it.price) * 100) / 100;
        } catch (refundErr) {
          console.error('CRITICAL: refund after failed edu-doc item also failed:', refundErr.message);
        }
      }
    }

    const chargedTotal = Math.round((snapshot.total - refundedTotal) * 100) / 100;
    if (refundedTotal > 0) {
      await pool.query('UPDATE edu_doc_requests SET total_amount=? WHERE id=?', [chargedTotal, requestId]);
    }

    // Notifications — email + in-app, to the Distributor and every Super
    // Admin, matching how every other stakeholder event in this app works.
    let distributorName = null;
    try {
      const [distRows] = await pool.query(
        'SELECT d.user_id, u.name, u.email FROM distributors d JOIN users u ON u.id = d.user_id WHERE d.id = ?',
        [school.distributor_id]
      );
      const distUser = distRows[0];
      distributorName = distUser?.name || null;
      const emailItems = successItems.map(it => ({ studentName: it.studentName, docTypeName: it.docTypeName, price: it.price }));

      if (distUser) {
        if (distUser.email) {
          try {
            await sendEduDocDistributorEmail(distUser.email, distUser.name, { requestNumber, schoolName: school.name, items: emailItems });
          } catch (e) { console.error('Distributor email failed:', e.message); }
        }
        await createNotification(distUser.user_id, `New educational certificate request ${requestNumber} from ${school.name}: ${successItems.length} document(s).`);
      }

      const [adminRows] = await pool.query("SELECT id, name, email FROM users WHERE role = 'superAdmin'");
      for (const admin of adminRows) {
        if (admin.email) {
          try {
            await sendEduDocSuperAdminEmail(admin.email, admin.name, { requestNumber, schoolName: school.name, distributorName, items: emailItems });
          } catch (e) { console.error('Super admin email failed:', e.message); }
        }
        await createNotification(admin.id, `New educational certificate request ${requestNumber} from ${school.name}: ${successItems.length} document(s).`);
      }

      if (school.resolved_super_distributor_id) {
        await createNotification(school.resolved_super_distributor_id, `New educational certificate request ${requestNumber} from ${school.name}: ${successItems.length} document(s).`);
      }
    } catch (notifyErr) {
      console.error('edu doc notification failed (non-fatal):', notifyErr.message);
    }

    const [finalWallet] = await pool.query('SELECT balance FROM wallets WHERE school_id=?', [req.schoolId]);
    res.json({
      message: 'Request submitted successfully',
      requestId,
      requestNumber,
      studentsCount: successItems.length,
      totalAmount: chargedTotal,
      refundedTotal,
      walletBalance: finalWallet[0]?.balance,
      distributorName,
      status: 'submitted',
    });
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    releaseOnce();
    console.error('verifyOtp error:', e.message);
    res.status(500).json({ error: e.message || 'Failed to verify OTP' });
  }
}

// ── Helper: attach nested student rows to a list of parent request rows ────
// Deliberately two separate queries + a JS merge instead of GROUP_CONCAT/
// STRING_AGG or a JSON aggregate — this app runs MySQL locally and Postgres
// in production, and those functions aren't portable between the two.
async function attachStudents(requests, studentColumns = 's.full_name as student_name') {
  if (!requests.length) return requests;
  const ids = requests.map(r => r.id);
  const [students] = await pool.query(
    `SELECT rs.*, ${studentColumns}
     FROM edu_doc_request_students rs JOIN students s ON s.id = rs.student_id
     WHERE rs.request_id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  const byRequest = new Map();
  students.forEach(s => {
    if (!byRequest.has(s.request_id)) byRequest.set(s.request_id, []);
    byRequest.get(s.request_id).push(s);
  });
  return requests.map(r => ({ ...r, students: byRequest.get(r.id) || [] }));
}

// ── School Admin: own history ───────────────────────────────────────────────

async function listMine(req, res) {
  try {
    const [requests] = await pool.query(
      'SELECT * FROM edu_doc_requests WHERE school_id = ? ORDER BY created_at DESC',
      [req.schoolId]
    );
    res.json({ requests: await attachStudents(requests) });
  } catch (err) {
    console.error('listMine error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

// ── Distributor ──────────────────────────────────────────────────────────────

async function listForDistributor(req, res) {
  try {
    const [distRows] = await pool.query('SELECT id FROM distributors WHERE user_id = ?', [req.user.id]);
    if (!distRows.length) return res.json({ requests: [] });
    const [requests] = await pool.query(
      `SELECT r.*, sch.name as school_name
       FROM edu_doc_requests r JOIN schools sch ON sch.id = r.school_id
       WHERE r.distributor_id = ? ORDER BY r.created_at DESC`,
      [distRows[0].id]
    );
    res.json({ requests: await attachStudents(requests, 's.full_name as student_name, s.father_name, s.birth_village, s.birth_taluka, s.birth_district') });
  } catch (err) {
    console.error('listForDistributor error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function updateStatusByDistributor(req, res) {
  try {
    const { status, notes } = req.body;
    if (!status || !STATUS_VALUES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const [distRows] = await pool.query('SELECT id FROM distributors WHERE user_id = ?', [req.user.id]);
    if (!distRows.length) return res.status(403).json({ error: 'Access denied' });

    const [rows] = await pool.query('SELECT * FROM edu_doc_requests WHERE id = ? AND distributor_id = ?', [req.params.id, distRows[0].id]);
    if (!rows.length) return res.status(404).json({ error: 'Request not found' });
    const oldStatus = rows[0].status;

    await pool.query('UPDATE edu_doc_requests SET status=?, updated_at=NOW() WHERE id=?', [status, req.params.id]);
    if (status !== oldStatus) {
      await pool.query(
        'INSERT INTO edu_doc_request_status_history (id, request_id, old_status, new_status, changed_by, remarks) VALUES (?,?,?,?,?,?)',
        [uuid(), req.params.id, oldStatus, status, req.user.id, notes || null]
      );
    }
    const [updated] = await pool.query('SELECT * FROM edu_doc_requests WHERE id = ?', [req.params.id]);
    res.json({ request: updated[0] });
  } catch (err) {
    console.error('updateStatusByDistributor error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function closeByDistributor(req, res) {
  try {
    const [distRows] = await pool.query('SELECT id FROM distributors WHERE user_id = ?', [req.user.id]);
    if (!distRows.length) return res.status(403).json({ error: 'Access denied' });

    const [rows] = await pool.query('SELECT * FROM edu_doc_requests WHERE id = ? AND distributor_id = ?', [req.params.id, distRows[0].id]);
    if (!rows.length) return res.status(404).json({ error: 'Request not found' });
    const oldStatus = rows[0].status;

    await pool.query(
      "UPDATE edu_doc_requests SET status='closed', closed_at=NOW(), closed_by=?, updated_at=NOW() WHERE id=?",
      [req.user.id, req.params.id]
    );
    await pool.query(
      'INSERT INTO edu_doc_request_status_history (id, request_id, old_status, new_status, changed_by, remarks) VALUES (?,?,?,?,?,?)',
      [uuid(), req.params.id, oldStatus, 'closed', req.user.id, 'Closed by distributor']
    );
    const [updated] = await pool.query('SELECT * FROM edu_doc_requests WHERE id = ?', [req.params.id]);
    res.json({ request: updated[0] });
  } catch (err) {
    console.error('closeByDistributor error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

// ── Super Admin ──────────────────────────────────────────────────────────────

async function listAll(req, res) {
  try {
    const { status } = req.query;
    let query = `
      SELECT r.*, sch.name as school_name, u_dist.name as distributor_name, u_sd.name as super_distributor_name
      FROM edu_doc_requests r
      JOIN schools sch ON sch.id = r.school_id
      LEFT JOIN distributors d ON d.id = r.distributor_id
      LEFT JOIN users u_dist ON u_dist.id = d.user_id
      LEFT JOIN users u_sd ON u_sd.id = r.super_distributor_id
      WHERE 1=1`;
    const params = [];
    if (status) { query += ' AND r.status = ?'; params.push(status); }
    query += ' ORDER BY r.created_at DESC';
    const [requests] = await pool.query(query, params);
    res.json({ requests: await attachStudents(requests) });
  } catch (err) {
    console.error('listAll error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function updateStatusByAdmin(req, res) {
  try {
    const { status, notes } = req.body;
    const [rows] = await pool.query('SELECT * FROM edu_doc_requests WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Request not found' });
    const oldStatus = rows[0].status;

    const updates = ['updated_at = NOW()'];
    const values = [];
    if (status && STATUS_VALUES.includes(status)) { updates.push('status = ?'); values.push(status); }
    if (updates.length === 1) return res.status(400).json({ error: 'Nothing to update' });
    values.push(req.params.id);
    await pool.query(`UPDATE edu_doc_requests SET ${updates.join(', ')} WHERE id = ?`, values);
    if (status && status !== oldStatus) {
      await pool.query(
        'INSERT INTO edu_doc_request_status_history (id, request_id, old_status, new_status, changed_by, remarks) VALUES (?,?,?,?,?,?)',
        [uuid(), req.params.id, oldStatus, status, req.user.id, notes || null]
      );
    }
    const [updated] = await pool.query('SELECT * FROM edu_doc_requests WHERE id = ?', [req.params.id]);
    res.json({ request: updated[0] });
  } catch (err) {
    console.error('updateStatusByAdmin error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

// ── Document download (per student, auth-gated — never a public URL) ───────

async function downloadPdf(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT rs.*, r.school_id, r.distributor_id, r.super_distributor_id
       FROM edu_doc_request_students rs JOIN edu_doc_requests r ON r.id = rs.request_id
       WHERE rs.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Document not found' });
    const row = rows[0];

    const role = req.user.role;
    let allowed = role === 'superAdmin';
    if (!allowed && role === 'schoolAdmin') {
      const [sch] = await pool.query('SELECT id FROM schools WHERE admin_user_id = ? AND deleted_at IS NULL', [req.user.id]);
      allowed = sch.length > 0 && sch[0].id === row.school_id;
    }
    if (!allowed && role === 'distributor') {
      const [d] = await pool.query('SELECT id FROM distributors WHERE user_id = ?', [req.user.id]);
      allowed = d.length > 0 && d[0].id === row.distributor_id;
    }
    if (!allowed && role === 'superDistributor') allowed = row.super_distributor_id === req.user.id;
    if (!allowed) return res.status(403).json({ error: 'Access denied' });

    restoreIfMissing(row.pdf_path, row.pdf_data);
    if (!row.pdf_path || !fs.existsSync(row.pdf_path)) {
      return res.status(404).json({ error: 'Document file not found' });
    }
    res.download(row.pdf_path, `educational-document-${row.id}.pdf`);
  } catch (err) {
    console.error('downloadPdf error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  getDocTypes, listDocTypesForAdmin, updateDocType, uploadPendingPdf,
  submitRequest, resendOtp, verifyOtp,
  listMine,
  listForDistributor, updateStatusByDistributor, closeByDistributor,
  listAll, updateStatusByAdmin,
  downloadPdf,
  STATUS_VALUES,
};
