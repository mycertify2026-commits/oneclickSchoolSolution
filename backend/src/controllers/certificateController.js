const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');
const { debitWallet, creditWallet } = require('./walletController');
const { genSerial, fmtDate } = require('../utils/certificatePdf');
const { renderCertificatePdf } = require('../utils/certificateRenderDispatch');
const { generateReceiptPdf } = require('../utils/receiptPdf');
const { recordCommission } = require('../utils/commission');
const { UPLOAD_ROOT } = require('../middleware/upload');
const { logAudit } = require('../utils/audit');
const { sendCertificateGeneratedEmail, sendLowBalanceEmail } = require('../utils/email');
const { createNotification } = require('./notificationController');
const { restoreIfMissing } = require('../utils/fileStore');
const { sendExport } = require('../utils/importExport');
const { isValidType, getPriceForType } = require('../utils/pricing');

const GST_RATE = 0; // GST removed per requirement
const DOWNLOAD_WINDOW_DAYS = 5;

function generateSerial(type) {
  const prefix = { lc: 'LC', bonafide: 'BNF', idcard: 'IDC' }[type];
  const year = new Date().getFullYear();
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}-${year}-${rand}`;
}

// Converts a stored upload path to an absolute filesystem path.
// Multer saves req.file.path as a full absolute path (e.g. /home/runner/.../uploads/photos/x.jpg).
// Older records may store a URL-relative path (/uploads/photos/x.jpg).
// Handle both so photos, logos, signatures and stamps always resolve correctly.
function resolveUpload(urlOrPath) {
  if (!urlOrPath) return null;
  const s = String(urlOrPath);
  // Already a full absolute filesystem path from multer — use directly.
  if (s.startsWith(UPLOAD_ROOT)) return s;
  // URL-relative style: /uploads/photos/x.jpg → strip prefix and join.
  return path.join(UPLOAD_ROOT, s.replace(/^\/uploads\//, ''));
}

// GET /api/certificates/pricing - all three certificate prices in one place
// (Super Admin settings screen). ID Card's price lives in id_card_pricing
// (soft copy) so there is still only one authoritative row per type.
async function getAllPricing(req, res) {
  try {
    const [lc, bonafide, idcard] = await Promise.all([
      getPriceForType('lc'), getPriceForType('bonafide'), getPriceForType('idcard'),
    ]);
    res.json({ pricing: { lc, bonafide, idcard } });
  } catch (err) {
    console.error('getAllPricing error:', err.message);
    res.status(500).json({ error: 'Server error fetching certificate pricing' });
  }
}

// PUT /api/certificates/pricing (superAdmin) - updates configured prices.
// Changing a price here immediately affects cart, receipts, and (once
// wired) commission calculations on the next certificate generated —
// nothing caches these values in memory.
async function updateAllPricing(req, res) {
  try {
    const { lc, bonafide, idcard } = req.body;
    if (lc === undefined && bonafide === undefined && idcard === undefined) {
      return res.status(400).json({ error: 'At least one of lc, bonafide, idcard must be provided' });
    }
    for (const [type, value] of [['lc', lc], ['bonafide', bonafide]]) {
      if (value === undefined) continue;
      if (isNaN(value) || Number(value) < 0) return res.status(400).json({ error: `Invalid price for ${type}` });
      await pool.query(
        `INSERT INTO certificate_pricing (type, price, updated_by) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE price = VALUES(price), updated_by = VALUES(updated_by), updated_at = NOW()`,
        [type, value, req.user.id]
      );
    }
    if (idcard !== undefined) {
      if (isNaN(idcard) || Number(idcard) < 0) return res.status(400).json({ error: 'Invalid price for idcard' });
      await pool.query(
        `UPDATE id_card_pricing SET price = ?, updated_by = ?, updated_at = NOW() WHERE copy_type = 'soft'`,
        [idcard, req.user.id]
      );
    }
    const [newLc, newBonafide, newIdcard] = await Promise.all([
      getPriceForType('lc'), getPriceForType('bonafide'), getPriceForType('idcard'),
    ]);
    res.json({ pricing: { lc: newLc, bonafide: newBonafide, idcard: newIdcard } });
  } catch (err) {
    console.error('updateAllPricing error:', err.message);
    res.status(500).json({ error: 'Server error updating certificate pricing' });
  }
}

// GET /api/certificates/price?type=lc - lets the frontend show price + GST before generating
async function getPrice(req, res) {
  const { type } = req.query;
  if (!isValidType(type)) return res.status(400).json({ error: 'Invalid certificate type' });
  const price = await getPriceForType(type);
  const gst = Math.round(price * GST_RATE * 100) / 100;
  res.json({ price, gst, total: Math.round((price + gst) * 100) / 100 });
}

// POST /api/certificates/generate
async function generateCertificate(req, res) {
  try {
    const { studentId, type, purpose } = req.body;
    if (!studentId || (!isValidType(type))) {
      return res.status(400).json({ error: 'Valid studentId and certificate type are required' });
    }

    const [studentRows] = await pool.query('SELECT * FROM students WHERE id = ? AND school_id = ?', [studentId, req.schoolId]);
    if (studentRows.length === 0) return res.status(404).json({ error: 'Student not found in your school' });
    const student = studentRows[0];

    const [schoolRows] = await pool.query('SELECT * FROM schools WHERE id = ?', [req.schoolId]);
    const school = schoolRows[0];

    const price = await getPriceForType(type);
    const gst = Math.round(price * GST_RATE * 100) / 100;
    const serial = generateSerial(type);
    const certId = uuidv4();

    let debitResult;
    try {
      debitResult = await debitWallet(
        req.schoolId, price, `certificate_${type}`, null,
        `${type.toUpperCase()} certificate for ${student.full_name} (${serial})`
      );
    } catch (err) {
      if (err.code === 'INSUFFICIENT_BALANCE') {
        return res.status(402).json({
          error: 'Insufficient wallet balance',
          currentBalance: err.currentBalance,
          required: price,
          action: 'TOPUP_REQUIRED'
        });
      }
      throw err;
    }

    let pdfPath = null;
    try {
      const photoPath     = resolveUpload(student.photo_url);
      const logoPath      = resolveUpload(school.logo_url);
      const signaturePath = resolveUpload(school.signature_url);
      const stampPath     = resolveUpload(school.stamp_url);
      const certificate = { id: certId, serial_number: serial };
      // LC fields are JSON-encoded in `purpose` so they thread through the cart system unchanged
      let lcFields = {};
      if (type === 'lc' && purpose) {
        try { lcFields = JSON.parse(purpose); } catch (e) { /* plain string — ignore */ }
      }
      if (type === 'idcard') {
        pdfPath = path.join(UPLOAD_ROOT, 'idcards', `${serial}.pdf`);
        await renderCertificatePdf({ type: 'idcard', school, student, certificate, outputPath: pdfPath, photoPath, logoPath, signaturePath, stampPath });
      } else if (type === 'lc') {
        pdfPath = path.join(UPLOAD_ROOT, 'certificates', `${serial}.pdf`);
        await renderCertificatePdf({ type: 'lc', school, student, certificate, outputPath: pdfPath, photoPath, logoPath, signaturePath, stampPath, ...lcFields });
      } else if (type === 'bonafide') {
        pdfPath = path.join(UPLOAD_ROOT, 'certificates', `${serial}.pdf`);
        await renderCertificatePdf({ type: 'bonafide', school, student, certificate, outputPath: pdfPath, photoPath, logoPath, purpose, signaturePath, stampPath });
      }
    } catch (pdfErr) {
      // PDF generation failed AFTER the wallet was already debited - refund
      // immediately so the school is never charged for a certificate that
      // doesn't exist. This is a real failure mode that existed before (a
      // disk-full error, a bad font path, etc. mid-generation would have
      // silently left the school short the certificate price with nothing
      // to show for it), not something introduced by this change - fixed
      // here since this code path was already being touched.
      console.error('PDF generation failed after debit, refunding:', pdfErr.message);
      try {
        await creditWallet(req.schoolId, price, 'certificate_generation_failed_refund', null, `Refund: ${type} certificate generation failed for ${student.full_name}`);
      } catch (refundErr) {
        console.error('CRITICAL: refund after failed PDF generation also failed:', refundErr.message);
      }
      return res.status(500).json({ error: 'Certificate generation failed. Your wallet has been refunded.' });
    }

    await pool.query(
      `INSERT INTO certificates (id, school_id, student_id, type, serial_number, price, gst_amount, payment_method, wallet_transaction_id, pdf_path, purpose, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'wallet', ?, ?, ?, ?)`,
      [certId, req.schoolId, studentId, type, serial, price, gst, debitResult.transactionId, pdfPath, purpose || null,
       new Date(Date.now() + DOWNLOAD_WINDOW_DAYS * 24 * 60 * 60 * 1000)]
    );

    const [certRows] = await pool.query('SELECT * FROM certificates WHERE id = ?', [certId]);

    await logAudit({
      userId: req.user.id, action: 'CERTIFICATE_GENERATED', entityType: 'certificate', entityId: certId, ipAddress: req.ip,
      details: { type, serial, price, studentId, schoolId: req.schoolId }
    });

    const [recipientRows] = await pool.query(
      `SELECT u.email, u.name FROM users u WHERE u.id = ?`,
      [req.user.id]
    );
    if (recipientRows[0]) {
      const TYPE_LABELS = { lc: 'Leaving Certificate', bonafide: 'Bonafide', idcard: 'ID Card', relation: 'Relation Certificate' };
      sendCertificateGeneratedEmail(recipientRows[0].email, recipientRows[0].name, { studentName: student.full_name, type: TYPE_LABELS[type], serial, schoolId: req.schoolId, certificateId: certId })
        .catch(e => console.error('Certificate-generated email failed:', e.message));
    }

    // Low-balance alert: fires once the balance drops to or below this
    // threshold, so the school still has a buffer before generation is
    // actually blocked by debitWallet's INSUFFICIENT_BALANCE check above.
    const LOW_BALANCE_THRESHOLD = 100;
    if (debitResult.newBalance <= LOW_BALANCE_THRESHOLD) {
      await createNotification(req.user.id, `Low wallet balance: ₹${debitResult.newBalance}. Please recharge soon to avoid interruption.`);
      if (recipientRows[0]) {
        sendLowBalanceEmail(recipientRows[0].email, recipientRows[0].name, school.name, debitResult.newBalance)
          .catch(e => console.error('Low-balance email failed:', e.message));
      }
    }

    res.status(201).json({ certificate: certRows[0], newWalletBalance: debitResult.newBalance });
  } catch (err) {
    console.error('generateCertificate error:', err.message);
    res.status(500).json({ error: 'Server error generating certificate' });
  }
}

// GET /api/certificates
async function listCertificates(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, s.full_name as student_name FROM certificates c
       JOIN students s ON s.id = c.student_id WHERE c.school_id = ? ORDER BY c.created_at DESC`,
      [req.schoolId]
    );
    res.json({ certificates: rows });
  } catch (err) {
    console.error('listCertificates error:', err.message);
    res.status(500).json({ error: 'Server error fetching certificates' });
  }
}

