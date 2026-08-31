const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');
const { creditWallet } = require('./walletController');
const { createNotification } = require('./notificationController');
const { logAudit } = require('../utils/audit');
const { sendWalletSubmittedEmail, sendWalletApprovedEmail, sendWalletRejectedEmail, sendQrChangedEmail } = require('../utils/email');

const MIN_RECHARGE = 50;
const MAX_RECHARGE = 500000;

// GET /api/bank-details (any authenticated school) - the account/UPI/QR
// the school transfers money to before submitting a wallet request.
async function getBankDetails(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM bank_details ORDER BY updated_at DESC LIMIT 1');
    if (rows.length === 0) return res.status(404).json({ error: 'Bank details have not been configured yet. Contact the platform administrator.' });
    res.json({ bankDetails: rows[0] });
  } catch (err) {
    console.error('getBankDetails error:', err.message);
    res.status(500).json({ error: 'Server error fetching bank details' });
  }
}

// PUT /api/bank-details (superAdmin) - Part 8: updating bank details/QR
// triggers an email alert and writes a before/after audit log entry.
async function updateBankDetails(req, res) {
  try {
    const { account_holder, bank_name, account_number, ifsc, branch, upi_id } = req.body;
    console.log(req.body);

    if (!account_holder || !bank_name || !account_number || !ifsc) {
      return res.status(400).json({
        error: 'Account holder, bank name, account number, and IFSC are required'
      });
    }

    const [existingRows] = await pool.query(
      'SELECT * FROM bank_details ORDER BY updated_at DESC LIMIT 1'
    );
    const previous = existingRows[0] || null;
    console.log(req.files);
    console.log(req.file);

    const qrPath = req.file ? req.file.filename : (previous ? previous.qr_code_path : null);

    let id;

    if (previous) {
      id = previous.id;

      await pool.query(
        `UPDATE bank_details
         SET account_holder = ?,
             bank_name = ?,
             account_number = ?,
             ifsc = ?,
             branch = ?,
             upi_id = ?,
             qr_code_path = ?,
             updated_by = ?
         WHERE id = ?`,
        [
          account_holder,
          bank_name,
          account_number,
          ifsc,
          branch || null,
          upi_id || null,
          qrPath,
          req.user.id,
          id
        ]
      );
    } else {
      id = uuidv4();

      await pool.query(
        `INSERT INTO bank_details
        (id, account_holder, bank_name, account_number, ifsc, branch, upi_id, qr_code_path, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          account_holder,
          bank_name,
          account_number,
          ifsc,
          branch || null,
          upi_id || null,
          qrPath,
          req.user.id
        ]
      );
    }

    // Audit trail
    await logAudit({
      userId: req.user.id,
      action: 'BANK_DETAILS_UPDATED',
      entityType: 'bank_details',
      entityId: id,
      ipAddress: req.ip,
      details: {
        oldQr: previous?.qr_code_path || null,
        newQr: qrPath,
        changedBy: req.user.id,
        changedByName: req.user.name,
        timestamp: new Date().toISOString()
      }
    });

    // Email alert whenever the QR changes
    if (req.file) {
      const [superAdmins] = await pool.query(
        "SELECT email, name FROM users WHERE role = 'superAdmin' AND deleted_at IS NULL AND is_active = 1"
      );

      for (const admin of superAdmins) {
        sendQrChangedEmail(
          admin.email,
          admin.name,
          req.user.name
        ).catch(e =>
          console.error('QR change email failed:', e.message)
        );
      }
    }

    const [rows] = await pool.query(
      'SELECT * FROM bank_details WHERE id = ?',
      [id]
    );

    res.json({ bankDetails: rows[0] });

  } catch (err) {
    console.error('updateBankDetails error:', err.message);
    res.status(500).json({
      error: 'Server error updating bank details'
    });
  }
}

// POST /api/wallet/recharge-requests (schoolAdmin) - submit proof of a
// manual transfer. Always lands as 'pending' - never touches the wallet
// balance directly; only Super Admin approval does that.
async function submitRechargeRequest(req, res) {
  try {
    const amt = Number(req.body.amount);
    const { utrNumber, paymentDate, remarks } = req.body;

    if (!amt || amt < MIN_RECHARGE || amt > MAX_RECHARGE) {
      return res.status(400).json({ error: `Amount must be between ₹${MIN_RECHARGE} and ₹${MAX_RECHARGE}` });
    }
    if (!utrNumber || !utrNumber.trim()) return res.status(400).json({ error: 'UTR / Transaction Reference Number is required' });
    if (!paymentDate) return res.status(400).json({ error: 'Payment date is required' });

    const id = uuidv4();
    const screenshotPath = req.file ? req.file.path : null;

    await pool.query(
      `INSERT INTO wallet_requests (id, school_id, amount, utr_number, payment_date, screenshot_path, remarks, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [id, req.schoolId, amt, utrNumber.trim(), paymentDate, screenshotPath, remarks || null]
    );

    const [schoolRows] = await pool.query('SELECT name FROM schools WHERE id = ?', [req.schoolId]);
    const schoolName = schoolRows[0]?.name || 'Unknown School';

    // Notify every Super Admin - dashboard bell + email, per Part 10.
    const [superAdmins] = await pool.query("SELECT id, email, name FROM users WHERE role = 'superAdmin' AND deleted_at IS NULL AND is_active = 1");
    for (const admin of superAdmins) {
      await createNotification(admin.id, `${schoolName} submitted a wallet recharge request: ₹${amt} (UTR: ${utrNumber.trim()}).`);
      sendWalletSubmittedEmail(admin.email, admin.name, { schoolName, amount: amt, utr: utrNumber.trim(), date: paymentDate })
        .catch(e => console.error('Wallet-submitted email failed:', e.message));
    }

    await logAudit({ userId: req.user.id, action: 'WALLET_REQUEST_SUBMITTED', entityType: 'wallet_request', entityId: id, ipAddress: req.ip, details: { amount: amt, utrNumber: utrNumber.trim() } });

    const [rows] = await pool.query('SELECT * FROM wallet_requests WHERE id = ?', [id]);
    res.status(201).json({ request: rows[0], message: 'Recharge request submitted. Awaiting Super Admin verification.' });
  } catch (err) {
    console.error('submitRechargeRequest error:', err.message);
    res.status(500).json({ error: 'Server error submitting recharge request' });
  }
}

// GET /api/wallet/recharge-requests/mine (schoolAdmin) - own request history
async function getMyRechargeRequests(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM wallet_requests WHERE school_id = ? ORDER BY created_at DESC',
      [req.schoolId]
    );
    res.json({ requests: rows });
  } catch (err) {
    console.error('getMyRechargeRequests error:', err.message);
    res.status(500).json({ error: 'Server error fetching recharge requests' });
  }
}

