// Lightweight XSS sanitizer for text fields stored in the database and later
// rendered in the UI (student names, addresses, school names, etc.).
// Strips tags rather than escaping them, since these are plain-text business
// fields (a name should never legitimately contain HTML), making this safe
// to apply unconditionally without affecting normal input.
function stripHtml(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/javascript:/gi, '')
    .trim();
}

// Express middleware: sanitizes every string field in req.body in place.
// Mounted on routes that accept user-editable text (students, schools,
// distributors, master data) - not on routes that only take IDs, tokens, or
// numeric/file payloads, where there is nothing meaningful to strip.
function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = stripHtml(req.body[key]);
      }
    }
  }
  next();
}

module.exports = { stripHtml, sanitizeBody };
