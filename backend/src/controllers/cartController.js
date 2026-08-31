const { v4: uuid } = require('uuid');
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/db');
const { generateOtp, hashOtp, verifyOtpHash } = require('../utils/otp');
const { genSerial } = require('../utils/certificatePdf');
const { renderCertificatePdf } = require('../utils/certificateRenderDispatch');
const { generateReceiptPdf } = require('../utils/receiptPdf');
const { recordCommission } = require('../utils/commission');
const { sendCartOtpEmail, sendCartInsufficientBalanceEmail, sendCertificateGeneratedEmail, sendLowBalanceEmail } = require('../utils/email');
const { logAudit } = require('../utils/audit');
const { UPLOAD_ROOT } = require('../middleware/upload');
const { restoreIfMissing } = require('../utils/fileStore');
const { isValidType, getPriceForType } = require('../utils/pricing');

const OTP_EXPIRY_MIN = parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10);
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10);
const RESEND_COOLDOWN = parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '60', 10);

async function getSchool(req) {
  const [rows] = await pool.query('SELECT * FROM schools WHERE admin_user_id=? AND deleted_at IS NULL', [req.user.id]);
  if (!rows.length) throw new Error('School not found');
  return rows[0];
}

async function priceFor(type) {
  const price = await getPriceForType(type);
  return { price, gst: 0 };
}

function resolveUpload(urlOrPath) {
  if (!urlOrPath) return null;
  const s = String(urlOrPath);
  // Already an absolute path saved by multer/toJpegPath — return as-is
  if (s.startsWith(UPLOAD_ROOT) || s.startsWith('/')) return s;
  return path.join(UPLOAD_ROOT, s.replace(/^\/uploads\//, ''));
}

exports.getPrices = async (req, res) => {
  const [lc, bonafide, idcard] = await Promise.all([
    getPriceForType('lc'), getPriceForType('bonafide'), getPriceForType('idcard'),
  ]);
  res.json({ prices: { lc, bonafide, idcard }, gstRate: 0 });
};

// Frontend sends LC details as a JSON string in `purpose`
// ({lcType, dateOfLeaving, reasonForLeaving, remarks}). Parse safely.
function parseLcPurpose(purpose) {
  try {
    const p = JSON.parse(purpose || '{}');
    return {
      lcType:           p.lcType || 'Original',
      dateOfLeaving:    p.dateOfLeaving || null,
      reasonForLeaving: p.reasonForLeaving || null,
      remarks:          p.remarks || null,
    };
  } catch (e) {
    return { lcType: 'Original', dateOfLeaving: null, reasonForLeaving: null, remarks: null };
  }
}

// Generates a certificate PDF on the fly for preview purposes only.
// No DB writes, no wallet debit, no serial number consumed.
exports.previewCertificate = async (req, res) => {
  try {
    const school = await getSchool(req);
    const { studentId, type, purpose } = req.body;
    if (!studentId || !type || !isValidType(type)) return res.status(400).json({ message: 'Invalid student or certificate type' });

    const [studentRows] = await pool.query('SELECT * FROM students WHERE id=? AND school_id=?', [studentId, school.id]);
    if (!studentRows.length) return res.status(404).json({ message: 'Student not found' });
    const student = studentRows[0];

    const previewId = `preview-${uuid()}`;
    const certDir = path.join(UPLOAD_ROOT, 'certificates');
    if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });
    const outputPath = path.join(certDir, `${previewId}.pdf`);
    const photoPath     = resolveUpload(student.photo_url);
    const logoPath      = resolveUpload(school.logo_url);
    const signaturePath = resolveUpload(school.signature_url);
    const stampPath     = resolveUpload(school.stamp_url);

    // Restore branding files from DB in case the ephemeral container lost them
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

    const prefix = type === 'lc' ? 'LC' : type === 'bonafide' ? 'BON' : 'IDC';
    const certificate = { id: previewId, serial_number: 'PREVIEW-' + genSerial(prefix) };

    if (type === 'lc') {
      const [existingOriginal] = await pool.query(
        "SELECT id FROM certificates WHERE school_id=? AND student_id=? AND type='lc' AND certificate_variant='original' AND deleted_at IS NULL LIMIT 1",
        [school.id, studentId]
      );
      await renderCertificatePdf({
        type: 'lc', school, student, certificate, outputPath, photoPath, logoPath, signaturePath, stampPath,
        ...parseLcPurpose(purpose),
        lcType: existingOriginal.length ? 'duplicate' : 'original',
      });
    } else if (type === 'bonafide') {
      await renderCertificatePdf({ type: 'bonafide', school, student, certificate, outputPath, photoPath, logoPath, purpose, signaturePath, stampPath });
    } else {
      await renderCertificatePdf({ type: 'idcard', school, student, certificate, outputPath, photoPath, logoPath, signaturePath, stampPath });
    }

    const pdfBuffer = fs.readFileSync(outputPath);
    fs.unlink(outputPath, () => {});
    res.json({ pdfBase64: pdfBuffer.toString('base64') });
  } catch (e) {
    console.error('cart.previewCertificate error:', e.message);
    res.status(500).json({ message: e.message || 'Failed to generate preview' });
  }
};

