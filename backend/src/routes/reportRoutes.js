const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('superAdmin'));
router.get('/overview', reportController.getOverview);
router.get('/revenue', reportController.getRevenueTrend);
router.get('/certificates-by-type', reportController.getCertificatesByType);
router.get('/top-schools', reportController.getTopSchools);
router.get('/distributor-performance', reportController.getDistributorPerformance);
router.get('/export-users', reportController.exportUsers);

module.exports = router;
