const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { sendPasswordSetupEmail, sendPasswordResetEmail, sendSessionExpiredEmail, sendWelcomeEmail } = require('../utils/email');
const { logAudit } = require('../utils/audit');

const TOKEN_EXPIRY_MIN = Number(process.env.RESET_TOKEN_EXPIRES_MINUTES) || 30;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// POST /api/auth/login
// Accepts either an email (Super Admin) or an identifier that resolves to
// one (School Admin's Login ID e.g. SCH001, Distributor's username) - the
// prototype's login form collects different field types per role, so the
// backend does the resolution rather than changing those visible fields.
async function login(req, res) {
  try {
    const { email, password, role } = req.body;

    console.log("\n========== LOGIN ==========");
    console.log("Request Body:", req.body);

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required"
      });
    }

    let resolvedEmail = email.toLowerCase().trim();

    if (role === "schoolAdmin") {
      const [schoolRows] = await pool.query(
        `SELECT u.email
         FROM schools s
         JOIN users u ON u.id = s.admin_user_id
         WHERE s.login_id = ?`,
        [email.trim()]
      );

      console.log("School Lookup:", schoolRows);

      if (schoolRows.length === 0) {
        return res.status(401).json({
          error: "Invalid email or password"
        });
      }

      resolvedEmail = schoolRows[0].email;
    }

    if (role === "distributor" && !email.includes("@")) {
      const [distRows] = await pool.query(
        `SELECT u.email
         FROM distributors d
         JOIN users u ON u.id = d.user_id
         WHERE u.email LIKE ?`,
        [`${email.trim()}@%`]
      );

      console.log("Distributor Lookup:", distRows);

      if (distRows.length === 0) {
        return res.status(401).json({
          error: "Invalid email or password"
        });
      }

      resolvedEmail = distRows[0].email;
    }

    console.log("Resolved Email:", resolvedEmail);

    const [rows] = await pool.query(
      "SELECT * FROM users WHERE email=? AND deleted_at IS NULL",
      [resolvedEmail]
    );

    console.log("User:", rows);

    const user = rows[0];

    if (!user) {
      console.log("❌ User Not Found");
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    console.log("Password Set:", user.password_set);
    console.log("Hash Exists:", !!user.password_hash);

    // Guard: password was never set (hash is null) — tell user to set it up
    if (!user.password_hash || !user.password_set) {
      return res.status(401).json({
        error: "Password not set up yet. Please contact your administrator to reset your password."
      });
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    console.log("Password Match:", valid);

    if (!valid) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    if (user.role === "schoolAdmin") {
      const [schoolStatusRows] = await pool.query(
        "SELECT status,rejection_reason FROM schools WHERE admin_user_id=? AND deleted_at IS NULL",
        [user.id]
      );

      const school = schoolStatusRows[0];

      if (!school || school.status === "pending") {
        return res.status(403).json({
          error: "Your account is awaiting Super Admin approval."
        });
      }

      if (school.status === "rejected") {
        return res.status(403).json({
          error: `Rejected: ${school.rejection_reason || ""}`
        });
      }

      if (school.status === "suspended") {
        return res.status(403).json({
          error: "School account suspended."
        });
      }
    }

    const accessToken = signAccessToken({
      id: user.id,
      role: user.role
    });

    const refreshToken = signRefreshToken({
      id: user.id
    });

    await pool.query(
      `INSERT INTO refresh_tokens
      (id,user_id,token_hash,expires_at)
      VALUES(?,?,?,?)`,
      [uuidv4(), user.id, hashToken(refreshToken), new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
    );

    console.log("✅ LOGIN SUCCESS");

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (err) {
    console.error("LOGIN ERROR:");
    console.error(err);
    console.error(err.stack);

    res.status(500).json({
      error: err.message
    });
  }
}
// POST /api/auth/refresh
async function refresh(req, res) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token is required' });

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const tokenHash = hashToken(refreshToken);
    const [rows] = await pool.query(
      `SELECT * FROM refresh_tokens WHERE user_id = ? AND token_hash = ? AND revoked = 0 AND expires_at > NOW()`,
      [decoded.id, tokenHash]
    );
    if (rows.length === 0) {
      // This is the genuine "session expired" event from the user's
      // perspective - the refresh token itself is gone/expired/revoked, so
      // no more silent re-authentication is possible and the client will
      // force a full logout. Notify by email here specifically, rather than
      // on every subsequent 401 on protected routes (which would fire
      // repeatedly for the same expiry).
      const [expiredUserRows] = await pool.query('SELECT name, email FROM users WHERE id = ? AND deleted_at IS NULL', [decoded.id]);
      if (expiredUserRows[0]) {
        sendSessionExpiredEmail(expiredUserRows[0].email, expiredUserRows[0].name).catch(e => console.error('Session-expired email failed:', e.message));
      }
      return res.status(401).json({ error: 'Refresh token not recognized or has been revoked' });
    }

    const [userRows] = await pool.query('SELECT id, role, is_active FROM users WHERE id = ? AND deleted_at IS NULL', [decoded.id]);
    const user = userRows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    const newAccessToken = signAccessToken({ id: user.id, role: user.role });
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    console.error('refresh error:', err.message);
    res.status(500).json({ error: 'Server error refreshing token' });
  }
}

