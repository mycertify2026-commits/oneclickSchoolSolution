const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const distributorController = require('../controllers/distributorController');
const { authenticate, requireRole } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');
const { sanitizeBody } = require('../middleware/sanitize');
const { uploadSchoolPhoto, uploadAvatar } = require('../middleware/upload');

router.get('/me', authenticate, requireRole('distributor'), distributorController.getMyProfile);
router.put('/me', authenticate, requireRole('distributor'), sanitizeBody, distributorController.updateMyProfile);
router.put('/me/avatar', authenticate, requireRole('distributor'), uploadAvatar.single('avatar'), distributorController.uploadMyAvatar);
router.put('/me/password', authenticate, requireRole('distributor'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  handleValidationErrors,
  distributorController.changeMyPassword
);
router.post('/me/schools', authenticate, requireRole('distributor'),
  uploadSchoolPhoto.fields([{ name: 'insidePhoto', maxCount: 1 }, { name: 'outsidePhoto', maxCount: 1 }]),
  sanitizeBody,
  body('name').notEmpty().withMessage('School name is required'),
  body('adminEmail').isEmail().withMessage('A valid admin email is required'),
  handleValidationErrors,
  distributorController.addSchool
);
router.get('/me/schools', authenticate, requireRole('distributor'), distributorController.getMySchools);
router.put('/me/schools/:id', authenticate, requireRole('distributor'), sanitizeBody, distributorController.updateMySchool);
router.delete('/me/schools/:id', authenticate, requireRole('distributor'), distributorController.deleteMySchool);
router.get('/me/commission', authenticate, requireRole('distributor'), distributorController.getMyCommission);

router.use(authenticate, requireRole('superAdmin'));
router.get('/export', distributorController.exportDistributors);
router.get('/', distributorController.listDistributors);
router.post('/', sanitizeBody,
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('A valid email is required'),
  handleValidationErrors,
  distributorController.createDistributor
);
router.put('/:id', sanitizeBody, distributorController.updateDistributorByAdmin);
router.delete('/:id', distributorController.deleteDistributor);

module.exports = router;