// GET /api/certificates/earnings (schoolAdmin) - the school's share of every
// certificate it has issued, sourced from the commission ledger's permanent
// snapshot (never recalculated from today's school/platform split).
async function getMyEarnings(req, res) {
  try {
    const [[totals]] = await pool.query(
      `SELECT COALESCE(SUM(school_share),0) as total,
              COALESCE(SUM(CASE WHEN DATE(created_at)=CURDATE() THEN school_share ELSE 0 END),0) as today,
              COALESCE(SUM(CASE WHEN YEAR(created_at)=YEAR(CURDATE()) AND MONTH(created_at)=MONTH(CURDATE()) THEN school_share ELSE 0 END),0) as this_month,
              COUNT(*) as total_certificates
       FROM commission_ledger WHERE school_id = ? AND status = 'confirmed'`,
      [req.schoolId]
    );
    const [transactions] = await pool.query(
      `SELECT cl.certificate_id, cl.certificate_type, cl.certificate_price, cl.school_share, cl.created_at,
              c.serial_number, s.full_name as student_name
       FROM commission_ledger cl
       JOIN certificates c ON c.id = cl.certificate_id
       JOIN students s ON s.id = c.student_id
       WHERE cl.school_id = ? AND cl.status = 'confirmed'
       ORDER BY cl.created_at DESC LIMIT 100`,
      [req.schoolId]
    );
    res.json({
      total: Number(totals.total),
      today: Number(totals.today),
      thisMonth: Number(totals.this_month),
      totalCertificates: Number(totals.total_certificates),
      transactions: transactions.map(t => ({
        certificateId: t.certificate_id, type: t.certificate_type, serial: t.serial_number,
        studentName: t.student_name, price: Number(t.certificate_price), schoolShare: Number(t.school_share),
        date: t.created_at,
      })),
    });
  } catch (err) {
    console.error('getMyEarnings error:', err.message);
    res.status(500).json({ error: 'Server error fetching earnings' });
  }
}

