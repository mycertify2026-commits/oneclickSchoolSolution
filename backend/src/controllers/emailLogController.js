const { pool } = require('../config/db');

// GET /api/email-logs (superAdmin) — visibility into every email attempt
// across every role, since sendMail() in utils/email.js is the single
// choke point every welcome/wallet/certificate/camp email funnels through
// and logs a row here regardless of who triggered it or whether it
// succeeded. Lets Super Admin see, at a glance, whether email delivery is
// actually working platform-wide instead of guessing from server logs.
async function listEmailLogs(req, res) {
  try {
    const { status, emailType, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params = [];
    if (status) { where += ' AND status = ?'; params.push(status); }
    if (emailType) { where += ' AND email_type = ?'; params.push(emailType); }
    if (search) { where += ' AND recipient LIKE ?'; params.push(`%${search}%`); }

    const [rows] = await pool.query(
      `SELECT id, recipient, sender, email_type, related_user_id, related_school_id, related_certificate_id,
              status, error_message, attempt_count, sent_at
       FROM email_logs ${where}
       ORDER BY sent_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM email_logs ${where}`, params);
    const [statusCounts] = await pool.query(
      `SELECT status, COUNT(*) as count FROM email_logs GROUP BY status`
    );
    const stats = { SENT: 0, FAILED: 0, PENDING: 0 };
    statusCounts.forEach(r => { stats[r.status] = Number(r.count); });

    res.json({
      emailLogs: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      stats,
    });
  } catch (err) {
    console.error('listEmailLogs error:', err.message);
    res.status(500).json({ error: 'Server error fetching email logs' });
  }
}

module.exports = { listEmailLogs };