exports.listCart = async (req, res) => {
  try {
    const school = await getSchool(req);
    const [items] = await pool.query(
      `SELECT ci.*, s.full_name AS student_name,
              COALESCE(s.current_standard, s.admission_standard) as admission_standard,
              COALESCE(s.current_division, s.admission_division) as admission_division
       FROM cart_items ci JOIN students s ON s.id = ci.student_id
       WHERE ci.school_id=? AND ci.status='in_cart' ORDER BY ci.created_at DESC`, [school.id]);
    const [wallets] = await pool.query('SELECT balance FROM wallets WHERE school_id=?', [school.id]);
    const total = items.reduce((sum, i) => sum + parseFloat(i.price) + parseFloat(i.gst_amount), 0);
    res.json({ items, total: Math.round(total * 100) / 100, walletBalance: wallets[0]?.balance || 0 });
  } catch (e) {
    res.status(500).json({ message: e.message || 'Failed to list cart' });
  }
};

exports.addToCart = async (req, res) => {
  try {
    const school = await getSchool(req);
    const { studentId, type, purpose } = req.body;
    if (!studentId || !type || !isValidType(type)) return res.status(400).json({ message: 'Invalid student or certificate type' });

    const [existing] = await pool.query(
      "SELECT id FROM cart_items WHERE school_id=? AND student_id=? AND type=? AND status='in_cart'",
      [school.id, studentId, type]
    );
    if (existing.length) return res.status(400).json({ message: 'This certificate type is already in the cart for this student' });

    const { price, gst } = await priceFor(type);
    const id = uuid();
    const lc = type === 'lc' ? parseLcPurpose(purpose) : null;

    // LC Original/Duplicate is a backend-enforced business rule, never trusted
    // from the frontend: the first successfully-issued LC for a student is
    // Original, every one after that is Duplicate. A cart item that never
    // reaches 'certificates' (removed, failed generation, cancelled) cannot
    // consume the Original slot, because this only looks at issued rows.
    // Bonafide/ID Card keep their existing (unrestricted) behaviour.
    let variant = 'original';
    if (type === 'lc') {
      const [existingOriginal] = await pool.query(
        "SELECT id FROM certificates WHERE school_id=? AND student_id=? AND type='lc' AND certificate_variant='original' AND deleted_at IS NULL LIMIT 1",
        [school.id, studentId]
      );
      variant = existingOriginal.length ? 'duplicate' : 'original';
    }

    await pool.query(
      `INSERT INTO cart_items
       (id, school_id, student_id, type, purpose, certificate_variant, leaving_date, since_when,
        leaving_reason, leaving_remark, check_by_label, price, gst_amount, status, added_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'in_cart',?)`,
      [id, school.id, studentId, type, purpose || null, variant,
       lc?.dateOfLeaving || null, null, lc?.reasonForLeaving || null, lc?.remarks || null,
       'Check By', price, gst, req.user.id]
    );
    await logAudit({ userId: req.user.id, action: 'CART_ITEM_ADDED', entityType: 'cart_item', entityId: id, ip: req.ip, details: { type, studentId } });
    res.json({ message: 'Added to cart', cartItemId: id });
  } catch (e) {
    console.error('addToCart error:', e.message);
    res.status(500).json({ message: e.message || 'Failed to add to cart' });
  }
};

