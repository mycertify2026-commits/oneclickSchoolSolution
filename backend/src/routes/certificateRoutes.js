const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/certificateController');
const { authenticate, requireRole } = require('../middleware/auth');
const { attachSchool } = require('../middleware/attachSchool');

// ── Public: QR code scan → opens certificate PDF directly ────────────────────
router.get('/public/:id/pdf', ctrl.publicDownloadCertificate);
router.get('/verify/:id', ctrl.verifyCertificate);

// ── Pricing — public read (any authenticated role), Super Admin write ────────
router.get('/pricing', authenticate, ctrl.getAllPricing);
router.put('/pricing', authenticate, requireRole('superAdmin'), ctrl.updateAllPricing);

// ── Super Admin only ─────────────────────────────────────────────────────────
router.get('/requests/admin',
  authenticate, requireRole('superAdmin'),
  ctrl.adminListRequests);
router.post('/requests/admin/:id/approve',
  authenticate, requireRole('superAdmin'),
  ctrl.adminApproveRequest);
router.post('/requests/admin/:id/reject',
  authenticate, requireRole('superAdmin'),
  ctrl.adminRejectRequest);
router.get('/:id/admin-download',
  authenticate, requireRole('superAdmin'),
  ctrl.downloadCertificateAsAdmin);

// ── School Admin only (all routes below require school auth) ──────────────────
router.use(authenticate, requireRole('schoolAdmin'), attachSchool);
router.post('/preview',      ctrl.previewCertificate);
router.get('/export',        ctrl.exportCertificates);
router.get('/requests',      ctrl.listMyRequests);
router.post('/request',      ctrl.requestCertificate);
router.get('/price',         ctrl.getPrice);
router.get('/earnings',      ctrl.getMyEarnings);
router.get('/',              ctrl.listCertificates);
router.get('/:id/download',  ctrl.downloadCertificate);
router.get('/:id/receipt',   ctrl.downloadReceipt);

module.exports = router;
