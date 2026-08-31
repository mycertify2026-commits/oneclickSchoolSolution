const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/certificateTemplateController');
const { authenticate, requireRole } = require('../middleware/auth');
const { attachSchool } = require('../middleware/attachSchool');
const { uploadCertTemplateSource } = require('../middleware/upload');

// All routes are School Admin only, scoped to their own school via
// attachSchool -> req.schoolId (same pattern as every other school-admin
// route in this app).
router.use(authenticate, requireRole('schoolAdmin'), attachSchool);

router.get('/', ctrl.listTemplates);
router.post('/:docType', uploadCertTemplateSource.single('template'), ctrl.uploadTemplate);
router.get('/:id', ctrl.getTemplate);
router.post('/:id/analyze', ctrl.analyzeTemplate);
router.put('/:id/fields', ctrl.saveFields);
router.post('/:id/test-generate', ctrl.testGenerate);
router.put('/:id/activate', ctrl.activateTemplate);
router.put('/:id/deactivate', ctrl.deactivateTemplate);
router.delete('/:id', ctrl.deleteTemplate);

module.exports = router;
