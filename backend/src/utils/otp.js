const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/**
 * Generates a cryptographically random 6-digit numeric OTP.
 */
function generateOtp() {
  const bytes = crypto.randomBytes(4);
  const num = bytes.readUInt32BE(0) % 1000000;
  return String(num).padStart(6, '0');
}

/**
 * Hashes the OTP with bcrypt so it can be stored safely.
 */
async function hashOtp(otp) {
  return bcrypt.hash(otp, 10);
}

/**
 * Verifies a plain-text OTP against its stored bcrypt hash.
 */
async function verifyOtpHash(otp, hash) {
  return bcrypt.compare(otp, hash);
}

module.exports = { generateOtp, hashOtp, verifyOtpHash };
