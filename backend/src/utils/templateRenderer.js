// Renders a certificate PDF from a School Admin's uploaded, field-mapped
// template instead of the platform's default layout. Reuses the exact data
// resolution / text-fit helpers already used by the default renderer
// (certificatePdf.js) rather than reimplementing them, and reuses the same
// QR-generation call (qrPayload.js + qrcode) at whatever position the admin
// configured instead of a hardcoded one.
//
// Only ever called when an ACTIVE template exists for a school+doc type
// (see certificateRenderDispatch.js) — a school with no active template
// never touches this file at all.
const PDFDocument = require('pdfkit');
const fs = require('fs');
const QRCode = require('qrcode');
const { buildVerifyUrl } = require('./qrPayload');
const { fmtDate, dobInWords, safe, sentenceCase } = require('./certificatePdf');
const { restoreIfMissing } = require('./fileStore');
const { toPdfSafe } = require('./imageConvert');

const TYPE_LABELS = { lc: 'Leaving Certificate', bonafide: 'Bonafide Certificate', idcard: 'Student ID Card' };

// field_key -> resolved display value. Mirrors the exact expressions already
// used inline in certificatePdf.js/idCardPdf.js (e.g. the current-class
// fallback pattern) rather than inventing new business rules — see
// templateFieldDetector.js's FIELD_VOCABULARY for the matching label list,
// which must stay in sync with this switch.
function resolveFieldValue(fieldKey, ctx) {
  const { student, school, certificate, lc, docType } = ctx;
  switch (fieldKey) {
    case 'student.full_name': return safe(student.full_name);
    case 'student.mother_name': return safe(student.mother_name, '-');
    case 'student.father_name': return safe(student.father_name, '-');
    case 'student.caste': return [student.religion, student.caste].filter(Boolean).join(' - ') || '-';
    case 'student.nationality': return safe(student.nationality, 'Indian');
    case 'student.dob': return fmtDate(student.dob);
    case 'student.dob_words': return dobInWords(student.dob);
    case 'student.birth_place': return [student.birth_village, student.birth_taluka, student.birth_district].filter(Boolean).join(', ') || '-';
    case 'student.admission_date': return fmtDate(student.admission_date);
    case 'student.prev_school': return safe(student.prev_school || student.previous_school, '-');
    case 'student.class_display': {
      const std = safe(student.current_standard || student.admission_standard);
      const div = safe(student.current_division || student.admission_division);
      return div ? `${std} standard (${div})` : `${std} standard`;
    }
    case 'student.current_standard': return safe(student.current_standard || student.admission_standard);
    case 'student.current_division': return safe(student.current_division || student.admission_division);
    case 'student.register_number': return safe(student.register_number, '-');
    case 'student.serial_id': return safe(student.serial_id, '-');
    case 'student.aadhaar_masked': return student.aadhaar ? 'XXXX-XXXX-' + String(student.aadhaar).slice(-4) : '-';
    case 'student.roll_number': return safe(student.roll_number, '-');
    case 'student.gender': return sentenceCase(student.gender, '-');
    case 'student.academic_year': return safe(student.academic_year, '-');
    case 'lc.leaving_date': return lc?.dateOfLeaving ? fmtDate(lc.dateOfLeaving) : '';
    case 'lc.since_when': return lc?.sinceWhen ? fmtDate(lc.sinceWhen) : fmtDate(student.admission_date);
    case 'lc.reason_for_leaving': return safe(lc?.reasonForLeaving);
    case 'lc.remarks': return safe(lc?.remarks);
    case 'lc.progress': return 'Good';
    case 'lc.conduct': return 'Good';
    case 'school.name': return safe(school.name);
    case 'school.city': return safe(school.city || school.village, '-');
    case 'school.village': return safe(school.village, '-');
    case 'school.taluka': return safe(school.taluka, '-');
    case 'school.district': return safe(school.district, '-');
    case 'school.udise_code': return safe(school.udise_code, '-');
    case 'school.recog_no': return safe(school.recog_no, '-');
    case 'school.principal_name': return safe(school.principal_name, '-');
    case 'certificate.serial_number': return safe(certificate.serial_number);
    case 'certificate.type_label': return TYPE_LABELS[docType] || docType;
    default: return '';
  }
}

// Shrinks font size until the text fits the box (wrapping first, single
// line if it already fits), never below minFontSize — then draws with
// ellipsis as a final overflow guard so text can never spill into a
// neighboring field, generalizing the shrink-loop pattern already used in
// certificatePdf.js's renderSingleBonafide.
function fitTextInBox(doc, text, box, maxFontSize, color, bold, align = 'left') {
  const fontName = bold ? 'Helvetica-Bold' : 'Helvetica';
  const minFontSize = 6;
  let fontSize = maxFontSize;
  doc.font(fontName);
  while (fontSize > minFontSize) {
    doc.fontSize(fontSize);
    if (doc.heightOfString(text, { width: box.width, align }) <= box.height) break;
    fontSize -= 0.5;
  }
  doc.fontSize(fontSize).fillColor(color)
    .text(text, box.x, box.y, { width: box.width, height: box.height, align, ellipsis: true });
}

