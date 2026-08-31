const express = require('express');
const router = express.Router();
const c = require('../controllers/commissionController');
const { authenticate, requireRole } = require('../middleware/auth');

router.get('/config', authenticate, requireRole('superAdmin'), c.getConfig);
router.put('/config', authenticate, requireRole('superAdmin'), c.updateConfig);

module.exports = router;
