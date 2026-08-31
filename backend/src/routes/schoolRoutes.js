const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const schoolController = require('../controllers/schoolController');
const distributorController = require('../controllers/distributorController');
const certificateController = require('../controllers/certificateController');
const { authenticate, requireRole } = require('../middleware/auth');
const { attachSchool } = require('../middleware/attachSchool');
const { uploadBranding, uploadTemplate } = require('../middleware/upload');
const { handleValidationErrors } = require('../middleware/validate');
const { sanitizeBody } = require('../middleware/sanitize');

const createSchoolValidation = [
  body('name').notEmpty().withMessage('School name is required').isLength({ max: 200 }),
  body('adminName').notEmpty().withMessage('Admin name is required'),
  body('adminEmail').isEmail().withMessage('A valid admin email is required')
];

router.get('/me', authenticate, requireRole('schoolAdmin'), attachSchool, schoolController.getMySchool);
router.put(
  '/me', authenticate, requireRole('schoolAdmin'), attachSchool,
  uploadBranding.fields([{ name: 'logo', maxCount: 1 }, { name: 'signature', maxCount: 1 }, { name: 'stamp', maxCount: 1 }]),
  sanitizeBody,
  schoolController.updateMySchool
);
router.put('/me/id-card-design', authenticate, requireRole('schoolAdmin'), attachSchool, sanitizeBody, schoolController.updateIdCardDesign);
router.post('/me/id-card-preview', authenticate, requireRole('schoolAdmin'), attachSchool, sanitizeBody, schoolController.previewIdCard);
router.put('/me/id-card-bg', authenticate, requireRole('schoolAdmin'), attachSchool, uploadBranding.single('bg_image'), schoolController.uploadIdCardBg);
router.delete('/me/id-card-bg', authenticate, requireRole('schoolAdmin'), attachSchool, schoolController.deleteIdCardBg);
router.put('/me/certificate-template/:type', authenticate, requireRole('schoolAdmin'), attachSchool, uploadTemplate.single('template'), schoolController.uploadCertificateTemplate);
router.delete('/me/certificate-template/:type', authenticate, requireRole('schoolAdmin'), attachSchool, schoolController.deleteCertificateTemplate);

router.use(authenticate, requireRole('superAdmin'));
router.get('/export', schoolController.exportSchools);
router.get('/', schoolController.listSchools);
router.post('/', sanitizeBody, createSchoolValidation, handleValidationErrors, schoolController.createSchool);
router.get('/:id', schoolController.getSchool);
router.get('/:id/students', schoolController.listStudentsForSchool);
router.get('/:id/certificates', certificateController.listCertificatesForSchool);
router.put('/:id', sanitizeBody, schoolController.updateSchool);
router.delete('/:id', schoolController.deleteSchool);
router.put('/:id/status', schoolController.updateSchoolStatus);
router.put('/:id/assign-distributor', distributorController.assignDistributor);
router.post('/:id/reset-admin-password', schoolController.resetAdminPassword);

module.exports = router;