// POST /api/certificates/preview (schoolAdmin)
// Generates a certificate PDF in memory and returns it as base64.
// Nothing is saved to DB or disk — it is a pure preview.
async function previewCertificate(req, res) {
  const os   = require('os');
  const { studentId, type, purpose } = req.body;
  if (!studentId || !type) return res.status(400).json({ error: 'studentId and type are required' });

  try {
    const [studentRows] = await pool.query('SELECT * FROM students WHERE id = ? AND school_id = ?', [studentId, req.schoolId]);
    if (!studentRows[0]) return res.status(404).json({ error: 'Student not found' });
    const student = studentRows[0];

    const [schoolRows] = await pool.query('SELECT * FROM schools WHERE id = ?', [req.schoolId]);
    if (!schoolRows[0]) return res.status(404).json({ error: 'School not found' });
    const school = schoolRows[0];

    const serial      = generateSerial(type);
    const fakeId      = uuidv4();
    const tmpPath     = path.join(os.tmpdir(), `preview-${fakeId}.pdf`);
    const photoPath     = resolveUpload(student.photo_url);
    const logoPath      = resolveUpload(school.logo_url);
    const signaturePath = resolveUpload(school.signature_url);
    const stampPath     = resolveUpload(school.stamp_url);
    const certificate = { id: fakeId, serial_number: serial };

    let lcFields = {};
    if (type === 'lc' && purpose) {
      try { lcFields = JSON.parse(purpose); } catch (e) {}
    }
    if (type === 'idcard') {
      await renderCertificatePdf({ type: 'idcard', school, student, certificate, outputPath: tmpPath, photoPath, logoPath, signaturePath, stampPath });
    } else if (type === 'lc') {
      // Original/Duplicate is never trusted from the client — same rule as
      // cartController: the first successfully-issued LC for this student is
      // Original, every one after is Duplicate.
      const [existingOriginal] = await pool.query(
        "SELECT id FROM certificates WHERE school_id=? AND student_id=? AND type='lc' AND certificate_variant='original' AND deleted_at IS NULL LIMIT 1",
        [req.schoolId, studentId]
      );
      await renderCertificatePdf({
        type: 'lc', school, student, certificate, outputPath: tmpPath, photoPath, logoPath, signaturePath, stampPath,
        ...lcFields,
        lcType: existingOriginal.length ? 'duplicate' : 'original',
      });
    } else if (type === 'bonafide') {
      await renderCertificatePdf({ type: 'bonafide', school, student, certificate, outputPath: tmpPath, photoPath, logoPath, purpose: purpose || '', signaturePath, stampPath });
    } else {
      return res.status(400).json({ error: 'Invalid certificate type' });
    }

    const pdfBuffer = fs.readFileSync(tmpPath);
    fs.unlinkSync(tmpPath);
    res.json({ pdfBase64: pdfBuffer.toString('base64') });
  } catch (err) {
    console.error('previewCertificate error:', err.message);
    res.status(500).json({ error: 'Preview generation failed: ' + err.message });
  }
}

// GET /api/certificates/:id/download
async function downloadCertificate(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM certificates WHERE id = ? AND school_id = ?', [req.params.id, req.schoolId]);
    const cert = rows[0];
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });

    if (new Date(cert.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Download window has expired (5 days). Please regenerate.' });
    }

    // If the file is missing (e.g. server restarted / deployment container reset),
    // regenerate it from the stored data so the download always works.
    // Bonafide PDFs contain static QR/layout assets. Regenerate them on
    // download so certificates created before a QR/layout fix are refreshed.
    if (cert.type === 'bonafide' || !cert.pdf_path || !fs.existsSync(cert.pdf_path)) {
      try {
        const [studentRows] = await pool.query('SELECT * FROM students WHERE id = ?', [cert.student_id]);
        const [schoolRows]  = await pool.query('SELECT * FROM schools WHERE id = ?',  [cert.school_id]);
        if (!studentRows[0] || !schoolRows[0]) {
          return res.status(404).json({ error: 'Cannot regenerate PDF: student or school not found' });
        }
        const student     = studentRows[0];
        const school      = schoolRows[0];
        const subdir      = cert.type === 'idcard' ? 'idcards' : 'certificates';
        const newPath     = path.join(UPLOAD_ROOT, subdir, `${cert.serial_number}.pdf`);
        fs.mkdirSync(path.dirname(newPath), { recursive: true });
        const photoPath     = resolveUpload(student.photo_url);
        const logoPath      = resolveUpload(school.logo_url);
        const signaturePath = resolveUpload(school.signature_url);
        const stampPath     = resolveUpload(school.stamp_url);

        // Restore files from DB if the ephemeral container lost them after a restart
        const [[schoolData]] = await pool.query(
          'SELECT logo_data, signature_data, stamp_data FROM schools WHERE id = ?', [school.id]
        );
        if (schoolData) {
          restoreIfMissing(logoPath,      schoolData.logo_data);
          restoreIfMissing(signaturePath, schoolData.signature_data);
          restoreIfMissing(stampPath,     schoolData.stamp_data);
        }
        const [[studentData]] = await pool.query(
          'SELECT photo_data FROM students WHERE id = ?', [student.id]
        );
        if (studentData) restoreIfMissing(photoPath, studentData.photo_data);

        const certificate = { id: cert.id, serial_number: cert.serial_number };

        let lcFields = {};
        if (cert.type === 'lc' && cert.purpose) { try { lcFields = JSON.parse(cert.purpose); } catch (e) {} }
        if (cert.type === 'idcard') {
          await renderCertificatePdf({ type: 'idcard', school, student, certificate, outputPath: newPath, photoPath, logoPath, signaturePath, stampPath });
        } else if (cert.type === 'lc') {
          await renderCertificatePdf({ type: 'lc', school, student, certificate, outputPath: newPath, photoPath, logoPath, signaturePath, stampPath, ...lcFields });
        } else {
          await renderCertificatePdf({ type: 'bonafide', school, student, certificate, outputPath: newPath, photoPath, logoPath, purpose: cert.purpose, signaturePath, stampPath });
        }
        // Persist the new path so the next download skips regeneration
        await pool.query('UPDATE certificates SET pdf_path = ? WHERE id = ?', [newPath, cert.id]);
        cert.pdf_path = newPath;
      } catch (regenErr) {
        console.error('downloadCertificate regen error:', regenErr.message);
        return res.status(500).json({ error: 'PDF regeneration failed. Please contact support.' });
      }
    }

    res.download(cert.pdf_path, `${cert.serial_number}.pdf`);
  } catch (err) {
    console.error('downloadCertificate error:', err.message);
    res.status(500).json({ error: 'Server error downloading certificate' });
  }
}

