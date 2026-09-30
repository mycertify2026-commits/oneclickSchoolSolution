const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/eduDocRequestController');
const { authenticate, requireRole } = require('../middleware/auth');
const { attachSchool } = require('../middleware/attachSchool');
const { uploadEduDoc } = require('../middleware/upload');

const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many attempts, try again later.' } });

// ── School Admin ─────────────────────────────────────────────────────────────
router.get('/types', authenticate, requireRole('schoolAdmin'), c.getDocTypes);
router.post(
  '/upload',
  authenticate, requireRole('schoolAdmin'), attachSchool,
  // multer's own errors (wrong file type, too large) don't match the global
  // error handler's "Only JPG, PNG" substring check, so they're caught here
  // explicitly rather than falling through to a generic 500.
  (req, res, next) => {
    uploadEduDoc.single('pdf')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
      next();
    });
  },
  c.uploadPendingPdf
);
router.post('/submit', authenticate, requireRole('schoolAdmin'), attachSchool, otpLimiter, c.submitRequest);
router.post('/resend-otp', authenticate, requireRole('schoolAdmin'), attachSchool, otpLimiter, c.resendOtp);
router.post('/verify-otp', authenticate, requireRole('schoolAdmin'), attachSchool, otpLimiter, c.verifyOtp);
router.get('/mine', authenticate, requireRole('schoolAdmin'), attachSchool, c.listMine);

// ── Distributor ──────────────────────────────────────────────────────────────
router.get('/distributor', authenticate, requireRole('distributor'), c.listForDistributor);
router.put('/distributor/:id', authenticate, requireRole('distributor'), c.updateStatusByDistributor);
router.post('/distributor/:id/close', authenticate, requireRole('distributor'), c.closeByDistributor);

// ── Super Admin ──────────────────────────────────────────────────────────────
router.get('/types/admin', authenticate, requireRole('superAdmin'), c.listDocTypesForAdmin);
router.put('/types/:docType', authenticate, requireRole('superAdmin'), c.updateDocType);
router.get('/', authenticate, requireRole('superAdmin'), c.listAll);
router.put('/:id', authenticate, requireRole('superAdmin'), c.updateStatusByAdmin);

// Document download — one PDF per student in a request, access-checked
// inside the handler (school owner / assigned distributor or super
// distributor / super admin), never a public URL.
router.get('/documents/:id/pdf', authenticate, c.downloadPdf);

module.exports = router;
