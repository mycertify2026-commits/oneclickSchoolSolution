const express = require('express');
const router = express.Router();
const masterDataController = require('../controllers/masterDataController');
const { authenticate, requireRole } = require('../middleware/auth');
const { uploadImport } = require('../middleware/upload');

router.get('/export', authenticate, requireRole('superAdmin'), masterDataController.exportMasterData);
router.get('/import-template', authenticate, requireRole('superAdmin'), masterDataController.downloadMasterDataTemplate);
router.post('/import', authenticate, requireRole('superAdmin'), uploadImport.single('file'), masterDataController.importMasterData);

router.get('/', authenticate, masterDataController.listMasterData);

router.use(authenticate, requireRole('superAdmin'));
router.post('/', masterDataController.createMasterData);
router.put('/:id', masterDataController.updateMasterData);
router.delete('/:id', masterDataController.deleteMasterData);

module.exports = router;