// GET /api/certificates/:id/receipt (schoolAdmin) - the 2x-price receipt for
// a successfully issued certificate. Regenerates the PDF from the stored
// receipt row if the file is missing (same pattern as downloadCertificate).
async function downloadReceipt(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM receipts WHERE certificate_id = ? AND school_id = ?',
      [req.params.id, req.schoolId]
    );
    const receipt = rows[0];
    if (!receipt) return res.status(404).json({ error: 'Receipt not found for this certificate' });

    if (!receipt.pdf_path || !fs.existsSync(receipt.pdf_path)) {
      const [certRows] = await pool.query('SELECT * FROM certificates WHERE id = ?', [receipt.certificate_id]);
      const [studentRows] = await pool.query('SELECT * FROM students WHERE id = ?', [receipt.student_id]);
      const [schoolRows] = await pool.query('SELECT * FROM schools WHERE id = ?', [receipt.school_id]);
      const [userRows] = await pool.query('SELECT name FROM users WHERE id = ?', [receipt.generated_by]);
      if (!certRows[0] || !studentRows[0] || !schoolRows[0]) {
        return res.status(404).json({ error: 'Cannot regenerate receipt: related record not found' });
      }
      const newPath = path.join(UPLOAD_ROOT, 'receipts', `${receipt.receipt_number}.pdf`);
      fs.mkdirSync(path.dirname(newPath), { recursive: true });
      try {
        await generateReceiptPdf({
          school: schoolRows[0],
          student: studentRows[0],
          certificate: certRows[0],
          receipt,
          generatedByName: userRows[0]?.name || 'School Admin',
          outputPath: newPath,
        });
        await pool.query('UPDATE receipts SET pdf_path = ? WHERE id = ?', [newPath, receipt.id]);
        receipt.pdf_path = newPath;
      } catch (regenErr) {
        console.error('downloadReceipt regen error:', regenErr.message);
        return res.status(500).json({ error: 'Receipt regeneration failed. Please contact support.' });
      }
    }

    res.download(receipt.pdf_path, `${receipt.receipt_number}.pdf`);
  } catch (err) {
    console.error('downloadReceipt error:', err.message);
    res.status(500).json({ error: 'Server error downloading receipt' });
  }
}

// GET /api/schools/:id/certificates (superAdmin) - full certificate breakdown for one school, used by the School Detail page
async function listCertificatesForSchool(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, s.full_name as student_name, COALESCE(s.current_standard, s.admission_standard) as admission_standard
       FROM certificates c JOIN students s ON s.id = c.student_id
       WHERE c.school_id = ? ORDER BY c.created_at DESC`,
      [req.params.id]
    );
    res.json({ certificates: rows });
  } catch (err) {
    console.error('listCertificatesForSchool error:', err.message);
    res.status(500).json({ error: 'Server error fetching school certificates' });
  }
}

// GET /api/certificates/:id/admin-download (superAdmin) - oversight access to any
// certificate's PDF regardless of school, and not subject to the 5-day download
// expiry that exists for the school's own convenience - audit access shouldn't
// be blocked just because the original download window passed.
async function downloadCertificateAsAdmin(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM certificates WHERE id = ?', [req.params.id]);
    const cert = rows[0];
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });

    // Regenerate PDF if file is missing (deployment container reset, etc.)
    if (cert.type === 'bonafide' || !cert.pdf_path || !fs.existsSync(cert.pdf_path)) {
      try {
        const [studentRows] = await pool.query('SELECT * FROM students WHERE id = ?', [cert.student_id]);
        const [schoolRows]  = await pool.query('SELECT * FROM schools WHERE id = ?',  [cert.school_id]);
        if (!studentRows[0] || !schoolRows[0]) {
          return res.status(404).json({ error: 'Cannot regenerate PDF: student or school not found' });
        }
        const student     = studentRows[0];
        const school      = schoolRows[0];
        const subdir      = cert.type === 'idcard' ? 'idcards' : 'certificates';
        const newPath     = path.join(UPLOAD_ROOT, subdir, `${cert.serial_number}.pdf`);
        fs.mkdirSync(path.dirname(newPath), { recursive: true });
        const photoPath     = resolveUpload(student.photo_url);
        const logoPath      = resolveUpload(school.logo_url);
        const signaturePath = resolveUpload(school.signature_url);
        const stampPath     = resolveUpload(school.stamp_url);
        const certificate = { id: cert.id, serial_number: cert.serial_number };

        let lcFields = {};
        if (cert.type === 'lc' && cert.purpose) { try { lcFields = JSON.parse(cert.purpose); } catch (e) {} }
        if (cert.type === 'idcard') {
          await renderCertificatePdf({ type: 'idcard', school, student, certificate, outputPath: newPath, photoPath, logoPath, signaturePath, stampPath });
        } else if (cert.type === 'lc') {
          await renderCertificatePdf({ type: 'lc', school, student, certificate, outputPath: newPath, photoPath, logoPath, signaturePath, stampPath, ...lcFields });
        } else {
          await renderCertificatePdf({ type: 'bonafide', school, student, certificate, outputPath: newPath, photoPath, logoPath, purpose: cert.purpose, signaturePath, stampPath });
        }
        await pool.query('UPDATE certificates SET pdf_path = ? WHERE id = ?', [newPath, cert.id]);
        cert.pdf_path = newPath;
      } catch (regenErr) {
        console.error('downloadCertificateAsAdmin regen error:', regenErr.message);
        return res.status(500).json({ error: 'PDF regeneration failed. Please contact support.' });
      }
    }

    res.download(cert.pdf_path, `${cert.serial_number}.pdf`);
  } catch (err) {
    console.error('downloadCertificateAsAdmin error:', err.message);
    res.status(500).json({ error: 'Server error downloading certificate' });
  }
}

// GET /api/certificates/public/:id/pdf - PUBLIC, no authentication.
// This is what the QR code on every certificate/ID card directly links to.
// Serves the certificate PDF inline so it opens in the phone browser.
async function publicDownloadCertificate(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM certificates WHERE id = ?', [req.params.id]);
    const cert = rows[0];
    if (!cert) return res.status(404).send('Certificate not found');

    // Regenerate if file is missing (server restart / container reset)
    if (cert.type === 'bonafide' || !cert.pdf_path || !fs.existsSync(cert.pdf_path)) {
      try {
        const [studentRows] = await pool.query('SELECT * FROM students WHERE id = ?', [cert.student_id]);
        const [schoolRows]  = await pool.query('SELECT * FROM schools WHERE id = ?',  [cert.school_id]);
        if (!studentRows[0] || !schoolRows[0]) {
          return res.status(404).send('Cannot regenerate PDF: student or school not found');
        }
        const student = studentRows[0];
        const school  = schoolRows[0];
        const subdir  = cert.type === 'idcard' ? 'idcards' : 'certificates';
        const newPath = path.join(UPLOAD_ROOT, subdir, `${cert.serial_number}.pdf`);
        fs.mkdirSync(path.dirname(newPath), { recursive: true });
        const photoPath     = resolveUpload(student.photo_url);
        const logoPath      = resolveUpload(school.logo_url);
        const signaturePath = resolveUpload(school.signature_url);
        const stampPath     = resolveUpload(school.stamp_url);
        const certificate   = { id: cert.id, serial_number: cert.serial_number };
        let lcFields = {};
        if (cert.type === 'lc' && cert.purpose) { try { lcFields = JSON.parse(cert.purpose); } catch (e) {} }
        if (cert.type === 'idcard') {
          await renderCertificatePdf({ type: 'idcard', school, student, certificate, outputPath: newPath, photoPath, logoPath, signaturePath, stampPath });
        } else if (cert.type === 'lc') {
          await renderCertificatePdf({ type: 'lc', school, student, certificate, outputPath: newPath, photoPath, logoPath, signaturePath, stampPath, ...lcFields });
        } else {
          await renderCertificatePdf({ type: 'bonafide', school, student, certificate, outputPath: newPath, photoPath, logoPath, purpose: cert.purpose, signaturePath, stampPath });
        }
        await pool.query('UPDATE certificates SET pdf_path = ? WHERE id = ?', [newPath, cert.id]);
        cert.pdf_path = newPath;
      } catch (regenErr) {
        console.error('publicDownloadCertificate regen error:', regenErr.message);
        return res.status(500).send('PDF regeneration failed');
      }
    }

    // Send inline so the phone browser opens it directly (not a download prompt)
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${cert.serial_number}.pdf"`);
    fs.createReadStream(cert.pdf_path).pipe(res);
  } catch (err) {
    console.error('publicDownloadCertificate error:', err.message);
    res.status(500).send('Server error');
  }
}

