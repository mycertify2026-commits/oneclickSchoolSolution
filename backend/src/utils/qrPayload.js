function calculateAge(dobString) {
  if (!dobString) return '-';
  const dob = new Date(dobString);
  if (isNaN(dob.getTime())) return '-';
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

// Builds the public verification URL embedded in every certificate PDF.
// Use the frontend origin because it proxies /api to the backend both in the
// Replit preview and in the deployed app. This keeps the QR link reachable
// from an external phone without exposing a localhost URL.
function buildVerifyUrl(certificateId) {
  const configuredBaseUrl = process.env.QR_PUBLIC_BASE_URL || process.env.FRONTEND_URL;
  if (!configuredBaseUrl) {
    throw new Error('QR_PUBLIC_BASE_URL must be configured before generating a QR code');
  }
  const baseUrl = configuredBaseUrl.replace(/\/$/, '');
  return `${baseUrl}/verify/${encodeURIComponent(certificateId)}`;
}

module.exports = { buildVerifyUrl, calculateAge };