exports.removeFromCart = async (req, res) => {
  try {
    const school = await getSchool(req);
    await pool.query("DELETE FROM cart_items WHERE id=? AND school_id=? AND status='in_cart'", [req.params.id, school.id]);
    await logAudit({ userId: req.user.id, action: 'CART_ITEM_REMOVED', entityType: 'cart_item', entityId: req.params.id, ip: req.ip });
    res.json({ message: 'Removed from cart' });
  } catch (e) {
    res.status(500).json({ message: e.message || 'Failed to remove item' });
  }
};

exports.submitCart = async (req, res) => {
  try {
    const school = await getSchool(req);
    const [items] = await pool.query("SELECT * FROM cart_items WHERE school_id=? AND status='in_cart'", [school.id]);
    if (!items.length) return res.status(400).json({ message: 'Cart is empty' });

    const total = items.reduce((sum, i) => sum + parseFloat(i.price) + parseFloat(i.gst_amount), 0);
    const roundedTotal = Math.round(total * 100) / 100;
    const [wallets] = await pool.query('SELECT * FROM wallets WHERE school_id=?', [school.id]);
    const wallet = wallets[0];

    if (parseFloat(wallet.balance) < roundedTotal) {
      const shortfall = Math.round((roundedTotal - parseFloat(wallet.balance)) * 100) / 100;
      try {
        const result = await sendCartInsufficientBalanceEmail(req.user.email, school.name, { cartTotal: roundedTotal, walletBalance: wallet.balance, shortfall, schoolId: school.id });
        if (!result?.success) console.error('Insufficient-balance email not sent:', result?.error || 'unknown error', '| recipient:', req.user.email);
      } catch (balErr) {
        console.error('Insufficient-balance email threw:', balErr.message, '| recipient:', req.user.email);
      }
      return res.json({ insufficientBalance: true, shortfall, walletBalance: wallet.balance, cartTotal: roundedTotal });
    }

    const otp = generateOtp();
    const otpHash = await hashOtp(otp);
    const snapshot = { itemIds: items.map(i => i.id), total: roundedTotal };
    const otpId = uuid();
    await pool.query(
      "INSERT INTO otp_verifications (id, user_id, purpose, otp_hash, cart_snapshot, expires_at) VALUES (?,?,'cart_submission',?,?,?)",
      [otpId, req.user.id, otpHash, JSON.stringify(snapshot), new Date(Date.now() + OTP_EXPIRY_MIN * 60 * 1000)]
    );
    try {
      await sendCartOtpEmail(school.email, school.name, otp, {
        itemCount: items.length,
        cartTotal: roundedTotal,
      });
    } catch (emailError) {
      // Do not leave an OTP in the database that the user never received.
      await pool.query('DELETE FROM otp_verifications WHERE id=?', [otpId]);
      console.error('submitCart OTP delivery failed:', emailError.message);
      return res.status(503).json({
        message: 'OTP could not be sent to the school email. Please configure email delivery and try again.',
        code: 'OTP_DELIVERY_UNAVAILABLE',
      });
    }

    res.json({ otpRequired: true, cartTotal: roundedTotal, itemCount: items.length, otpId, expiresInMinutes: OTP_EXPIRY_MIN, schoolEmail: school.email });
  } catch (e) {
    console.error('submitCart error:', e.message);
    res.status(500).json({ message: e.message || 'Failed to submit cart' });
  }
};

