const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');

// GET /api/notifications - for the logged-in user, most recent first
async function listMyNotifications(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json({ notifications: rows });
  } catch (err) {
    console.error('listMyNotifications error:', err.message);
    res.status(500).json({ error: 'Server error fetching notifications' });
  }
}

// PUT /api/notifications/:id/read
async function markAsRead(req, res) {
  try {
    const [result] = await pool.query(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Notification not found' });
    res.json({ message: 'Marked as read' });
  } catch (err) {
    console.error('markAsRead error:', err.message);
    res.status(500).json({ error: 'Server error updating notification' });
  }
}

// PUT /api/notifications/read-all
async function markAllAsRead(req, res) {
  try {
    await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('markAllAsRead error:', err.message);
    res.status(500).json({ error: 'Server error updating notifications' });
  }
}

// Internal helper - other controllers call this to create a notification.
// Not exposed as a public route; e.g. called when a school is approved/rejected,
// when a wallet top-up completes, etc.
async function createNotification(userId, text) {
  try {
    await pool.query('INSERT INTO notifications (id, user_id, text) VALUES (?, ?, ?)', [uuidv4(), userId, text]);
  } catch (err) {
    console.error('createNotification failed (non-fatal):', err.message);
  }
}

module.exports = { listMyNotifications, markAsRead, markAllAsRead, createNotification };
