const express = require('express');
const router = express.Router();
const c = require('../controllers/campController');
const { authenticate, requireRole } = require('../middleware/auth');
const { attachSchool } = require('../middleware/attachSchool');

// School Admin — attachSchool sets req.schoolId (was missing, causing null school_id error)
router.get('/mine',        authenticate, requireRole('schoolAdmin'), attachSchool, c.listMyCampRequests);
router.post('/mine',       authenticate, requireRole('schoolAdmin'), attachSchool, c.createCampRequest);
router.delete('/mine/:id', authenticate, requireRole('schoolAdmin'), attachSchool, c.cancelMyCampRequest);

// Distributor
router.get('/distributor',       authenticate, requireRole('distributor'), c.listDistributorCampRequests);
router.put('/distributor/:id',   authenticate, requireRole('distributor'), c.updateDistributorCampRequest);

// Super Distributor
router.get('/sd', authenticate, requireRole('superDistributor'), c.listSdCampRequests);
router.put('/sd/:id', authenticate, requireRole('superDistributor'), c.updateSdCampRequest);

// Super Admin
router.get('/',    authenticate, requireRole('superAdmin'), c.listAllCampRequests);
router.put('/:id', authenticate, requireRole('superAdmin'), c.updateCampRequestByAdmin);

module.exports = router;