exports.resendOtp = async (req, res) => {
  try {
    const school = await getSchool(req);
    const [rows] = await pool.query(
      "SELECT * FROM otp_verifications WHERE user_id=? AND purpose='cart_submission' AND used=0 ORDER BY created_at DESC LIMIT 1",
      [req.user.id]
    );
    if (!rows.length) return res.status(400).json({ message: 'No pending OTP found. Please submit your cart again.' });
    const existing = rows[0];
    const secondsSince = (Date.now() - new Date(existing.created_at).getTime()) / 1000;
    if (secondsSince < RESEND_COOLDOWN) {
      return res.status(429).json({ message: `Please wait ${Math.ceil(RESEND_COOLDOWN - secondsSince)}s before resending.` });
    }
    // otp_verifications.cart_snapshot is a native MySQL JSON column, so
    // mysql2 already deserializes it into an object — only parse if it
    // somehow comes back as a raw string.
    const snapshot = typeof existing.cart_snapshot === 'string' ? JSON.parse(existing.cart_snapshot) : existing.cart_snapshot;
    const otp = generateOtp();
    const otpHash = await hashOtp(otp);
    if (!snapshot.itemIds.length) return res.status(400).json({ error: 'No items in this checkout' });
    const [items] = await pool.query(
      `SELECT * FROM cart_items WHERE id IN (${snapshot.itemIds.map(() => '?').join(',')})`,
      snapshot.itemIds
    );
    try {
      await sendCartOtpEmail(school.email, school.name, otp, {
        itemCount: items.length,
        cartTotal: snapshot.total,
      });
    } catch (emailError) {
      console.error('resendOtp delivery failed:', emailError.message);
      return res.status(503).json({
        message: 'OTP could not be sent to the school email. Please try again after email delivery is configured.',
        code: 'OTP_DELIVERY_UNAVAILABLE',
      });
    }
    await pool.query(
      'UPDATE otp_verifications SET otp_hash=?, attempts=0, created_at=NOW(), expires_at=? WHERE id=?',
      [otpHash, new Date(Date.now() + OTP_EXPIRY_MIN * 60 * 1000), existing.id]
    );
    res.json({ message: 'OTP resent', expiresInMinutes: OTP_EXPIRY_MIN });
  } catch (e) {
    console.error('resendOtp error:', e.message);
    res.status(500).json({ message: 'Failed to resend OTP' });
  }
};

