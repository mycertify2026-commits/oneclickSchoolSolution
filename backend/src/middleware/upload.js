const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
['photos', 'idcards', 'certificates', 'branding', 'templates', 'imports', 'wallet', 'bank-qr', 'school-photos', 'cert-templates', 'avatars'].forEach(d => ensureDir(path.join(UPLOAD_ROOT, d)));

const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(UPLOAD_ROOT, 'photos')),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname) || '.jpg'}`)
});

const brandingStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(UPLOAD_ROOT, 'branding')),
  filename: (req, file, cb) => cb(null, `${file.fieldname}-${uuidv4()}${path.extname(file.originalname) || '.png'}`)
});

const importStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(UPLOAD_ROOT, 'imports')),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname) || '.xlsx'}`)
});

const walletScreenshotStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(UPLOAD_ROOT, 'wallet')),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname) || '.jpg'}`)
});

const bankQrStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(UPLOAD_ROOT, 'bank-qr')),
  filename: (req, file, cb) => cb(null, `qr-${uuidv4()}${path.extname(file.originalname) || '.png'}`)
});

const schoolPhotoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(UPLOAD_ROOT, 'school-photos')),
  filename: (req, file, cb) => cb(null, `${file.fieldname}-${uuidv4()}${path.extname(file.originalname) || '.jpg'}`)
});

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(UPLOAD_ROOT, 'avatars')),
  filename: (req, file, cb) => cb(null, `avatar-${uuidv4()}${path.extname(file.originalname) || '.jpg'}`)
});

const imageFilter = (req, file, cb) => {
  // Some browsers/OS file pickers report a generic or slightly different
  // mimetype for a genuinely valid image (e.g. 'image/pjpeg' for a
  // progressive JPEG, 'image/x-png' from older browsers, or a blank/
  // 'application/octet-stream' mimetype for some drag-and-drop flows) -
  // confirmed via a real failed upload in this app's logs, silently
  // rejecting a valid file with no clear reason. Fall back to the file
  // extension, matching the more permissive pattern already used by
  // templateFilter in this same file.
  const allowedMime = ['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/x-png', 'image/webp'];
  const allowedExt = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedMime.includes(file.mimetype) || allowedExt.includes(ext)) cb(null, true);
  else cb(new Error('Only JPG, PNG, or WEBP images are allowed'));
};

const importFilter = (req, file, cb) => {
  const allowed = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'];
  const isCsvByExt = file.originalname.toLowerCase().endsWith('.csv');
  if (allowed.includes(file.mimetype) || isCsvByExt) cb(null, true);
  else cb(new Error('Only .xlsx, .xls, or .csv files are allowed'));
};

const upload = multer({ storage: photoStorage, fileFilter: imageFilter, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadBranding = multer({ storage: brandingStorage, fileFilter: imageFilter, limits: { fileSize: 3 * 1024 * 1024 } });
const templateStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(UPLOAD_ROOT, 'templates')),
  filename: (req, file, cb) => cb(null, `template-${req.params.type || 'certificate'}-${uuidv4()}.png`)
});
const templateFilter = (req, file, cb) => {
  if (file.mimetype === 'image/png' || path.extname(file.originalname).toLowerCase() === '.png') cb(null, true);
  else cb(new Error('Certificate template must be a PNG image'));
};
const uploadTemplate = multer({ storage: templateStorage, fileFilter: templateFilter, limits: { fileSize: 8 * 1024 * 1024 } });
const uploadImport = multer({ storage: importStorage, fileFilter: importFilter, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadWalletScreenshot = multer({ storage: walletScreenshotStorage, fileFilter: imageFilter, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadBankQr = multer({ storage: bankQrStorage, fileFilter: imageFilter, limits: { fileSize: 3 * 1024 * 1024 } });
const uploadSchoolPhoto = multer({ storage: schoolPhotoStorage, fileFilter: imageFilter, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadAvatar = multer({ storage: avatarStorage, fileFilter: imageFilter, limits: { fileSize: 3 * 1024 * 1024 } });

// Custom certificate template source upload (School Admin's own LC/Bonafide/
// ID-card format) — unlike uploadTemplate (PNG-only, the older plain-
// background feature), this accepts a real scanned/photographed PDF too,
// since it feeds the OCR/rasterization pipeline instead of being drawn as-is.
const certTemplateStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(UPLOAD_ROOT, 'cert-templates')),
  filename: (req, file, cb) => cb(null, `certtpl-${uuidv4()}${path.extname(file.originalname) || ''}`)
});
const certTemplateFilter = (req, file, cb) => {
  const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only PDF, PNG, or JPEG files are allowed for a certificate template'));
};
const uploadCertTemplateSource = multer({ storage: certTemplateStorage, fileFilter: certTemplateFilter, limits: { fileSize: 12 * 1024 * 1024 } });

module.exports = { upload, uploadBranding, uploadTemplate, uploadImport, uploadWalletScreenshot, uploadBankQr, uploadSchoolPhoto, uploadCertTemplateSource, uploadAvatar, UPLOAD_ROOT };
