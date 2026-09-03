// Single dispatch point every certificate-PDF call site goes through. If the
// school has an ACTIVE custom template for this doc type, render onto it;
// otherwise call the existing default generator UNCHANGED, with the exact
// same arguments it already receives today — that fallback branch IS
// today's code path, not a reimplementation, which is what guarantees a
// school with no active template renders byte-for-byte identically to
// before this feature existed.
const { pool } = require('../config/db');
const { generateLcPdf, generateBonafidePdf } = require('./certificatePdf');
const { generateIdCardPdf } = require('./idCardPdf');
const { renderFromTemplate } = require('./templateRenderer');

async function getActiveTemplate(schoolId, docType) {
  const [templates] = await pool.query(
    `SELECT * FROM certificate_templates WHERE school_id = ? AND doc_type = ? AND is_active = 1 AND deleted_at IS NULL LIMIT 1`,
    [schoolId, docType]
  );
  const template = templates[0];
  if (!template) return null;
  const [fields] = await pool.query(
    `SELECT * FROM template_fields WHERE template_id = ? ORDER BY sort_order ASC, created_at ASC`,
    [template.id]
  );
  return { template, fields };
}

/**
 * Drop-in replacement for calling generateLcPdf/generateBonafidePdf/
 * generateIdCardPdf directly. Same argument shape as those three functions
 * combined, plus `type`.
 */
async function renderCertificatePdf(args) {
  const { type, school } = args;
  const active = await getActiveTemplate(school.id, type);

  if (active) {
    const lc = type === 'lc'
      ? { dateOfLeaving: args.dateOfLeaving, sinceWhen: args.sinceWhen, reasonForLeaving: args.reasonForLeaving, remarks: args.remarks }
      : undefined;
    await renderFromTemplate({
      template: active.template,
      fields: active.fields,
      docType: type,
      school: args.school,
      student: args.student,
      certificate: args.certificate,
      lc,
      outputPath: args.outputPath,
      photoPath: args.photoPath,
      previewMode: false,
    });
    return args.outputPath;
  }

  if (type === 'idcard') return generateIdCardPdf(args);
  if (type === 'lc') return generateLcPdf(args);
  if (type === 'bonafide') return generateBonafidePdf(args);
  throw new Error(`Unknown certificate type: ${type}`);
}

module.exports = { renderCertificatePdf, getActiveTemplate };