// Aspect-ratio-preserving photo draw — pdfkit's `fit` option scales the
// image down to fit within [w,h] without distortion and centers it, so a
// portrait or landscape photo never gets stretched into a mismatched box.
function drawPhotoFit(doc, x, y, width, height, photoPath) {
  if (!photoPath) return;
  try {
    doc.image(photoPath, x, y, { fit: [width, height], align: 'center', valign: 'center' });
  } catch (e) {
    console.error('[templateRenderer] photo draw failed:', e.message);
  }
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

// Plain rectangle-overlap check across the admin's OWN configured elements
// (text/photo/qr against each other, and against manually-marked protected
// zones). Deliberately does NOT attempt to detect collision against the
// actual printed pixels of the uploaded artwork — that would need image
// segmentation, which is out of scope; this only knows about rectangles the
// admin has explicitly told it about.
function checkFieldCollisions(fields) {
  const dynamic = fields.filter(f => ['text', 'photo', 'qr'].includes(f.field_type));
  const zones = fields.filter(f => f.field_type === 'protected_zone');
  const warnings = [];
  for (let i = 0; i < dynamic.length; i++) {
    for (let j = i + 1; j < dynamic.length; j++) {
      if (rectsOverlap(dynamic[i], dynamic[j])) {
        warnings.push({ type: 'field-field', a: dynamic[i].label || dynamic[i].field_key, b: dynamic[j].label || dynamic[j].field_key });
      }
    }
    for (const z of zones) {
      if (rectsOverlap(dynamic[i], z)) {
        warnings.push({ type: 'field-protected-zone', a: dynamic[i].label || dynamic[i].field_key, b: z.label || 'Protected zone' });
      }
    }
  }
  return warnings;
}

/**
 * @param {object} template  a certificate_templates row (background_url/data, page_width_pt/height_pt)
 * @param {object[]} fields  its template_fields rows
 * @param {'lc'|'bonafide'|'idcard'} docType
 * @param {object} school
 * @param {object} student
 * @param {object} certificate  needs at least { id, serial_number }
 * @param {object} [lc]  { dateOfLeaving, sinceWhen, reasonForLeaving, remarks } — LC-only
 * @param {string} outputPath
 * @param {string} [photoPath]
 * @param {boolean} [previewMode]  outlines every field + protected zones (test-generate only, never on real issued PDFs)
 * @returns {Promise<{ outputPath: string, collisions: Array }>}
 */
async function renderFromTemplate({ template, fields, docType, school, student, certificate, lc, outputPath, photoPath, previewMode = false }) {
  const safePhotoPath = photoPath ? await toPdfSafe(photoPath) : null;

  if (template.background_url) {
    restoreIfMissing(template.background_url, template.background_data);
  }

  const qrBuffer = await QRCode.toBuffer(buildVerifyUrl(certificate.id), {
    width: 300, margin: 1, errorCorrectionLevel: 'H',
  }).catch(err => {
    console.error('[templateRenderer] QR generation failed:', err.message);
    return null;
  });

  const collisions = checkFieldCollisions(fields);
  const pageWidth = Number(template.page_width_pt);
  const pageHeight = Number(template.page_height_pt);
  const ctx = { student, school, certificate, docType, lc };

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: [pageWidth, pageHeight], margin: 0 });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      if (template.background_url && fs.existsSync(template.background_url)) {
        doc.image(template.background_url, 0, 0, { width: pageWidth, height: pageHeight });
      }

      for (const field of fields) {
        const box = { x: Number(field.x), y: Number(field.y), width: Number(field.width), height: Number(field.height) };

        if (field.field_type === 'protected_zone') {
          if (previewMode) {
            doc.save().dash(3, { space: 2 }).rect(box.x, box.y, box.width, box.height)
              .strokeColor('#f59e0b').lineWidth(1).stroke().undash().restore();
          }
          continue;
        }
        if (field.field_type === 'photo') {
          drawPhotoFit(doc, box.x, box.y, box.width, box.height, safePhotoPath);
          if (previewMode) doc.save().rect(box.x, box.y, box.width, box.height).strokeColor('#94a3b8').lineWidth(0.5).stroke().restore();
          continue;
        }
        if (field.field_type === 'qr') {
          if (qrBuffer) doc.image(qrBuffer, box.x, box.y, { width: box.width, height: box.height });
          continue;
        }
        // text
        const value = field.field_key === 'static_text' ? safe(field.static_text) : resolveFieldValue(field.field_key, ctx);
        if (!value) continue;
        fitTextInBox(doc, value, box, Number(field.font_size) || 11, field.color || '#1a1a1a', field.font_weight === 'bold', field.align || 'left');
        if (previewMode) doc.save().rect(box.x, box.y, box.width, box.height).strokeColor('#93c5fd').lineWidth(0.5).stroke().restore();
      }

      doc.end();
      stream.on('finish', () => resolve({ outputPath, collisions }));
      stream.on('error', reject);
    } catch (e) { reject(e); }
  });
}

module.exports = { renderFromTemplate, checkFieldCollisions, resolveFieldValue, TYPE_LABELS };
