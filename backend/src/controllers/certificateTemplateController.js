const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const { pool } = require('../config/db');
const { UPLOAD_ROOT } = require('../middleware/upload');
const { rasterizePdfFirstPage } = require('../utils/templatePdfRasterizer');
const { detectFields } = require('../utils/templateFieldDetector');
const { renderFromTemplate } = require('../utils/templateRenderer');
const { restoreIfMissing } = require('../utils/fileStore');
const { deleteSchoolPdfs } = require('./schoolController');

const DOC_TYPES = ['lc', 'bonafide', 'idcard'];

function assertDocType(docType, res) {
  if (!DOC_TYPES.includes(docType)) {
    res.status(400).json({ error: 'doc_type must be one of: lc, bonafide, idcard' });
    return false;
  }
  return true;
}

// GET a template row scoped to req.schoolId — the single place every
// endpoint below resolves "does this template belong to me", so a School
// Admin can never touch another school's template by guessing/incrementing
// an ID (same pattern as this session's earlier cross-tenant audit).
async function getOwnedTemplate(templateId, schoolId) {
  const [rows] = await pool.query(
    `SELECT * FROM certificate_templates WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
    [templateId, schoolId]
  );
  return rows[0] || null;
}

// POST /api/certificate-templates/:docType
async function uploadTemplate(req, res) {
  try {
    const docType = String(req.params.docType || '').toLowerCase();
    if (!assertDocType(docType, res)) return;
    if (!req.file) return res.status(400).json({ error: 'A PDF, PNG, or JPEG template file is required.' });

    const { name, version } = req.body;
    const sourceBuffer = fs.readFileSync(req.file.path);
    const isPdf = req.file.mimetype === 'application/pdf';
    const sourceFileType = isPdf ? 'pdf' : (req.file.mimetype === 'image/png' ? 'png' : 'jpg');

    let backgroundPath, backgroundBuffer, pageWidthPt, pageHeightPt, pageCount = 1;

    if (isPdf) {
      const raster = await rasterizePdfFirstPage(sourceBuffer);
      backgroundBuffer = raster.pngBuffer;
      pageWidthPt = raster.pageWidthPt;
      pageHeightPt = raster.pageHeightPt;
      pageCount = raster.pageCount;
      backgroundPath = path.join(UPLOAD_ROOT, 'cert-templates', `bg-${uuidv4()}.png`);
      fs.writeFileSync(backgroundPath, backgroundBuffer);
    } else {
      // Image upload: the file itself IS the background. Treat 1 pixel as
      // 1 pdfkit point so the generated page always exactly matches the
      // uploaded image's proportions, with no assumed physical DPI.
      const meta = await sharp(sourceBuffer).metadata();
      pageWidthPt = meta.width;
      pageHeightPt = meta.height;
      backgroundBuffer = sourceBuffer;
      backgroundPath = req.file.path;
    }

    const id = uuidv4();
    await pool.query(
      `INSERT INTO certificate_templates
       (id, school_id, doc_type, name, version, source_file_url, source_file_data, source_file_type,
        background_url, background_data, page_width_pt, page_height_pt, page_count, orientation,
        analysis_status, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'draft', ?)`,
      [id, req.schoolId, docType, name || null, version || null, req.file.path, sourceBuffer, sourceFileType,
       backgroundPath, backgroundBuffer, pageWidthPt, pageHeightPt, pageCount,
       pageWidthPt >= pageHeightPt ? 'landscape' : 'portrait', req.user.id]
    );

    const [rows] = await pool.query('SELECT * FROM certificate_templates WHERE id = ?', [id]);
    const { source_file_data, background_data, ...safeTemplate } = rows[0];
    res.status(201).json({ template: safeTemplate });
  } catch (err) {
    console.error('uploadTemplate error:', err.message);
    res.status(500).json({ error: 'Template processing failed. Please try again with a clear PDF/PNG/JPEG file.' });
  }
}

// POST /api/certificate-templates/:id/analyze
async function analyzeTemplate(req, res) {
  try {
    const template = await getOwnedTemplate(req.params.id, req.schoolId);
    if (!template) return res.status(404).json({ error: 'Template not found' });

    await pool.query(`UPDATE certificate_templates SET analysis_status = 'processing' WHERE id = ?`, [template.id]);

    try {
      restoreIfMissing(template.background_url, template.background_data);
      const buf = fs.existsSync(template.background_url) ? fs.readFileSync(template.background_url) : template.background_data;
      const meta = await sharp(buf).metadata();

      const suggestions = await detectFields(buf, {
        pageWidthPt: Number(template.page_width_pt),
        pageHeightPt: Number(template.page_height_pt),
        imagePixelWidth: meta.width,
        imagePixelHeight: meta.height,
      });

      if (suggestions.length === 0) {
        await pool.query(
          `UPDATE certificate_templates SET analysis_status = 'done', analysis_error = ? WHERE id = ?`,
          ['No recognizable fields were detected automatically. Please add fields manually in the editor.', template.id]
        );
      } else {
        // Never overwrite fields the admin has already confirmed — only
        // fill in suggestions for slots not yet covered by a confirmed row.
        const [existing] = await pool.query(
          `SELECT field_key FROM template_fields WHERE template_id = ? AND is_confirmed = 1`,
          [template.id]
        );
        const confirmedKeys = new Set(existing.map(r => r.field_key));
        const toInsert = suggestions.filter(s => !confirmedKeys.has(s.field_key));

        for (const f of toInsert) {
          await pool.query(
            `INSERT INTO template_fields (id, template_id, field_type, field_key, label, x, y, width, height, source, confidence)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [uuidv4(), template.id, f.field_type, f.field_key, f.label, f.x, f.y, f.width, f.height, f.source, f.confidence]
          );
        }
        await pool.query(`UPDATE certificate_templates SET analysis_status = 'done', analysis_error = NULL WHERE id = ?`, [template.id]);
      }
    } catch (analyzeErr) {
      console.error('analyzeTemplate processing error:', analyzeErr.message);
      await pool.query(
        `UPDATE certificate_templates SET analysis_status = 'failed', analysis_error = ? WHERE id = ?`,
        ['Unable to analyze this template. Please upload a clearer PDF/image, or map fields manually.', template.id]
      );
    }

    const [rows] = await pool.query('SELECT * FROM certificate_templates WHERE id = ?', [template.id]);
    const { source_file_data, background_data, ...safeTemplate } = rows[0];
    const [fields] = await pool.query('SELECT * FROM template_fields WHERE template_id = ? ORDER BY sort_order, created_at', [template.id]);
    res.json({ template: safeTemplate, fields });
  } catch (err) {
    console.error('analyzeTemplate error:', err.message);
    res.status(500).json({ error: 'Server error analyzing template' });
  }
}

