const nodemailer = require('nodemailer');
const { pool } = require('../config/db');
require('dotenv').config();

const smtpPassword = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;
const emailTransportConfigured = Boolean(
  process.env.SMTP_HOST && process.env.SMTP_USER && smtpPassword
);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: smtpPassword
  }
});

// Verify SMTP transport on startup so misconfiguration is caught early
if (emailTransportConfigured && process.env.NODE_ENV !== 'test') {
  transporter.verify().then(() => {
    console.log('✅ SMTP transport ready');
  }).catch(err => {
    console.error('❌ SMTP transport verification failed:', err.message);
  });
} else {
  console.warn('⚠️ Email delivery is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD (or SMTP_PASS).');
}

// Single low-level send choke point — every named template function in this
// file funnels through here, so this is the one place email_logs is written.
async function logEmailAttempt({ to, sender, emailType, relatedUserId, relatedSchoolId, relatedCertificateId, status, error }) {
  try {
    await pool.query(
      `INSERT INTO email_logs (recipient, sender, email_type, related_user_id, related_school_id, related_certificate_id, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [to, sender || null, emailType || null, relatedUserId || null, relatedSchoolId || null, relatedCertificateId || null, status, error || null]
    );
  } catch (logErr) {
    // Logging must never take down the actual email send/response path.
    console.error('Failed to write email_logs row:', logErr.message);
  }
}

async function sendMail({ to, subject, html, emailType, relatedUserId, relatedSchoolId, relatedCertificateId }) {
  const fromName = process.env.EMAIL_FROM_NAME || 'One Click School Solutions';
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER;
  const type = emailType || subject;

  if (!emailTransportConfigured) {
    const error = 'Email delivery is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD (or SMTP_PASS).';
    await logEmailAttempt({ to, sender: fromAddress, emailType: type, relatedUserId, relatedSchoolId, relatedCertificateId, status: 'FAILED', error });
    return { success: false, error };
  }

  try {
    await transporter.sendMail({ from: `"${fromName}" <${fromAddress}>`, to, subject, html });
    await logEmailAttempt({ to, sender: fromAddress, emailType: type, relatedUserId, relatedSchoolId, relatedCertificateId, status: 'SENT' });
    return { success: true };
  } catch (err) {
    console.error('Email send failed:', err.message);
    await logEmailAttempt({ to, sender: fromAddress, emailType: type, relatedUserId, relatedSchoolId, relatedCertificateId, status: 'FAILED', error: err.message });
    return { success: false, error: err.message };
  }
}

function wrapTemplate(title, bodyHtml) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px">
    <h2 style="color:#1A6FD4;margin-bottom:16px">${title}</h2>
    ${bodyHtml}
    <p style="color:#94a3b8;font-size:12px;margin-top:32px;border-top:1px solid #e2e8f0;padding-top:16px">
      This is an automated email from One Click School Solutions. If you did not request this, you can safely ignore it.
    </p>
  </div>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getLoginUrl(loginUrl) {
  return loginUrl || process.env.FRONTEND_URL || 'http://localhost:3000';
}

function welcomeTemplate({ role, to, name, username, password, loginUrl, setupLink, relatedUserId }) {
  const roleLabels = {
    superDistributor: 'Super Distributor',
    distributor: 'Distributor',
    schoolAdmin: 'School Admin',
  };
  const label = roleLabels[role] || role;
  const safeName = escapeHtml(name);
  const safeUsername = escapeHtml(username);
  const safeLoginUrl = escapeHtml(getLoginUrl(loginUrl));
  const credentials = password
    ? `<p><strong>Password:</strong> ${escapeHtml(password)}</p>`
    : setupLink
      ? `<p style="text-align:center;margin:24px 0"><a href="${escapeHtml(setupLink)}" style="background:#1A6FD4;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">Set Your Password</a></p>
         <p>This secure link expires in 30 minutes.</p>`
      : `<p>Please use the password setup link sent separately to activate your account.</p>`;

  const html = wrapTemplate(`Welcome to One Click School Solutions – Your ${label} Account is Ready`, `
    <p>Dear ${safeName},</p>
    <p>Welcome to One Click School Solutions!</p>
    <p>We are pleased to inform you that your <strong>${label}</strong> account has been successfully created. You can now access the One Click School Solutions platform${role === 'schoolAdmin' ? ' to manage your school’s students, certificates, bonafide certificates, ID cards, and other available school activities' : ''}.</p>
    <h3 style="color:#0F3A7E;margin:20px 0 8px">Your Login Details</h3>
    <p><strong>Access:</strong> ${label}</p>
    <p><strong>Login URL:</strong> <a href="${safeLoginUrl}">${safeLoginUrl}</a></p>
    <p><strong>Username:</strong> ${safeUsername}</p>
    ${credentials}
    ${password ? '<p>For security purposes, please change your password after your first login and keep your login credentials confidential.</p>' : ''}
    <p>If you face any difficulty while accessing the platform, please contact the support team.</p>
    <p>We look forward to working with you.</p>
    <p>Regards,<br>One Click School Solutions Team</p>
  `);
  return sendMail({
    to,
    subject: `Welcome to One Click School Solutions – Your ${label} Account is Ready`,
    html,
    emailType: `welcome_${role}`,
    relatedUserId,
  });
}

async function sendWelcomeEmail({ role, to, name, username, password, loginUrl, setupLink, relatedUserId }) {
  return welcomeTemplate({ role, to, name, username, password, loginUrl, setupLink, relatedUserId });
}

async function sendPasswordSetupEmail(to, name, link, relatedUserId) {
  const html = wrapTemplate('Set up your One Click School Solutions password', `
    <p>Hi ${name},</p>
    <p>Your account has been created on One Click School Solutions. Click below to set your password and activate your account.</p>
    <p style="text-align:center;margin:24px 0"><a href="${link}" style="background:#1A6FD4;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">Set Password</a></p>
    <p>This link expires in 30 minutes.</p>
  `);
  return sendMail({ to, subject: 'Set up your One Click School Solutions password', html, emailType: 'password_setup', relatedUserId });
}

async function sendPasswordResetEmail(to, name, link, relatedUserId) {
  const html = wrapTemplate('Reset your One Click School Solutions password', `
    <p>Hi ${name},</p>
    <p>Click below to choose a new password.</p>
    <p style="text-align:center;margin:24px 0"><a href="${link}" style="background:#1A6FD4;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">Reset Password</a></p>
    <p>This link expires in 30 minutes. If you didn't request this, you can ignore this email.</p>
  `);
  return sendMail({ to, subject: 'Reset your One Click School Solutions password', html, emailType: 'password_reset', relatedUserId });
}

async function sendWalletTopupEmail(to, name, amount, newBalance) {
  const html = wrapTemplate('Wallet top-up successful', `
    <p>Hi ${name},</p>
    <p>Your wallet has been credited successfully.</p>
    <p style="font-size:18px;font-weight:700;color:#10B981">+₹${amount}</p>
    <p>New wallet balance: <strong>₹${newBalance}</strong></p>
  `);
  return sendMail({ to, subject: 'Wallet top-up successful - One Click School Solutions', html, emailType: 'wallet_topup' });
}

async function sendDistributorCreatedEmail(to, name, options = {}) {
  return sendWelcomeEmail({
    role: 'distributor',
    to,
    name,
    username: options.username || to,
    password: options.password,
    loginUrl: options.loginUrl,
    setupLink: options.setupLink,
    relatedUserId: options.relatedUserId,
  });
}

async function sendSuperDistributorCreatedEmail(to, name, options = {}) {
  return sendWelcomeEmail({
    role: 'superDistributor',
    to,
    name,
    username: options.username || to,
    password: options.password,
    loginUrl: options.loginUrl,
    setupLink: options.setupLink,
    relatedUserId: options.relatedUserId,
  });
}

async function sendSchoolWelcomeEmail(to, name, options = {}) {
  return sendWelcomeEmail({
    role: 'schoolAdmin',
    to,
    name,
    username: options.username || to,
    password: options.password,
    loginUrl: options.loginUrl,
    setupLink: options.setupLink,
    relatedUserId: options.relatedUserId,
  });
}

async function sendSchoolApprovedEmail(to, name, schoolName, loginId, relatedSchoolId) {
  const html = wrapTemplate('Your school has been approved', `
    <p>Hi ${name},</p>
    <p><strong>${schoolName}</strong> has been approved by the Super Admin. You can now log in using your Login ID: <strong>${loginId}</strong>.</p>
  `);
  return sendMail({ to, subject: 'School approved - One Click School Solutions', html, emailType: 'school_approved', relatedSchoolId });
}

async function sendWalletSubmittedEmail(to, name, { schoolName, amount, utr, date }) {
  const html = wrapTemplate('New wallet recharge request', `
    <p>Hi ${name},</p>
    <p><strong>${schoolName}</strong> submitted a wallet recharge request awaiting your verification.</p>
    <table style="width:100%;border-collapse:collapse;margin-top:12px">
      <tr><td style="padding:6px 0;color:#64748b">Amount</td><td style="padding:6px 0;font-weight:700">₹${amount}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b">UTR Number</td><td style="padding:6px 0">${utr}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b">Payment Date</td><td style="padding:6px 0">${date}</td></tr>
    </table>
    <p style="margin-top:16px">Please review and approve or reject this request from your dashboard.</p>
  `);
  return sendMail({ to, subject: `Wallet recharge request - ${schoolName}`, html, emailType: 'wallet_submitted' });
}

async function sendWalletApprovedEmail(to, name, { amount, newBalance }) {
  const html = wrapTemplate('Wallet recharge approved', `
    <p>Hi ${name},</p>
    <p>Your wallet recharge request has been approved.</p>
    <p style="font-size:18px;font-weight:700;color:#10B981">+₹${amount}</p>
    <p>New wallet balance: <strong>₹${newBalance}</strong></p>
  `);
  return sendMail({ to, subject: 'Wallet recharge approved - One Click School Solutions', html, emailType: 'wallet_approved' });
}

async function sendWalletRejectedEmail(to, name, { amount, reason }) {
  const html = wrapTemplate('Wallet recharge rejected', `
    <p>Hi ${name},</p>
    <p>Your wallet recharge request of <strong>₹${amount}</strong> was rejected.</p>
    <p style="color:#DC2626"><strong>Reason:</strong> ${reason}</p>
    <p>If you believe this is a mistake, please contact the platform administrator or submit a new request with correct details.</p>
  `);
  return sendMail({ to, subject: 'Wallet recharge rejected - One Click School Solutions', html, emailType: 'wallet_rejected' });
}

async function sendQrChangedEmail(to, name, changedByName) {
  const html = wrapTemplate('Bank QR code updated', `
    <p>Hi ${name},</p>
    <p>The platform's payment QR code / bank details were just updated by <strong>${changedByName}</strong>.</p>
    <p>If you did not expect this change, please verify immediately and check the audit log.</p>
  `);
  return sendMail({ to, subject: 'Security alert: Bank QR code changed - One Click School Solutions', html, emailType: 'qr_changed' });
}

async function sendLowBalanceEmail(to, name, schoolName, balance, relatedSchoolId) {
  const html = wrapTemplate('Low wallet balance', `
    <p>Hi ${name},</p>
    <p><strong>${schoolName}</strong>'s wallet balance is low: <strong style="color:#B45309">₹${balance}</strong>.</p>
    <p>Please recharge soon to avoid interruption when generating certificates.</p>
  `);
  return sendMail({ to, subject: 'Low wallet balance - One Click School Solutions', html, emailType: 'wallet_low_balance', relatedSchoolId });
}

// Accepts either a single certificate { studentName, type, serial } (school
// admin's own generation, or the post-approval notification) or a batch
// { items: [{ studentName, type, serial }, ...] } (cart checkout, which can
// generate several certificates in one OTP confirmation and sends one
// summary email) — both shapes funnel into the same template.
async function sendCertificateGeneratedEmail(to, name, payload = {}) {
  const items = payload.items && payload.items.length
    ? payload.items
    : [{ studentName: payload.studentName, type: payload.type, serial: payload.serial }];
  const TYPE_LABELS = { lc: 'Leaving Certificate', bonafide: 'Bonafide', idcard: 'ID Card', relation: 'Relation Certificate' };
  const rows = items.map(i => `
    <tr>
      <td style="padding:6px 10px 6px 0;color:#64748b">${escapeHtml(TYPE_LABELS[i.type] || i.type)}</td>
      <td style="padding:6px 10px 6px 0">${escapeHtml(i.studentName)}</td>
      <td style="padding:6px 0;font-weight:600">${escapeHtml(i.serial)}</td>
    </tr>`).join('');
  const html = wrapTemplate('Certificate generated', `
    <p>Hi ${escapeHtml(name)},</p>
    <p>${items.length > 1 ? `${items.length} certificates have` : 'A certificate has'} been generated:</p>
    <table style="width:100%;border-collapse:collapse;margin-top:8px">
      <tr>
        <th style="text-align:left;color:#94a3b8;font-size:12px;font-weight:600;padding-bottom:4px">Type</th>
        <th style="text-align:left;color:#94a3b8;font-size:12px;font-weight:600;padding-bottom:4px">Student</th>
        <th style="text-align:left;color:#94a3b8;font-size:12px;font-weight:600;padding-bottom:4px">Serial</th>
      </tr>
      ${rows}
    </table>
  `);
  return sendMail({
    to, subject: 'Certificate generated - One Click School Solutions', html,
    emailType: 'certificate_generated',
    relatedSchoolId: payload.schoolId,
    relatedCertificateId: payload.certificateId,
  });
}

async function sendSessionExpiredEmail(to, name) {
  const html = wrapTemplate('Session expired', `
    <p>Hi ${name},</p>
    <p>Your One Click School Solutions session expired due to inactivity. Please log in again to continue.</p>
  `);
  return sendMail({ to, subject: 'Session expired - One Click School Solutions', html, emailType: 'session_expired' });
}

async function sendCartOtpEmail(to, name, otp, { itemCount, cartTotal }) {
  const html = wrapTemplate('Your One Click School Solutions OTP', `
    <p>Hi ${name},</p>
    <p>You requested to generate <strong>${itemCount}</strong> certificate${itemCount !== 1 ? 's' : ''} totalling <strong>₹${cartTotal}</strong>.</p>
    <p>Use the code below to confirm your request. It expires in 10 minutes.</p>
    <p style="text-align:center;margin:28px 0">
      <span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#1A6FD4">${otp}</span>
    </p>
    <p style="font-size:13px;color:#64748b">Do not share this code with anyone. One Click School Solutions staff will never ask for it.</p>
  `);
  const result = await sendMail({ to, subject: `${otp} is your One Click School Solutions OTP`, html, emailType: 'cart_otp' });
  if (!result.success) {
    const error = new Error(result.error || 'OTP email could not be delivered');
    error.code = 'EMAIL_DELIVERY_FAILED';
    throw error;
  }
  return result;
}

async function sendCartInsufficientBalanceEmail(to, name, { cartTotal, walletBalance, shortfall, schoolId }) {
  const html = wrapTemplate('Insufficient wallet balance', `
    <p>Hi ${escapeHtml(name)},</p>
    <p>Your cart total of <strong>₹${cartTotal}</strong> exceeds your current wallet balance of <strong>₹${walletBalance}</strong>.</p>
    <p>Please recharge at least <strong style="color:#B45309">₹${shortfall}</strong> to continue and generate these certificates.</p>
  `);
  return sendMail({ to, subject: 'Insufficient wallet balance - One Click School Solutions', html, emailType: 'cart_insufficient_balance', relatedSchoolId: schoolId });
}

// ---------------------------------------------------------------------------
// EmailService surface — thin aliases over the functions above. No duplicate
// SMTP/template logic: every alias calls straight into the already-tested
// implementation, so behavior (including logging via sendMail) is identical.
// ---------------------------------------------------------------------------
const sendEmail = sendMail;
const sendCertificateEmail = sendCertificateGeneratedEmail;
const sendUserInvitationEmail = sendWelcomeEmail;
const sendSchoolRegistrationEmail = sendSchoolWelcomeEmail;

async function sendNotificationEmail(to, name, { title, message, relatedUserId, relatedSchoolId, relatedCertificateId } = {}) {
  const html = wrapTemplate(title, `<p>Hi ${escapeHtml(name)},</p><p>${escapeHtml(message)}</p>`);
  return sendMail({ to, subject: title, html, emailType: 'notification', relatedUserId, relatedSchoolId, relatedCertificateId });
}

module.exports = {
  sendMail, sendPasswordSetupEmail, sendPasswordResetEmail, sendWalletTopupEmail,
  sendDistributorCreatedEmail, sendSchoolApprovedEmail,
  sendSuperDistributorCreatedEmail, sendSchoolWelcomeEmail, sendWelcomeEmail,
  sendWalletSubmittedEmail, sendWalletApprovedEmail, sendWalletRejectedEmail,
  sendQrChangedEmail, sendLowBalanceEmail, sendCertificateGeneratedEmail,
  sendSessionExpiredEmail, sendCartOtpEmail, sendCartInsufficientBalanceEmail,
  // EmailService surface
  sendEmail, sendCertificateEmail, sendUserInvitationEmail,
  sendSchoolRegistrationEmail, sendNotificationEmail,
};
