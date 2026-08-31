const { pool } = require('../config/db');

// Attaches req.schoolId for a schoolAdmin user, enforcing that only an
// 'active' school can act on student/wallet/certificate data.
async function attachSchool(req, res, next) {
  try {
    if (req.user.role !== 'schoolAdmin') {
      return res.status(403).json({ error: 'Only school admins can access this resource' });
    }
    const [rows] = await pool.query(
      'SELECT id, status FROM schools WHERE admin_user_id = ?',
      [req.user.id]
    );
    const school = rows[0];
    if (!school) {
      return res.status(404).json({ error: 'No school linked to this account' });
    }
    if (school.status !== 'active') {
      return res.status(403).json({ error: `School account is ${school.status}. Contact support.` });
    }
    req.schoolId = school.id;
    next();
  } catch (err) {
    console.error('attachSchool error:', err.message);
    res.status(500).json({ error: 'Server error resolving school context' });
  }
}

module.exports = { attachSchool };