// GET /api/certificate-templates?docType=lc
async function listTemplates(req, res) {
  try {
    const { docType } = req.query;
    const params = [req.schoolId];
    let query = `SELECT id, school_id, doc_type, name, version, source_file_type, page_width_pt, page_height_pt,
                        orientation, analysis_status, analysis_error, status, is_active, created_at, updated_at
                 FROM certificate_templates WHERE school_id = ? AND deleted_at IS NULL`;
    if (docType) { query += ' AND doc_type = ?'; params.push(docType); }
    query += ' ORDER BY created_at DESC';
    const [rows] = await pool.query(query, params);
    res.json({ templates: rows });
  } catch (err) {
    console.error('listTemplates error:', err.message);
    res.status(500).json({ error: 'Server error listing templates' });
  }
}

// GET /api/certificate-templates/:id
async function getTemplate(req, res) {
  try {
    const template = await getOwnedTemplate(req.params.id, req.schoolId);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    const [fields] = await pool.query('SELECT * FROM template_fields WHERE template_id = ? ORDER BY sort_order, created_at', [template.id]);
    const { source_file_data, background_data, ...safeTemplate } = template;
    res.json({ template: safeTemplate, fields });
  } catch (err) {
    console.error('getTemplate error:', err.message);
    res.status(500).json({ error: 'Server error fetching template' });
  }
}

