const { validationResult } = require('express-validator');

// Runs after a route's validation chain (e.g. body('email').isEmail()).
// If any check failed, responds with a 400 and a clear list of field errors
// instead of letting a bad request reach the controller/database at all.
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
  }
  next();
}

module.exports = { handleValidationErrors };
