const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const walletRequestController = require('../controllers/walletRequestController');
const { authenticate, requireRole } = require('../middleware/auth');
const { uploadBankQr } = require('../middleware/upload');
const { handleValidationErrors } = require('../middleware/validate');
const { sanitizeBody } = require('../middleware/sanitize');

// Any logged-in school admin needs to see where to transfer money.
router.get('/', authenticate, requireRole('schoolAdmin', 'superAdmin'), walletRequestController.getBankDetails);

router.put(
  '/',
  authenticate, requireRole('superAdmin'),
  uploadBankQr.single('qrCode'),
  sanitizeBody,
  body('account_holder').notEmpty().withMessage('Account holder name is required'),
  body('bank_name').notEmpty().withMessage('Bank name is required'),
  body('account_number').notEmpty().withMessage('Account number is required'),
  body('ifsc').notEmpty().withMessage('IFSC code is required'),
  handleValidationErrors,
  walletRequestController.updateBankDetails
);

module.exports = router;
