const XLSX = require('xlsx');
const fs = require('fs');

// ---------------------------------------------------------------
// EXPORT
// ---------------------------------------------------------------

function buildExcelBuffer(rows, columns, sheetName = 'Sheet1') {
  const headers = columns.map(c => c.header);
  const data = rows.map(row => columns.map(c => formatExportValue(row[c.field], c.type)));
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function buildCsvString(rows, columns) {
  const headers = columns.map(c => c.header);
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach(row => {
    lines.push(columns.map(c => csvEscape(formatExportValue(row[c.field], c.type))).join(','));
  });
  return lines.join('\n');
}

function csvEscape(value) {
  const str = String(value === null || value === undefined ? '' : value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatExportValue(value, type) {
  if (value === null || value === undefined) return '';
  if (type === 'date' && value) return new Date(value).toLocaleDateString('en-IN');
  if (type === 'datetime' && value) return new Date(value).toLocaleString('en-IN');
  if (type === 'currency' && value !== '') return Number(value).toFixed(2);
  if (type === 'boolean') return value ? 'Yes' : 'No';
  return value;
}

function sendExport(res, options) {
  const rows = options.rows, columns = options.columns, filename = options.filename, format = options.format || 'excel';
  if (format === 'csv') {
    const csv = buildCsvString(rows, columns);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send('\uFEFF' + csv);
  } else {
    const buffer = buildExcelBuffer(rows, columns, filename);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  }
}

// ---------------------------------------------------------------
// IMPORT
// ---------------------------------------------------------------

function buildTemplateBuffer(columns, sampleRow, sheetName = 'Sheet1') {
  const headers = columns.map(c => c.header);
  const worksheet = XLSX.utils.aoa_to_sheet([headers, sampleRow || []]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function readImportFile(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
}

function validateImportRows(rawRows, columns, options) {
  const maxRows = (options && options.maxRows) || 1000;

  if (rawRows.length === 0) {
    return { validRows: [], errors: [{ row: 0, field: null, message: 'The uploaded file has no data rows' }], tooMany: false };
  }
  if (rawRows.length > maxRows) {
    return { validRows: [], errors: [], tooMany: true, maxRows };
  }

  const validRows = [];
  const errors = [];

  rawRows.forEach((raw, i) => {
    const rowNum = i + 2;
    const record = {};
    let rowHasError = false;

    for (const col of columns) {
      let value = raw[col.header];
      if (typeof value === 'string') value = value.trim();

      if (col.required && (value === '' || value === undefined || value === null)) {
        errors.push({ row: rowNum, field: col.header, message: `${col.header} is required` });
        rowHasError = true;
        continue;
      }
      if (value !== '' && col.validate) {
        const errMsg = col.validate(value, raw);
        if (errMsg) {
          errors.push({ row: rowNum, field: col.header, message: errMsg });
          rowHasError = true;
          continue;
        }
      }
      record[col.field] = col.transform ? col.transform(value) : (value === '' ? null : value);
    }

    if (!rowHasError) validRows.push({ rowNum, record });
  });

  return { validRows, errors, tooMany: false };
}

function buildErrorReportBuffer(errors) {
  const headers = ['Row', 'Field', 'Error'];
  const data = errors.map(e => [e.row, e.field || '-', e.message]);
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Errors');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function cleanupUploadedFile(filePath) {
  if (filePath) fs.unlink(filePath, () => {});
}

module.exports = {
  buildExcelBuffer: buildExcelBuffer,
  buildCsvString: buildCsvString,
  sendExport: sendExport,
  buildTemplateBuffer: buildTemplateBuffer,
  readImportFile: readImportFile,
  validateImportRows: validateImportRows,
  buildErrorReportBuffer: buildErrorReportBuffer,
  cleanupUploadedFile: cleanupUploadedFile
};
