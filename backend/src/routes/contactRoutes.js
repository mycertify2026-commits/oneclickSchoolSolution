const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { submitContactInquiry } = require('../controllers/contactController');
const { handleValidationErrors } = require('../middleware/validate');

const INQUIRY_TYPES = ['school', 'distributor', 'superDistributor', 'general', 'support', 'partnership'];

router.post('/',
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 150 }),
  body('email').trim().isEmail().withMessage('A valid email is required').isLength({ max: 150 }),
  body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 20 }).withMessage('Phone number is too long'),
  body('organization').optional({ checkFalsy: true }).trim().isLength({ max: 200 }),
  body('inquiryType').optional({ checkFalsy: true }).isIn(INQUIRY_TYPES).withMessage('Invalid inquiry type'),
  body('message').trim().notEmpty().withMessage('Message is required').isLength({ max: 3000 }),
  handleValidationErrors,
  submitContactInquiry
);

module.exports = router;
