const express = require('express');
const router = express.Router();
const { listEmailLogs } = require('../controllers/emailLogController');
const { authenticate, requireRole } = require('../middleware/auth');

router.get('/', authenticate, requireRole('superAdmin'), listEmailLogs);

module.exports = router;
