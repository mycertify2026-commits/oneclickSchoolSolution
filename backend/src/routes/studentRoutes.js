const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const studentController = require('../controllers/studentController');
const { authenticate, requireRole } = require('../middleware/auth');
const { attachSchool } = require('../middleware/attachSchool');
const { upload, uploadImport } = require('../middleware/upload');
const { handleValidationErrors } = require('../middleware/validate');
const { sanitizeBody } = require('../middleware/sanitize');

router.use(authenticate, requireRole('schoolAdmin'), attachSchool);

const studentValidation = [
  body('full_name').notEmpty().withMessage('Full name is required').isLength({ max: 150 }),
  body('parent_mobile').optional({ checkFalsy: true }).matches(/^[0-9+\-\s]{7,15}$/).withMessage('Invalid mobile number'),
  body('dob').optional({ checkFalsy: true }).isISO8601().withMessage('DOB must be a valid date (YYYY-MM-DD)')
];

// Literal paths must be registered before '/:id' so Express doesn't treat
// "import-template" or "import" as an :id value.
router.get('/import-template', studentController.downloadImportTemplate);
router.post('/import', uploadImport.single('file'), studentController.importStudents);

router.get('/', studentController.listStudents);
router.get('/:id', studentController.getStudent);
router.post('/', upload.single('photo'), sanitizeBody, studentValidation, handleValidationErrors, studentController.createStudent);
router.put('/:id', upload.single('photo'), sanitizeBody, studentValidation, handleValidationErrors, studentController.updateStudent);
router.delete('/:id', studentController.deleteStudent);

module.exports = router;