// GET /api/certificates/verify/:id - PUBLIC, no authentication. This is
// what the QR code on every certificate/ID card actually points to (via
// the frontend's /verify/:id page, which calls this endpoint). Deliberately
// returns only non-sensitive fields - no price, no wallet transaction id,
// no internal IDs beyond what's needed to display the verification result.
async function verifyCertificate(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.type, c.serial_number, c.created_at, c.expires_at,
              s.full_name as student_name,
              COALESCE(s.current_standard, s.admission_standard) as admission_standard,
              COALESCE(s.current_division, s.admission_division) as admission_division,
              s.dob, s.caste, s.mother_name,
               sc.name as school_name, sc.city as school_city, sc.district as school_district,
               sc.taluka as school_taluka, sc.principal_name, sc.phone as school_phone,
               sc.email as school_email, sc.udise_code,
               s.photo_url, s.photo_data
       FROM certificates c
       JOIN students s ON s.id = c.student_id
       JOIN schools sc ON sc.id = c.school_id
       WHERE c.id = ?`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ valid: false, error: 'Certificate not found' });
    }

    const cert = rows[0];
    const TYPE_LABELS = { lc: 'Leaving Certificate', bonafide: 'Bonafide Certificate', idcard: 'Student ID Card', relation: 'Relation Certificate' };

    let studentPhotoDataUrl = null;
    let photoBytes = cert.photo_data;
    if (!photoBytes && cert.photo_url) {
      const storedPhotoPath = resolveUpload(cert.photo_url);
      if (storedPhotoPath && fs.existsSync(storedPhotoPath)) {
        try { photoBytes = fs.readFileSync(storedPhotoPath); } catch (_) {}
      }
    }
    if (photoBytes) {
      const photoPath = String(cert.photo_url || '').toLowerCase();
      const mime = photoPath.endsWith('.png') ? 'image/png'
        : photoPath.endsWith('.webp') ? 'image/webp'
        : photoPath.endsWith('.svg') ? 'image/svg+xml'
        : 'image/jpeg';
      const photoBuffer = Buffer.isBuffer(photoBytes)
        ? photoBytes
        : Buffer.from(photoBytes);
      studentPhotoDataUrl = `data:${mime};base64,${photoBuffer.toString('base64')}`;
    }

    res.json({
      valid: true,
      certificate: {
        type: cert.type,
        typeLabel: TYPE_LABELS[cert.type],
        serialNumber: cert.serial_number,
        studentName: cert.student_name,
        standard: cert.admission_standard,
        division: cert.admission_division,
        dob: fmtDate(cert.dob),
        caste: cert.caste,
        motherName: cert.mother_name,
        schoolName: cert.school_name,
        schoolCity: cert.school_city,
        schoolDistrict: cert.school_district,
         schoolTaluka: cert.school_taluka,
         principalName: cert.principal_name,
         schoolPhone: cert.school_phone,
         schoolEmail: cert.school_email,
         udiseCode: cert.udise_code,
         studentPhoto: studentPhotoDataUrl,
        issueDate: cert.created_at,
        generatedBy: cert.school_name
      }
    });
  } catch (err) {
    console.error('verifyCertificate error:', err.message);
    res.status(500).json({ valid: false, error: 'Server error verifying certificate' });
  }
}

const CERTIFICATE_EXPORT_COLUMNS = [
  { header: 'Serial Number', field: 'serial_number' },
  { header: 'Type', field: 'type' },
  { header: 'Student Name', field: 'student_name' },
  { header: 'Price', field: 'price', type: 'currency' },
  { header: 'GST', field: 'gst_amount', type: 'currency' },
  { header: 'Issue Date', field: 'created_at', type: 'date' },
  { header: 'Download Expires', field: 'expires_at', type: 'date' }
];

// GET /api/certificates/export?format=excel|csv&type=lc&dateFrom=...&dateTo=...
async function exportCertificates(req, res) {
  try {
    const { format, type, dateFrom, dateTo } = req.query;
    let query = `SELECT c.*, s.full_name as student_name FROM certificates c JOIN students s ON s.id = c.student_id WHERE c.school_id = ?`;
    const params = [req.schoolId];
    if (type) { query += ' AND c.type = ?'; params.push(type); }
    if (dateFrom) { query += ' AND c.created_at >= ?'; params.push(dateFrom); }
    if (dateTo) { query += ' AND c.created_at <= ?'; params.push(dateTo); }
    query += ' ORDER BY c.created_at DESC';

    const [rows] = await pool.query(query, params);
    sendExport(res, { rows, columns: CERTIFICATE_EXPORT_COLUMNS, filename: `certificates-export-${Date.now()}`, format });
  } catch (err) {
    console.error('exportCertificates error:', err.message);
    res.status(500).json({ error: 'Server error exporting certificates' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// APPROVAL FLOW — school requests → super admin approves → wallet debited
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/certificates/request (schoolAdmin)
// Creates a pending request — balance check only, NO debit yet.
async function requestCertificate(req, res) {
  try {
    const { studentId, type, purpose } = req.body;
    if (!studentId || (!isValidType(type))) {
      return res.status(400).json({ error: 'Valid studentId and certificate type are required' });
    }

    const [studentRows] = await pool.query('SELECT * FROM students WHERE id = ? AND school_id = ?', [studentId, req.schoolId]);
    if (studentRows.length === 0) return res.status(404).json({ error: 'Student not found in your school' });
    const student = studentRows[0];

    const [schoolRows] = await pool.query('SELECT * FROM schools WHERE id = ?', [req.schoolId]);
    const school = schoolRows[0];

    const price = await getPriceForType(type);
    const gst = Math.round(price * GST_RATE * 100) / 100;

    // Balance check only — no debit
    const [walletRows] = await pool.query('SELECT balance FROM wallets WHERE school_id = ?', [req.schoolId]);
    if (!walletRows.length || Number(walletRows[0].balance) < price) {
      return res.status(402).json({
        error: 'Insufficient wallet balance',
        currentBalance: Number(walletRows[0]?.balance || 0),
        required: price,
        action: 'TOPUP_REQUIRED'
      });
    }

    const approvalCode = String(Math.floor(100000 + Math.random() * 900000));
    const reqId = uuidv4();

    await pool.query(
      `INSERT INTO certificate_requests (id, school_id, student_id, type, purpose, price, gst_amount, approval_code, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [reqId, req.schoolId, studentId, type, purpose || null, price, gst, approvalCode]
    );

    // Notify Super Admin
    const [adminRows] = await pool.query("SELECT id FROM users WHERE role='superAdmin' LIMIT 1");
    if (adminRows[0]) {
      const TYPE_LABELS = { lc: 'Leaving Certificate', bonafide: 'Bonafide', idcard: 'ID Card', relation: 'Relation Certificate' };
      await createNotification(
        adminRows[0].id,
        `📋 New Certificate Request — ${TYPE_LABELS[type]} for ${student.full_name} from ${school.name} | Code: ${approvalCode} | ₹${(price + gst).toFixed(2)}`
      );
    }

    await logAudit({
      userId: req.user.id, action: 'CERTIFICATE_REQUESTED', entityType: 'certificate_request',
      entityId: reqId, ipAddress: req.ip, details: { type, price, studentId, schoolId: req.schoolId }
    });

    res.status(201).json({ requestId: reqId, approvalCode, message: 'Certificate request submitted. Awaiting Super Admin approval.' });
  } catch (err) {
    console.error('requestCertificate error:', err.message);
    res.status(500).json({ error: 'Server error creating certificate request' });
  }
}

