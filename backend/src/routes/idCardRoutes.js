const express = require('express');
const router = express.Router();
const c = require('../controllers/idCardController');
const { authenticate, requireRole } = require('../middleware/auth');
const { attachSchool } = require('../middleware/attachSchool');

// Pricing — public read (school admin), SA write
router.get('/pricing', authenticate, c.getPricing);
router.put('/pricing', authenticate, requireRole('superAdmin'), c.updatePricing);

// School Admin
router.post('/hard-copy',       authenticate, requireRole('schoolAdmin'), attachSchool, c.createHardCopyRequest);
router.get('/hard-copy/mine',   authenticate, requireRole('schoolAdmin'), attachSchool, c.listMyHardCopyRequests);

// Distributor
router.get('/hard-copy/distributor', authenticate, requireRole('distributor'), c.listDistributorHardCopyRequests);

// Super Distributor
router.get('/hard-copy/sd', authenticate, requireRole('superDistributor'), c.listSdHardCopyRequests);

// Super Admin
router.get('/hard-copy',        authenticate, requireRole('superAdmin'), c.listAllHardCopyRequests);
router.put('/hard-copy/:id',    authenticate, requireRole('superAdmin'), c.updateHardCopyRequest);

module.exports = router;
