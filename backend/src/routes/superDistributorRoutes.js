const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const c = require('../controllers/superDistributorController');
const { authenticate, requireRole } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');
const { sanitizeBody } = require('../middleware/sanitize');
const { uploadSchoolPhoto, uploadAvatar } = require('../middleware/upload');

// ── Super Distributor's own routes (self-service) ──────────────────────────
router.get('/me',          authenticate, requireRole('superDistributor'), c.getMyProfile);
router.put('/me',          authenticate, requireRole('superDistributor'), sanitizeBody, c.updateMyProfile);
router.put('/me/avatar',   authenticate, requireRole('superDistributor'), uploadAvatar.single('avatar'), c.uploadMyAvatar);
router.put('/me/password', authenticate, requireRole('superDistributor'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  handleValidationErrors,
  c.changeMyPassword
);

router.get('/me/dashboard', authenticate, requireRole('superDistributor'), c.getDashboard);

// Distributor management under SD
router.get('/me/distributors',     authenticate, requireRole('superDistributor'), c.listMyDistributors);
router.post('/me/distributors',    authenticate, requireRole('superDistributor'), sanitizeBody,
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('A valid email is required'),
  handleValidationErrors,
  c.createMyDistributor
);
router.get('/me/distributors/:id',    authenticate, requireRole('superDistributor'), c.getMyDistributor);
router.put('/me/distributors/:id',    authenticate, requireRole('superDistributor'), sanitizeBody, c.updateMyDistributor);
router.put('/me/distributors/:id/avatar', authenticate, requireRole('superDistributor'), uploadAvatar.single('avatar'), c.uploadMyDistributorAvatar);
router.delete('/me/distributors/:id', authenticate, requireRole('superDistributor'), c.deleteMyDistributor);

// School management under SD
router.get('/me/schools',     authenticate, requireRole('superDistributor'), c.listMySchools);
router.post('/me/schools',    authenticate, requireRole('superDistributor'),
  uploadSchoolPhoto.fields([{ name: 'insidePhoto', maxCount: 1 }, { name: 'outsidePhoto', maxCount: 1 }]),
  sanitizeBody,
  body('name').notEmpty().withMessage('School name is required'),
  body('adminEmail').isEmail().withMessage('A valid admin email is required'),
  handleValidationErrors,
  c.addMySchool
);
router.put('/me/schools/:id',    authenticate, requireRole('superDistributor'), sanitizeBody, c.updateMySchool);
router.delete('/me/schools/:id', authenticate, requireRole('superDistributor'), c.deleteMySchool);

// ── Super Admin management of Super Distributors ───────────────────────────
router.get('/',    authenticate, requireRole('superAdmin'), c.listSuperDistributors);
router.post('/',   authenticate, requireRole('superAdmin'), sanitizeBody,
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('A valid email is required'),
  body('district').notEmpty().withMessage('District is required'),
  handleValidationErrors,
  c.createSuperDistributor
);
router.put('/:id',    authenticate, requireRole('superAdmin'), sanitizeBody, c.updateSuperDistributorByAdmin);
router.put('/:id/avatar', authenticate, requireRole('superAdmin'), uploadAvatar.single('avatar'), c.uploadSuperDistributorAvatarByAdmin);
router.delete('/:id', authenticate, requireRole('superAdmin'), c.deleteSuperDistributor);

module.exports = router;
