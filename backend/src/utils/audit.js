const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');

// Fire-and-forget audit log write. Never throws - a logging failure must
// not break the action being logged.
async function logAudit({ userId, action, entityType, entityId, ipAddress, details }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, ip_address, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), userId || null, action, entityType || null, entityId || null, ipAddress || null, JSON.stringify(details || {})]
    );
  } catch (err) {
    console.error('Audit log write failed (non-fatal):', err.message);
  }
}

module.exports = { logAudit };