// GET /api/wallet/recharge-requests?status=pending (superAdmin) - the
// "Pending Wallet Requests" dashboard table from Part 7, with the exact
// columns specified: School, Amount, UTR, Screenshot, Date, Status.
async function listRechargeRequests(req, res) {
  try {
    const { status } = req.query;
    let query = `
      SELECT wr.*, s.name as school_name, s.city as school_city
      FROM wallet_requests wr JOIN schools s ON s.id = wr.school_id`;
    const params = [];
    if (status) { query += ' WHERE wr.status = ?'; params.push(status); }
    query += ' ORDER BY wr.created_at DESC';

    const [rows] = await pool.query(query, params);
    res.json({ requests: rows });
  } catch (err) {
    console.error('listRechargeRequests error:', err.message);
    res.status(500).json({ error: 'Server error fetching recharge requests' });
  }
}

// PUT /api/wallet/recharge-requests/:id/approve (superAdmin)
// Approve -> Wallet Updated -> Transaction Created -> Notification Sent,
// exactly the Part 7 flow, all inside one atomic operation via creditWallet.
async function approveRechargeRequest(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM wallet_requests WHERE id = ?', [req.params.id]);
    const request = rows[0];
    if (!request) return res.status(404).json({ error: 'Recharge request not found' });
    if (request.status !== 'pending') return res.status(409).json({ error: `This request was already ${request.status}` });

    const { newBalance, transactionId } = await creditWallet(
      request.school_id, request.amount, 'manual_recharge', request.id,
      `Wallet recharge approved (UTR: ${request.utr_number})`
    );

    await pool.query(
      `UPDATE wallet_requests SET status = 'approved', reviewed_by = ?, reviewed_at = NOW(), wallet_transaction_id = ? WHERE id = ?`,
      [req.user.id, transactionId, request.id]
    );

    const [userRows] = await pool.query(
      `SELECT u.id, u.name, u.email, s.name as school_name FROM users u JOIN schools s ON s.admin_user_id = u.id WHERE s.id = ?`,
      [request.school_id]
    );
    if (userRows[0]) {
      await createNotification(userRows[0].id, `Your wallet recharge of ₹${request.amount} has been approved. New balance: ₹${newBalance}.`);
      sendWalletApprovedEmail(userRows[0].email, userRows[0].name, { amount: request.amount, newBalance })
        .catch(e => console.error('Wallet-approved email failed:', e.message));
    }

    await logAudit({ userId: req.user.id, action: 'WALLET_REQUEST_APPROVED', entityType: 'wallet_request', entityId: request.id, ipAddress: req.ip, details: { amount: request.amount, newBalance } });

    res.json({ message: 'Recharge request approved and wallet credited', newBalance });
  } catch (err) {
    console.error('approveRechargeRequest error:', err.message);
    res.status(500).json({ error: 'Server error approving recharge request' });
  }
}

