// Shared helper for the recurring bug pattern: `SELECT * FROM schools` then
// `res.json({ school: row })` — schools has 7 BLOB columns (logo/signature/
// stamp/certificate template images), and sending them inline as JSON
// number arrays instead of via their *_url sibling columns (which the
// frontend actually uses to build /uploads/... URLs) can balloon a single
// response to hundreds of KB for no reason. Confirmed live on production:
// this was a real contributor to slow page loads.
const SCHOOL_BLOB_FIELDS = ['logo_data', 'signature_data', 'stamp_data', 'bonafide_template_data', 'lc_template_data', 'id_card_template_data', 'id_card_bg_data'];

function stripSchoolBlobFields(schoolRow) {
  if (!schoolRow) return schoolRow;
  const clean = { ...schoolRow };
  SCHOOL_BLOB_FIELDS.forEach(f => { delete clean[f]; });
  return clean;
}

module.exports = { stripSchoolBlobFields, SCHOOL_BLOB_FIELDS };