// GET /api/certificates/requests (schoolAdmin) — own school's requests
async function listMyRequests(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT cr.*, s.full_name as student_name
       FROM certificate_requests cr
       JOIN students s ON s.id = cr.student_id
       WHERE cr.school_id = ?
       ORDER BY cr.created_at DESC LIMIT 100`,
      [req.schoolId]
    );
    res.json({ requests: rows });
  } catch (err) {
    console.error('listMyRequests error:', err.message);
    res.status(500).json({ error: 'Server error fetching requests' });
  }
}

// GET /api/certificates/requests/admin?status=pending (superAdmin)
async function adminListRequests(req, res) {
  try {
    const { status } = req.query;
    let query = `SELECT cr.*, s.full_name as student_name, sc.name as school_name
       FROM certificate_requests cr
       JOIN students s ON s.id = cr.student_id
       JOIN schools sc ON sc.id = cr.school_id`;
    const params = [];
    if (status) { query += ' WHERE cr.status = ?'; params.push(status); }
    query += ' ORDER BY cr.created_at DESC LIMIT 200';
    const [rows] = await pool.query(query, params);
    res.json({ requests: rows });
  } catch (err) {
    console.error('adminListRequests error:', err.message);
    res.status(500).json({ error: 'Server error fetching requests' });
  }
}

// POST /api/certificates/requests/admin/:id/approve (superAdmin)
// Concurrency-safe: row-level lock inside a transaction prevents double approval.
// Flow: lock row → verify pending → mark 'processing' → commit lock → debit wallet
//       → generate PDF → insert certificate → mark 'approved'. Each failure reverts
//       the status so the request can be retried by the SA.
async function adminApproveRequest(req, res) {
  const TYPE_LABELS = { lc: 'Leaving Certificate', bonafide: 'Bonafide', idcard: 'ID Card', relation: 'Relation Certificate' };
  let certReq;

  // ── Step 1: Atomically claim the request with a row-level lock ────────────
  // Two concurrent approvals: only one gets past the FOR UPDATE + pending check.
  // We immediately set status='processing' and commit so the lock is released
  // before the slow debit + PDF work begins.
  const claimConn = await pool.getConnection();
  try {
    await claimConn.beginTransaction();
    const [reqRows] = await claimConn.query(
      'SELECT * FROM certificate_requests WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    if (!reqRows.length) {
      await claimConn.rollback();
      return res.status(404).json({ error: 'Request not found' });
    }
    certReq = reqRows[0];
    if (certReq.status !== 'pending') {
      await claimConn.rollback();
      return res.status(400).json({ error: `Request is not in pending state (current: ${certReq.status})` });
    }
    await claimConn.query(
      `UPDATE certificate_requests SET status='processing', approved_by=? WHERE id=?`,
      [req.user.id, certReq.id]
    );
    await claimConn.commit();
  } catch (err) {
    try { await claimConn.rollback(); } catch (e) {}
    console.error('adminApproveRequest claim error:', err.message);
    return res.status(500).json({ error: 'Server error claiming certificate request' });
  } finally {
    claimConn.release();
  }

  // Helper: revert status to 'pending' so the SA can retry after a transient failure.
  async function revertToPending() {
    try {
      await pool.query(`UPDATE certificate_requests SET status='pending', approved_by=NULL WHERE id=?`, [certReq.id]);
    } catch (e) {
      console.error('Failed to revert request to pending:', e.message);
    }
  }

  // ── Step 2: Load student + school (lock already released) ─────────────────
  const [studentRows] = await pool.query('SELECT * FROM students WHERE id = ?', [certReq.student_id]);
  if (!studentRows.length) {
    await revertToPending();
    return res.status(404).json({ error: 'Student not found' });
  }
  const student = studentRows[0];
  const [schoolRows] = await pool.query('SELECT * FROM schools WHERE id = ?', [certReq.school_id]);
  const school = schoolRows[0];

  const serial = generateSerial(certReq.type);
  const certId = uuidv4();

  // ── Step 3: Debit wallet (has its own row-locked transaction internally) ───
  let debitResult;
  try {
    debitResult = await debitWallet(
      certReq.school_id, certReq.price, `certificate_${certReq.type}`, null,
      `${certReq.type.toUpperCase()} certificate for ${student.full_name} (${serial})`
    );
  } catch (err) {
    await revertToPending();
    if (err.code === 'INSUFFICIENT_BALANCE') {
      return res.status(402).json({ error: 'School has insufficient wallet balance', currentBalance: err.currentBalance });
    }
    console.error('adminApproveRequest debit error:', err.message);
    return res.status(500).json({ error: 'Wallet debit failed. Request reverted to pending.' });
  }

  // ── Step 4: Generate PDF ───────────────────────────────────────────────────
  let pdfPath = null;
  let lcVariant = 'original'; // declared outside the try block — read again in Step 5/5b below
  try {
    const photoPath     = resolveUpload(student.photo_url);
    const logoPath      = resolveUpload(school.logo_url);
    const signaturePath = resolveUpload(school.signature_url);
    const stampPath     = resolveUpload(school.stamp_url);
    const certificate = { id: certId, serial_number: serial };
    let lcFields = {};
    if (certReq.type === 'lc' && certReq.purpose) { try { lcFields = JSON.parse(certReq.purpose); } catch (e) {} }
    if (certReq.type === 'idcard') {
      pdfPath = path.join(UPLOAD_ROOT, 'idcards', `${serial}.pdf`);
      await renderCertificatePdf({ type: 'idcard', school, student, certificate, outputPath: pdfPath, photoPath, logoPath, signaturePath, stampPath });
    } else if (certReq.type === 'lc') {
      // Same backend-enforced rule as the cart flow: never trust the client
      // for Original/Duplicate — first successfully-issued LC wins Original.
      const [existingOriginal] = await pool.query(
        "SELECT id FROM certificates WHERE school_id=? AND student_id=? AND type='lc' AND certificate_variant='original' AND deleted_at IS NULL LIMIT 1",
        [certReq.school_id, certReq.student_id]
      );
      lcVariant = existingOriginal.length ? 'duplicate' : 'original';
      pdfPath = path.join(UPLOAD_ROOT, 'certificates', `${serial}.pdf`);
      await renderCertificatePdf({ type: 'lc', school, student, certificate, outputPath: pdfPath, photoPath, logoPath, signaturePath, stampPath, ...lcFields, lcType: lcVariant });
    } else if (certReq.type === 'bonafide') {
      pdfPath = path.join(UPLOAD_ROOT, 'certificates', `${serial}.pdf`);
      await renderCertificatePdf({ type: 'bonafide', school, student, certificate, outputPath: pdfPath, photoPath, logoPath, purpose: certReq.purpose, signaturePath, stampPath });
    }
  } catch (pdfErr) {
    console.error('PDF generation failed after approval debit, refunding + reverting:', pdfErr.message);
    try {
      await creditWallet(certReq.school_id, certReq.price, 'approval_pdf_failed_refund', null,
        `Refund: ${certReq.type} PDF failed for ${student.full_name}`);
    } catch (e) {
      console.error('CRITICAL: refund after failed approval PDF also failed:', e.message);
    }
    await revertToPending();
    return res.status(500).json({ error: 'PDF generation failed. Wallet refunded. Request reverted to pending.' });
  }

  // ── Step 5: Insert certificate record + mark request approved ─────────────
  try {
    await pool.query(
      `INSERT INTO certificates (id, school_id, student_id, type, serial_number, price, gst_amount, payment_method, wallet_transaction_id, pdf_path, purpose, certificate_variant, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'wallet', ?, ?, ?, ?, ?)`,
      [certId, certReq.school_id, certReq.student_id, certReq.type, serial, certReq.price, certReq.gst_amount, debitResult.transactionId, pdfPath, certReq.purpose || null,
       certReq.type === 'lc' ? lcVariant : 'original',
       new Date(Date.now() + DOWNLOAD_WINDOW_DAYS * 24 * 60 * 60 * 1000)]
    );
    await pool.query(
      `UPDATE certificate_requests SET status='approved', resolved_at=NOW(), certificate_id=? WHERE id=?`,
      [certId, certReq.id]
    );
  } catch (dbErr) {
    console.error('adminApproveRequest DB write error:', dbErr.message);
    // Debit and PDF already done — do not revert; log for manual reconciliation.
    return res.status(500).json({ error: 'Certificate record save failed. Contact support — debit may have occurred.' });
  }

  // ── Step 5b: Receipt (2x price) — isolated so a failure here never undoes
  // the already-successful certificate issuance above. ─────────────────────
  try {
    const receiptNumber = genSerial('REC');
    const receiptAmount = Math.round(parseFloat(certReq.price) * 2 * 100) / 100;
    const receiptDir = path.join(UPLOAD_ROOT, 'receipts');
    if (!fs.existsSync(receiptDir)) fs.mkdirSync(receiptDir, { recursive: true });
    const receiptPath = path.join(receiptDir, `${receiptNumber}.pdf`);
    const [adminUserRows] = await pool.query('SELECT name FROM users WHERE id = ?', [school.admin_user_id]);
    const receiptRow = {
      receipt_number: receiptNumber,
      base_price: certReq.price,
      receipt_amount: receiptAmount,
      certificate_variant: certReq.type === 'lc' ? lcVariant : 'original',
      created_at: new Date(),
    };
    await generateReceiptPdf({
      school, student,
      certificate: { id: certId, serial_number: serial, type: certReq.type, wallet_transaction_id: debitResult.transactionId },
      receipt: receiptRow,
      generatedByName: adminUserRows[0]?.name || 'School Admin',
      outputPath: receiptPath,
    });
    await pool.query(
      `INSERT INTO receipts
       (id, certificate_id, school_id, student_id, receipt_number, certificate_type,
        certificate_variant, base_price, receipt_amount, pdf_path, generated_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [uuidv4(), certId, certReq.school_id, certReq.student_id, receiptNumber, certReq.type,
       receiptRow.certificate_variant, certReq.price, receiptAmount, receiptPath, school.admin_user_id]
    );
  } catch (receiptErr) {
    console.error('Receipt generation failed for approved certificate', certId, receiptErr.message);
  }

  // ── Step 5c: Commission split — isolated, same reasoning as receipts ──────
  try {
    await recordCommission({ certificateId: certId, certificateType: certReq.type, certificatePrice: certReq.price, school });
  } catch (commissionErr) {
    console.error('Commission recording failed for approved certificate', certId, commissionErr.message);
  }

  // ── Step 6: Notify school admin (in-app + email) ───────────────────────────
  const [schoolAdminRows] = await pool.query(
    `SELECT u.id, u.name, u.email FROM users u JOIN schools sc ON sc.admin_user_id = u.id WHERE sc.id = ? LIMIT 1`,
    [certReq.school_id]
  );
  if (schoolAdminRows[0]) {
    await createNotification(
      schoolAdminRows[0].id,
      `✅ Certificate Approved — ${TYPE_LABELS[certReq.type]} for ${student.full_name} | Serial: ${serial} | ₹${certReq.price} deducted from wallet`
    );
    try {
      const approvalEmailResult = await sendCertificateGeneratedEmail(
        schoolAdminRows[0].email, schoolAdminRows[0].name,
        { studentName: student.full_name, type: TYPE_LABELS[certReq.type], serial, schoolId: certReq.school_id, certificateId: certId }
      );
      if (!approvalEmailResult?.success) {
        console.error('Certificate-approved email not sent:', approvalEmailResult?.error || 'unknown error', '| recipient:', schoolAdminRows[0].email);
      }
    } catch (approvalEmailErr) {
      console.error('Certificate-approved email threw:', approvalEmailErr.message, '| recipient:', schoolAdminRows[0].email);
    }
  }

  await logAudit({
    userId: req.user.id, action: 'CERTIFICATE_APPROVED', entityType: 'certificate_request',
    entityId: certReq.id, ipAddress: req.ip, details: { serial, certId, schoolId: certReq.school_id }
  });

  res.json({ message: 'Approved', serial, certificateId: certId, newWalletBalance: debitResult.newBalance });
}