// PUT /api/wallet/recharge-requests/:id/reject (superAdmin)
// Reject -> Reason -> Notification Sent. No wallet change at all.
async function rejectRechargeRequest(req, res) {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) return res.status(400).json({ error: 'A rejection reason is required' });

    const [rows] = await pool.query('SELECT * FROM wallet_requests WHERE id = ?', [req.params.id]);
    const request = rows[0];
    if (!request) return res.status(404).json({ error: 'Recharge request not found' });
    if (request.status !== 'pending') return res.status(409).json({ error: `This request was already ${request.status}` });

    await pool.query(
      `UPDATE wallet_requests SET status = 'rejected', rejection_reason = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`,
      [reason.trim(), req.user.id, request.id]
    );

    const [userRows] = await pool.query(
      `SELECT u.id, u.name, u.email FROM users u JOIN schools s ON s.admin_user_id = u.id WHERE s.id = ?`,
      [request.school_id]
    );
    if (userRows[0]) {
      await createNotification(userRows[0].id, `Your wallet recharge request of ₹${request.amount} was rejected. Reason: ${reason.trim()}`);
      sendWalletRejectedEmail(userRows[0].email, userRows[0].name, { amount: request.amount, reason: reason.trim() })
        .catch(e => console.error('Wallet-rejected email failed:', e.message));
    }

    await logAudit({ userId: req.user.id, action: 'WALLET_REQUEST_REJECTED', entityType: 'wallet_request', entityId: request.id, ipAddress: req.ip, details: { amount: request.amount, reason: reason.trim() } });

    res.json({ message: 'Recharge request rejected' });
  } catch (err) {
    console.error('rejectRechargeRequest error:', err.message);
    res.status(500).json({ error: 'Server error rejecting recharge request' });
  }
}

module.exports = {
  getBankDetails, updateBankDetails,
  submitRechargeRequest, getMyRechargeRequests, listRechargeRequests,
  approveRechargeRequest, rejectRechargeRequest
};