// PUT /api/certificate-templates/:id/fields — bulk replace
async function saveFields(req, res) {
  const conn = await pool.getConnection();
  try {
    const template = await getOwnedTemplate(req.params.id, req.schoolId);
    if (!template) { conn.release(); return res.status(404).json({ error: 'Template not found' }); }

    const fields = Array.isArray(req.body.fields) ? req.body.fields : [];
    await conn.beginTransaction();
    await conn.query('DELETE FROM template_fields WHERE template_id = ?', [template.id]);
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (!['text', 'photo', 'qr', 'protected_zone'].includes(f.field_type)) continue;
      await conn.query(
        `INSERT INTO template_fields
         (id, template_id, field_type, field_key, static_text, label, x, y, width, height, font_size, font_weight, align, color, source, confidence, is_confirmed, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [f.id || uuidv4(), template.id, f.field_type, f.field_key || null, f.static_text || null, f.label || null,
         f.x, f.y, f.width, f.height, f.font_size || 11, f.font_weight || 'normal', f.align || 'left', f.color || '#1a1a1a',
         f.source || 'manual', f.confidence ?? null, i]
      );
    }
    await conn.commit();

    const [saved] = await pool.query('SELECT * FROM template_fields WHERE template_id = ? ORDER BY sort_order', [template.id]);
    res.json({ fields: saved });
  } catch (err) {
    await conn.rollback();
    console.error('saveFields error:', err.message);
    res.status(500).json({ error: 'Server error saving field mapping' });
  } finally {
    conn.release();
  }
}

// Synthetic sample data for test-generate — never a real student/school
// record, never touches students/certificates/commission_ledger.
function sampleContext(docType, school) {
  return {
    student: {
      full_name: 'Sample Student Name', mother_name: 'Sample Mother Name', father_name: 'Sample Father Name',
      religion: 'Hindu', caste: 'General', sub_caste: '', nationality: 'Indian',
      dob: '2012-06-15', birth_village: 'Sample Village', birth_taluka: 'Sample Taluka', birth_district: 'Sample District',
      admission_date: '2018-06-01', prev_school: 'Sample Previous School',
      current_standard: '8', current_division: 'A', admission_standard: '5', admission_division: 'A',
      register_number: 'GR-SAMPLE-001', serial_id: 'SARAL-SAMPLE-001', aadhaar: '000011112222',
      roll_number: '12', gender: 'male', academic_year: '2025-26',
    },
    school: school || { name: 'Sample School Name', city: 'Sample City', district: 'Sample District', udise_code: '00000000000' },
    certificate: { id: 'sample-preview-certificate', serial_number: `${docType.toUpperCase()}-SAMPLE-0001` },
    lc: { dateOfLeaving: new Date(), sinceWhen: '2018-06-01', reasonForLeaving: 'Sample reason for leaving', remarks: 'Sample remark' },
  };
}

// POST /api/certificate-templates/:id/test-generate
async function testGenerate(req, res) {
  try {
    const template = await getOwnedTemplate(req.params.id, req.schoolId);
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const [fields] = await pool.query('SELECT * FROM template_fields WHERE template_id = ? ORDER BY sort_order', [template.id]);
    if (fields.length === 0) return res.status(400).json({ error: 'No fields configured yet. Add and save at least one field before test-generating.' });

    const [schoolRows] = await pool.query('SELECT * FROM schools WHERE id = ?', [req.schoolId]);
    const sample = sampleContext(template.doc_type, schoolRows[0]);

    const tmpPath = path.join(UPLOAD_ROOT, 'cert-templates', `preview-${uuidv4()}.pdf`);
    const { collisions } = await renderFromTemplate({
      template, fields, docType: template.doc_type,
      school: sample.school, student: sample.student, certificate: sample.certificate, lc: sample.lc,
      outputPath: tmpPath, photoPath: null, previewMode: true,
    });

    const pdfBase64 = fs.readFileSync(tmpPath).toString('base64');
    fs.unlink(tmpPath, () => {});
    res.json({ pdfBase64, collisions });
  } catch (err) {
    console.error('testGenerate error:', err.message);
    res.status(500).json({ error: 'Unable to generate a preview. Please check the field mapping and try again.' });
  }
}

// PUT /api/certificate-templates/:id/activate
async function activateTemplate(req, res) {
  try {
    const template = await getOwnedTemplate(req.params.id, req.schoolId);
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const [fieldCount] = await pool.query('SELECT COUNT(*) as c FROM template_fields WHERE template_id = ?', [template.id]);
    if (Number(fieldCount[0].c) === 0) {
      return res.status(400).json({ error: 'Cannot activate a template with no mapped fields.' });
    }

    await pool.query('UPDATE certificate_templates SET is_active = 0 WHERE school_id = ? AND doc_type = ?', [req.schoolId, template.doc_type]);
    await pool.query(`UPDATE certificate_templates SET is_active = 1, status = 'active' WHERE id = ?`, [template.id]);
    deleteSchoolPdfs(req.schoolId, [template.doc_type]).catch(() => {});

    const [rows] = await pool.query('SELECT * FROM certificate_templates WHERE id = ?', [template.id]);
    const { source_file_data, background_data, ...safeTemplate } = rows[0];
    res.json({ template: safeTemplate, message: 'Template activated. New certificates of this type will use it.' });
  } catch (err) {
    console.error('activateTemplate error:', err.message);
    res.status(500).json({ error: 'Server error activating template' });
  }
}

// PUT /api/certificate-templates/:id/deactivate
async function deactivateTemplate(req, res) {
  try {
    const template = await getOwnedTemplate(req.params.id, req.schoolId);
    if (!template) return res.status(404).json({ error: 'Template not found' });

    await pool.query(`UPDATE certificate_templates SET is_active = 0, status = 'draft' WHERE id = ?`, [template.id]);
    deleteSchoolPdfs(req.schoolId, [template.doc_type]).catch(() => {});

    res.json({ message: 'Template deactivated. This certificate type reverts to the default design.' });
  } catch (err) {
    console.error('deactivateTemplate error:', err.message);
    res.status(500).json({ error: 'Server error deactivating template' });
  }
}

// DELETE /api/certificate-templates/:id
async function deleteTemplate(req, res) {
  try {
    const template = await getOwnedTemplate(req.params.id, req.schoolId);
    if (!template) return res.status(404).json({ error: 'Template not found' });

    await pool.query('UPDATE certificate_templates SET deleted_at = NOW(), is_active = 0 WHERE id = ?', [template.id]);
    if (template.is_active) deleteSchoolPdfs(req.schoolId, [template.doc_type]).catch(() => {});

    res.json({ message: 'Template deleted.' });
  } catch (err) {
    console.error('deleteTemplate error:', err.message);
    res.status(500).json({ error: 'Server error deleting template' });
  }
}

module.exports = {
  uploadTemplate, analyzeTemplate, listTemplates, getTemplate, saveFields,
  testGenerate, activateTemplate, deactivateTemplate, deleteTemplate,
};