// POST /api/certificates/requests/admin/:id/reject (superAdmin)
async function adminRejectRequest(req, res) {
  try {
    const { reason } = req.body;
    const [reqRows] = await pool.query('SELECT * FROM certificate_requests WHERE id = ?', [req.params.id]);
    if (!reqRows.length) return res.status(404).json({ error: 'Request not found' });
    const certReq = reqRows[0];
    if (certReq.status !== 'pending') return res.status(400).json({ error: 'Request is not in pending state' });

    const [studentRows] = await pool.query('SELECT full_name FROM students WHERE id = ?', [certReq.student_id]);
    const studentName = studentRows[0]?.full_name || 'Student';
    const TYPE_LABELS = { lc: 'Leaving Certificate', bonafide: 'Bonafide', idcard: 'ID Card', relation: 'Relation Certificate' };

    await pool.query(
      `UPDATE certificate_requests SET status='rejected', rejection_reason=?, approved_by=?, resolved_at=NOW() WHERE id=?`,
      [reason || 'Rejected by Super Admin', req.user.id, certReq.id]
    );

    // Notify school admin
    const [schoolAdminRows] = await pool.query(
      `SELECT u.id FROM users u JOIN schools sc ON sc.admin_user_id = u.id WHERE sc.id = ? LIMIT 1`,
      [certReq.school_id]
    );
    if (schoolAdminRows[0]) {
      await createNotification(
        schoolAdminRows[0].id,
        `❌ Certificate Request Rejected — ${TYPE_LABELS[certReq.type]} for ${studentName}. Reason: ${reason || 'Not specified'}`
      );
    }

    await logAudit({
      userId: req.user.id, action: 'CERTIFICATE_REJECTED', entityType: 'certificate_request',
      entityId: certReq.id, ipAddress: req.ip, details: { reason, schoolId: certReq.school_id }
    });

    res.json({ message: 'Rejected' });
  } catch (err) {
    console.error('adminRejectRequest error:', err.message);
    res.status(500).json({ error: 'Server error rejecting certificate request' });
  }
}

module.exports = {
  generateCertificate, listCertificates, downloadCertificate, downloadReceipt, previewCertificate, getPrice,
  getAllPricing, updateAllPricing, getMyEarnings,
  listCertificatesForSchool, downloadCertificateAsAdmin, verifyCertificate, exportCertificates,
  requestCertificate, listMyRequests, adminListRequests, adminApproveRequest, adminRejectRequest,
  publicDownloadCertificate
};
