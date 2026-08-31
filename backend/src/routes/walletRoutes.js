const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const walletController = require('../controllers/walletController');
const walletRequestController = require('../controllers/walletRequestController');
const { authenticate, requireRole } = require('../middleware/auth');
const { attachSchool } = require('../middleware/attachSchool');
const { uploadWalletScreenshot } = require('../middleware/upload');
const { handleValidationErrors } = require('../middleware/validate');
const { sanitizeBody } = require('../middleware/sanitize');

// ===================== SCHOOL ADMIN =====================
router.get('/balance', authenticate, requireRole('schoolAdmin'), attachSchool, walletController.getBalance);
router.get('/transactions', authenticate, requireRole('schoolAdmin'), attachSchool, walletController.getTransactions);
router.get('/transactions/export', authenticate, requireRole('schoolAdmin'), attachSchool, walletController.exportTransactions);

router.post(
  '/recharge-requests',
  authenticate, requireRole('schoolAdmin'), attachSchool,
  uploadWalletScreenshot.single('screenshot'),
  sanitizeBody,
  body('amount').notEmpty().withMessage('Amount is required'),
  body('utrNumber').notEmpty().withMessage('UTR number is required'),
  body('paymentDate').notEmpty().withMessage('Payment date is required'),
  handleValidationErrors,
  walletRequestController.submitRechargeRequest
);
router.get('/recharge-requests/mine', authenticate, requireRole('schoolAdmin'), attachSchool, walletRequestController.getMyRechargeRequests);

// ===================== SUPER ADMIN =====================
router.get('/recharge-requests', authenticate, requireRole('superAdmin'), walletRequestController.listRechargeRequests);
router.put('/recharge-requests/:id/approve', authenticate, requireRole('superAdmin'), walletRequestController.approveRechargeRequest);
router.put(
  '/recharge-requests/:id/reject',
  authenticate, requireRole('superAdmin'), sanitizeBody,
  body('reason').notEmpty().withMessage('A rejection reason is required'),
  handleValidationErrors,
  walletRequestController.rejectRechargeRequest
);

module.exports = router;