// POST /api/auth/logout - revokes the refresh token so it can't be reused
async function logout(req, res) {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await pool.query('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?', [tokenHash]);
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('logout error:', err.message);
    res.status(500).json({ error: 'Server error during logout' });
  }
}

// origin: the caller's request Origin header (preferred) or FRONTEND_URL env var.
// Using the request origin means the link always points back to whichever domain
// the user is on (dev or production), avoiding dead links from a stale FRONTEND_URL.
async function createAndSendPasswordToken(user, type, origin, welcomeOptions = {}) {
  const token = uuidv4() + uuidv4();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MIN * 60 * 1000);

  await pool.query(
    `INSERT INTO password_tokens (id, user_id, token, type, expires_at) VALUES (?, ?, ?, ?, ?)`,
    [uuidv4(), user.id, token, type, expiresAt]
  );

  const base = (origin || process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const link = `${base}/${type === 'setup' ? 'set-password' : 'reset-password'}?token=${token}`;

  if (type === 'setup' && (welcomeOptions.role || user.role)) {
    return sendWelcomeEmail({
      role: welcomeOptions.role || user.role,
      to: user.email,
      name: user.name,
      username: welcomeOptions.username || user.email,
      loginUrl: base,
      setupLink: link,
    });
  }

  return type === 'setup'
    ? sendPasswordSetupEmail(user.email, user.name, link)
    : sendPasswordResetEmail(user.email, user.name, link);
}

// POST /api/auth/forgot-password
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const [rows] = await pool.query('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL', [email.toLowerCase().trim()]);
    const user = rows[0];

    // Generic response regardless of whether the email exists, to avoid leaking account existence.
    if (!user || !user.is_active) {
      return res.json({ message: 'If that email exists, a reset link has been sent.' });
    }

    const emailResult = await createAndSendPasswordToken(user, 'reset', req.headers.origin);
    if (!emailResult.success) {
      console.error('Failed to send reset email:', emailResult.error);
      return res.status(503).json({
        error: 'Could not send the reset email — the mail server is unavailable. Please contact support or try again later.'
      });
    }

    res.json({ message: 'Reset link sent! Check your inbox (and spam folder).' });
  } catch (err) {
    console.error('forgotPassword error:', err.message);
    res.status(500).json({ error: 'Server error processing request' });
  }
}

// POST /api/auth/set-password (used for both initial setup and reset)
async function setPassword(req, res) {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and new password are required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const [rows] = await pool.query('SELECT * FROM password_tokens WHERE token = ? AND used = 0', [token]);
    const record = rows[0];
    if (!record) return res.status(400).json({ error: 'Invalid or already-used link' });
    if (new Date(record.expires_at) < new Date()) return res.status(400).json({ error: 'This link has expired. Please request a new one.' });

    const hash = await bcrypt.hash(password, 10);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('UPDATE users SET password_hash = ?, password_set = 1 WHERE id = ?', [hash, record.user_id]);
      await conn.query('UPDATE password_tokens SET used = 1 WHERE id = ?', [record.id]);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    await logAudit({ userId: record.user_id, action: `PASSWORD_${record.type.toUpperCase()}`, ipAddress: req.ip });

    res.json({ message: 'Password set successfully. You can now log in.' });
  } catch (err) {
    console.error('setPassword error:', err.message);
    res.status(500).json({ error: 'Server error setting password' });
  }
}

// GET /api/auth/me
async function me(req, res) {
  res.json({ user: req.user });
}

module.exports = { login, refresh, logout, forgotPassword, setPassword, me, createAndSendPasswordToken };
