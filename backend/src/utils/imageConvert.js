const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * Convert any image file to JPEG in-place after multer saves it.
 * PDFKit only supports JPEG and PNG — WebP, HEIC, TIFF, etc. will
 * cause silent failures. Call this immediately after multer, before
 * storing the path in the DB.
 *
 * Returns the (possibly new) .jpg file path.
 */
async function toJpegPath(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return filePath;
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return filePath; // already JPEG
  const newPath = filePath.replace(/\.[^.]+$/, '.jpg');
  await sharp(filePath).jpeg({ quality: 92 }).toFile(newPath);
  try { fs.unlinkSync(filePath); } catch (_) {}
  return newPath;
}

/**
 * Return a value safe to pass to PDFKit's doc.image():
 *   - JPEG/PNG  → returns the original file path (PDFKit reads it directly)
 *   - Anything else → converts to PNG and returns a Buffer
 *   - File missing / null → returns null
 */
async function toPdfSafe(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') return filePath;
  return await sharp(filePath).png().toBuffer();
}

module.exports = { toJpegPath, toPdfSafe };
