const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');

router.post('/login',
  body('email').notEmpty().withMessage('Email/Login ID is required'),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors,
  authController.login
);

router.post('/refresh',
  body('refreshToken').notEmpty().withMessage('Refresh token is required'),
  handleValidationErrors,
  authController.refresh
);

router.post('/logout', authController.logout);

router.post('/forgot-password',
  body('email').isEmail().withMessage('A valid email is required'),
  handleValidationErrors,
  authController.forgotPassword
);

router.post('/set-password',
  body('token').notEmpty().withMessage('Token is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  handleValidationErrors,
  authController.setPassword
);

router.get('/me', authenticate, authController.me);

module.exports = router;
