const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');
const { sendExport, buildTemplateBuffer, readImportFile, validateImportRows, buildErrorReportBuffer, cleanupUploadedFile } = require('../utils/importExport');

const VALID_CATEGORIES = ['standard', 'division', 'district', 'taluka', 'city', 'medium', 'religion', 'caste', 'grant_type', 'board_name', 'management_type'];

// GET /api/master-data?category=district (optional filter; omit to get all, grouped)
async function listMasterData(req, res) {
  try {
    const { category } = req.query;
    if (category) {
      if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });
      const [rows] = await pool.query(
        'SELECT * FROM master_data WHERE category = ? AND is_active = 1 ORDER BY display_order ASC',
        [category]
      );
      return res.json({ items: rows });
    }

    const [rows] = await pool.query('SELECT * FROM master_data WHERE is_active = 1 ORDER BY category, display_order ASC');
    const grouped = {};
    VALID_CATEGORIES.forEach(c => { grouped[c] = []; });
    rows.forEach(row => { grouped[row.category].push(row); });
    res.json({ categories: grouped });
  } catch (err) {
    console.error('listMasterData error:', err.message);
    res.status(500).json({ error: 'Server error fetching master data' });
  }
}

// POST /api/master-data (superAdmin)
async function createMasterData(req, res) {
  try {
    const { category, value } = req.body;
    if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });
    if (!value || !value.trim()) return res.status(400).json({ error: 'Value is required' });
    const trimmedValue = value.trim();

    // Only check uniqueness among ACTIVE items - a previously soft-deleted
    // item with the same value must not block re-adding it. If an inactive
    // row with this exact value exists, reactivate it instead of inserting
    // a second row (avoids quietly accumulating duplicate dead rows).
    const [activeMatch] = await pool.query(
      'SELECT id FROM master_data WHERE category = ? AND value = ? AND is_active = 1',
      [category, trimmedValue]
    );
    if (activeMatch.length > 0) {
      return res.status(409).json({ error: 'This value already exists in this category' });
    }

    const [inactiveMatch] = await pool.query(
      'SELECT id FROM master_data WHERE category = ? AND value = ? AND is_active = 0 LIMIT 1',
      [category, trimmedValue]
    );
    if (inactiveMatch.length > 0) {
      await pool.query('UPDATE master_data SET is_active = 1 WHERE id = ?', [inactiveMatch[0].id]);
      const [rows] = await pool.query('SELECT * FROM master_data WHERE id = ?', [inactiveMatch[0].id]);
      return res.status(201).json({ item: rows[0] });
    }

    const [countRows] = await pool.query('SELECT COUNT(*) as count FROM master_data WHERE category = ? AND is_active = 1', [category]);
    const id = uuidv4();
    await pool.query(
      'INSERT INTO master_data (id, category, value, display_order) VALUES (?, ?, ?, ?)',
      [id, category, trimmedValue, countRows[0].count]
    );
    const [rows] = await pool.query('SELECT * FROM master_data WHERE id = ?', [id]);
    res.status(201).json({ item: rows[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This value already exists in this category' });
    console.error('createMasterData error:', err.message);
    res.status(500).json({ error: 'Server error creating master data item' });
  }
}

// PUT /api/master-data/:id (superAdmin)
async function updateMasterData(req, res) {
  try {
    const { value, is_active } = req.body;
    const updates = [];
    const values = [];
    if (value !== undefined) { updates.push('value = ?'); values.push(value); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields provided to update' });

    values.push(req.params.id);
    const [result] = await pool.query(`UPDATE master_data SET ${updates.join(', ')} WHERE id = ?`, values);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Item not found' });

    const [rows] = await pool.query('SELECT * FROM master_data WHERE id = ?', [req.params.id]);
    res.json({ item: rows[0] });
  } catch (err) {
    console.error('updateMasterData error:', err.message);
    res.status(500).json({ error: 'Server error updating master data item' });
  }
}

// DELETE /api/master-data/:id (superAdmin) - soft delete via is_active flag
async function deleteMasterData(req, res) {
  try {
    const [result] = await pool.query('UPDATE master_data SET is_active = 0 WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Item not found' });
    res.json({ message: 'Item removed' });
  } catch (err) {
    console.error('deleteMasterData error:', err.message);
    res.status(500).json({ error: 'Server error deleting master data item' });
  }
}

module.exports = {
  listMasterData, createMasterData, updateMasterData, deleteMasterData, VALID_CATEGORIES,
  exportMasterData, downloadMasterDataTemplate, importMasterData
};

const MASTER_DATA_EXPORT_COLUMNS = [
  { header: 'Category', field: 'category' },
  { header: 'Value', field: 'value' },
  { header: 'Display Order', field: 'display_order' },
  { header: 'Active', field: 'is_active', type: 'boolean' }
];

// GET /api/master-data/export?format=excel|csv&category=district
async function exportMasterData(req, res) {
  try {
    const { format, category } = req.query;
    let query = 'SELECT * FROM master_data';
    const params = [];
    if (category) { query += ' WHERE category = ?'; params.push(category); }
    query += ' ORDER BY category, display_order ASC';

    const [rows] = await pool.query(query, params);
    sendExport(res, { rows, columns: MASTER_DATA_EXPORT_COLUMNS, filename: `master-data-export-${Date.now()}`, format });
  } catch (err) {
    console.error('exportMasterData error:', err.message);
    res.status(500).json({ error: 'Server error exporting master data' });
  }
}

const MASTER_DATA_IMPORT_COLUMNS = [
  { header: 'Category', field: 'category', required: true, validate: (v) => VALID_CATEGORIES.includes(v) ? null : `Category must be one of: ${VALID_CATEGORIES.join(', ')}` },
  { header: 'Value', field: 'value', required: true }
];

// GET /api/master-data/import-template
async function downloadMasterDataTemplate(req, res) {
  try {
    const buffer = buildTemplateBuffer(MASTER_DATA_IMPORT_COLUMNS, ['standard', '13th'], 'MasterData');
    res.setHeader('Content-Disposition', 'attachment; filename="master-data-import-template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    console.error('downloadMasterDataTemplate error:', err.message);
    res.status(500).json({ error: 'Server error generating template' });
  }
}

// POST /api/master-data/import - bulk import with preview-style validation,
// duplicate detection (skips values that already exist as active items in
// that category), and a downloadable error report for anything that failed.
async function importMasterData(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const rawRows = readImportFile(req.file.path);
    const { validRows, errors, tooMany, maxRows } = validateImportRows(rawRows, MASTER_DATA_IMPORT_COLUMNS, { maxRows: 1000 });

    if (tooMany) {
      cleanupUploadedFile(req.file.path);
      return res.status(400).json({ error: `Maximum ${maxRows} rows per import. Please split into smaller files.` });
    }

    let created = 0, duplicates = 0, failed = errors.length;
    const rowErrors = [...errors];

    for (const { rowNum, record } of validRows) {
      try {
        const [activeMatch] = await pool.query(
          'SELECT id FROM master_data WHERE category = ? AND value = ? AND is_active = 1',
          [record.category, record.value]
        );
        if (activeMatch.length > 0) {
          duplicates++;
          continue;
        }
        const [inactiveMatch] = await pool.query(
          'SELECT id FROM master_data WHERE category = ? AND value = ? AND is_active = 0 LIMIT 1',
          [record.category, record.value]
        );
        if (inactiveMatch.length > 0) {
          await pool.query('UPDATE master_data SET is_active = 1 WHERE id = ?', [inactiveMatch[0].id]);
        } else {
          const [countRows] = await pool.query('SELECT COUNT(*) as count FROM master_data WHERE category = ? AND is_active = 1', [record.category]);
          await pool.query(
            'INSERT INTO master_data (id, category, value, display_order) VALUES (?, ?, ?, ?)',
            [uuidv4(), record.category, record.value, countRows[0].count]
          );
        }
        created++;
      } catch (rowErr) {
        failed++;
        rowErrors.push({ row: rowNum, field: null, message: rowErr.message });
      }
    }

    cleanupUploadedFile(req.file.path);

    res.json({
      created, duplicates, failed,
      successCount: created,
      failedCount: failed,
      duplicateCount: duplicates,
      errors: rowErrors,
      hasErrorReport: rowErrors.length > 0
    });
  } catch (err) {
    cleanupUploadedFile(req.file ? req.file.path : null);
    console.error('importMasterData error:', err.message);
    res.status(500).json({ error: 'Server error processing import file. Make sure it is a valid .xlsx or .csv file.' });
  }
}
