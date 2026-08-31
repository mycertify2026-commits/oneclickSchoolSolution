/**
 * fileStore.js — persistent file helpers for autoscale/ephemeral deployments.
 *
 * Autoscale containers start fresh on every deployment — files uploaded to
 * backend/uploads/ are gone after a restart. We store the raw bytes in
 * PostgreSQL (BYTEA) so they survive restarts and can be re-materialised
 * on demand before PDF generation or file serving.
 */
const fs   = require('fs');
const path = require('path');

/**
 * Re-writes a file to disk from a Buffer if it is no longer present.
 * Safe to call even when absolutePath or buffer is null/undefined.
 *
 * @param {string|null} absolutePath  Where the file should live on disk
 * @param {Buffer|null} buffer        Raw bytes stored in the DB column
 */
function restoreIfMissing(absolutePath, buffer) {
  if (!absolutePath || !buffer) return;
  if (fs.existsSync(absolutePath)) return;
  try {
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, buffer);
    console.log('[fileStore] restored from DB:', path.basename(absolutePath));
  } catch (e) {
    console.error('[fileStore] restore failed:', absolutePath, e.message);
  }
}

module.exports = { restoreIfMissing };