exports.verifyOtp = async (req, res) => {
  const conn = await pool.getConnection();
  let released = false;
  const releaseOnce = () => { if (!released) { released = true; conn.release(); } };
  try {
    const school = await getSchool(req);
    const { otp } = req.body;
    const [rows] = await pool.query(
      "SELECT * FROM otp_verifications WHERE user_id=? AND purpose='cart_submission' AND used=0 ORDER BY created_at DESC LIMIT 1",
      [req.user.id]
    );
    if (!rows.length) { releaseOnce(); return res.status(400).json({ message: 'No pending OTP. Please submit your cart again.' }); }
    const record = rows[0];

    if (new Date(record.expires_at) < new Date()) {
      releaseOnce();
      return res.status(400).json({ message: 'OTP expired. Please resend or resubmit your cart.', expired: true });
    }
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      releaseOnce();
      return res.status(400).json({ message: 'Too many wrong attempts. Please submit your cart again for a fresh code.', invalidated: true });
    }

    const match = await verifyOtpHash(otp, record.otp_hash);
    if (!match) {
      await pool.query('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id=?', [record.id]);
      releaseOnce();
      return res.status(400).json({ message: `Incorrect OTP. ${OTP_MAX_ATTEMPTS - record.attempts - 1} attempt(s) remaining.` });
    }

    const snapshot = typeof record.cart_snapshot === 'string' ? JSON.parse(record.cart_snapshot) : record.cart_snapshot;

    await conn.beginTransaction();
    const [walletRows] = await conn.query('SELECT * FROM wallets WHERE school_id=? FOR UPDATE', [school.id]);
    const wallet = walletRows[0];
    if (parseFloat(wallet.balance) < parseFloat(snapshot.total)) {
      await conn.rollback();
      releaseOnce();
      return res.status(400).json({ message: 'Wallet balance changed since submission and is now insufficient. Please try again.' });
    }

    const newBalance = Math.round((parseFloat(wallet.balance) - parseFloat(snapshot.total)) * 100) / 100;
    const txId = uuid();
    await conn.query('UPDATE wallets SET balance=? WHERE id=?', [newBalance, wallet.id]);
    await conn.query(
      "INSERT INTO wallet_transactions (id, wallet_id, type, amount, balance_after, reason, description) VALUES (?,?,'debit',?,?,'cart_submission',?)",
      [txId, wallet.id, snapshot.total, newBalance, `Cart submission (${snapshot.itemIds.length} items)`]
    );

    const [items] = await conn.query(
      `SELECT * FROM cart_items WHERE id IN (${snapshot.itemIds.map(() => '?').join(',')}) AND status='in_cart'`,
      snapshot.itemIds
    );
    await conn.commit();
    releaseOnce();

    await pool.query('UPDATE otp_verifications SET used=1 WHERE id=?', [record.id]);

    const [generatedByRows] = await pool.query('SELECT name, email FROM users WHERE id=?', [req.user.id]);
    const generatedByName = generatedByRows[0]?.name || 'School Admin';
    // Always the School Admin's live login email — never the separate
    // (and sometimes stale/blank) schools.email column — so certificate
    // and low-balance emails reach whoever can actually log in as this school.
    const schoolAdminEmail = generatedByRows[0]?.email || school.email;

    const results = [];
    for (const item of items) {
      try {
        const [studentRows] = await pool.query('SELECT * FROM students WHERE id=?', [item.student_id]);
        const student = studentRows[0];
        const certId = uuid();
        const prefix = item.type === 'lc' ? 'LC' : item.type === 'bonafide' ? 'BON' : 'IDC';
        const serial = genSerial(prefix);
        const subdir = item.type === 'idcard' ? 'idcards' : 'certificates';
        const certDir = path.join(UPLOAD_ROOT, subdir);
        if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });
        const outputPath = path.join(certDir, `${serial}.pdf`);
        const photoPath     = resolveUpload(student.photo_url);
        const logoPath      = resolveUpload(school.logo_url);
        const signaturePath = resolveUpload(school.signature_url);
        const stampPath     = resolveUpload(school.stamp_url);
        const certificate = { id: certId, serial_number: serial };

        if (item.type === 'lc') {
          const lc = parseLcPurpose(item.purpose);
          await renderCertificatePdf({
            type: 'lc', school, student, certificate, outputPath, photoPath, logoPath, signaturePath, stampPath,
            lcType:           item.certificate_variant || 'original',
            dateOfLeaving:    item.leaving_date || lc.dateOfLeaving,
            reasonForLeaving: item.leaving_reason || lc.reasonForLeaving,
            remarks:          item.leaving_remark || lc.remarks,
          });
        } else if (item.type === 'bonafide') {
          await renderCertificatePdf({ type: 'bonafide', school, student, certificate, outputPath, photoPath, logoPath, purpose: item.purpose, signaturePath, stampPath });
        } else {
          await renderCertificatePdf({ type: 'idcard', school, student, certificate, outputPath, photoPath, logoPath, signaturePath, stampPath });
        }

        await pool.query(
           `INSERT INTO certificates
            (id, school_id, student_id, cart_item_id, type, serial_number, price, gst_amount,
             wallet_transaction_id, pdf_path, purpose, certificate_variant, leaving_date, since_when,
             leaving_reason, leaving_remark, check_by_label, expires_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [certId, school.id, student.id, item.id, item.type, serial, item.price, item.gst_amount,
           txId, `/${subdir}/${serial}.pdf`, item.purpose || null, item.certificate_variant || 'original',
           item.leaving_date || null, item.since_when || null, item.leaving_reason || null,
           item.leaving_remark || null, item.check_by_label || 'Check By',
           new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)]
        );
        await pool.query("UPDATE cart_items SET status='generated', certificate_id=? WHERE id=?", [certId, item.id]);

        // Receipt is always 2x the certificate's actual (DB-sourced) price —
        // never hardcoded. A receipt failure must not undo an already
        // successfully issued certificate, so it's isolated in its own
        // try/catch; downloadReceipt regenerates on demand if the row exists
        // but the PDF doesn't.
        let receiptId = null;
        try {
          receiptId = uuid();
          const receiptNumber = genSerial('REC');
          const receiptAmount = Math.round(parseFloat(item.price) * 2 * 100) / 100;
          const receiptDir = path.join(UPLOAD_ROOT, 'receipts');
          if (!fs.existsSync(receiptDir)) fs.mkdirSync(receiptDir, { recursive: true });
          const receiptPath = path.join(receiptDir, `${receiptNumber}.pdf`);
          const receiptRow = {
            receipt_number: receiptNumber,
            base_price: item.price,
            receipt_amount: receiptAmount,
            certificate_variant: item.certificate_variant || 'original',
            created_at: new Date(),
          };
          await generateReceiptPdf({
            school, student,
            certificate: { ...certificate, type: item.type, wallet_transaction_id: txId },
            receipt: receiptRow,
            generatedByName,
            outputPath: receiptPath,
          });
          await pool.query(
            `INSERT INTO receipts
             (id, certificate_id, school_id, student_id, receipt_number, certificate_type,
              certificate_variant, base_price, receipt_amount, pdf_path, generated_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [receiptId, certId, school.id, student.id, receiptNumber, item.type,
             item.certificate_variant || 'original', item.price, receiptAmount, receiptPath, req.user.id]
          );
        } catch (receiptErr) {
          console.error('Receipt generation failed for certificate', certId, receiptErr.message);
          receiptId = null;
        }

        // Commission split (School / Super Admin / Super Distributor /
        // Distributor) — computed and snapshotted from today's config.
        // Isolated in its own try/catch for the same reason as the receipt:
        // must never undo an already-successful certificate issuance.
        try {
          await recordCommission({ certificateId: certId, certificateType: item.type, certificatePrice: item.price, school });
        } catch (commissionErr) {
          console.error('Commission recording failed for certificate', certId, commissionErr.message);
        }

        results.push({ cartItemId: item.id, studentName: student.full_name, type: item.type, status: 'generated', certificateId: certId, serial, receiptId });
      } catch (genErr) {
        console.error('Cart cert generation failed for item', item.id, genErr.message);
        await pool.query("UPDATE cart_items SET status='failed' WHERE id=?", [item.id]);
        const refundAmount = parseFloat(item.price) + parseFloat(item.gst_amount);
        const [wRows] = await pool.query('SELECT * FROM wallets WHERE school_id=?', [school.id]);
        const w = wRows[0];
        const refundedBalance = Math.round((parseFloat(w.balance) + refundAmount) * 100) / 100;
        await pool.query('UPDATE wallets SET balance=? WHERE id=?', [refundedBalance, w.id]);
        await pool.query(
          "INSERT INTO wallet_transactions (id, wallet_id, type, amount, balance_after, reason, description) VALUES (?,?,'credit',?,?,'certificate_generation_failed_refund',?)",
          [uuid(), w.id, refundAmount, refundedBalance, `Refund for failed ${item.type} generation`]
        );
        results.push({ cartItemId: item.id, type: item.type, status: 'failed', refunded: true });
      }
    }

    const [finalWallet] = await pool.query('SELECT balance FROM wallets WHERE school_id=?', [school.id]);
    if (parseFloat(finalWallet[0].balance) <= 100) {
      try { await sendLowBalanceEmail(schoolAdminEmail, school.name, school.name, finalWallet[0].balance); }
      catch (lowBalErr) { console.error('Low-balance email failed:', lowBalErr.message); }
    }
    try {
      const certEmailResult = await sendCertificateGeneratedEmail(schoolAdminEmail, school.name, {
        items: results.map(r => ({ type: r.type, studentName: r.studentName || '', serial: r.serial })),
        schoolId: school.id,
      });
      if (!certEmailResult?.success) {
        console.error('Certificate-generated email not sent:', certEmailResult?.error || 'unknown error', '| recipient:', schoolAdminEmail);
      }
    } catch (certEmailErr) {
      console.error('Certificate-generated email threw:', certEmailErr.message, '| recipient:', schoolAdminEmail);
    }

    res.json({ message: 'Cart processed', results, walletBalance: finalWallet[0].balance });
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    releaseOnce();
    console.error('verifyOtp error:', e.message);
    res.status(500).json({ message: e.message || 'Failed to verify OTP' });
  }
};
