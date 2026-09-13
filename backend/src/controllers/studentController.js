const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const XLSX = require('xlsx');
const { pool } = require('../config/db');

// Whitelist of columns that can be sorted on - never interpolate the raw
// query param directly into SQL (that would be a SQL injection vector).
const SORTABLE_STUDENT_FIELDS = ['full_name', 'register_number', 'admission_standard', 'admission_division', 'created_at', 'dob'];

async function listStudents(req, res) {
  try {
    const { search, standard, division, gender } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    // Capped at 5000 rather than a small page size — school-scoped lists
    // (unlike platform-wide ones) are small enough that pages needing "all
    // of this school's students" (dashboard counters, the Students list,
    // the certificate-generation student picker) can just ask for
    // everything instead of implementing real pagination UI.
    const limit = Math.min(5000, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const sortBy = SORTABLE_STUDENT_FIELDS.includes(req.query.sortBy) ? req.query.sortBy : 'full_name';
    const sortDir = String(req.query.sortDir).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // Excludes photo_data (raw BLOB bytes) - SELECT * was returning the full
    // binary photo inline as a JSON number array for every student on every
    // page load; the frontend only ever needs photo_url to build an image
    // URL, never the raw bytes.
    let query = `SELECT id, school_id, register_number, serial_id, full_name, mother_name, father_name, gender, dob,
                        aadhaar, religion, caste, sub_caste, nationality, mother_tongue, birth_village, birth_taluka,
                        birth_district, birth_state, birth_country, admission_standard, admission_division,
                        current_standard, current_division, admission_date, prev_school, prev_standard, roll_number,
                        blood_group, parent_mobile, address, apaar_id, student_id_no, pen_no, loc_no,
                        photo_url, created_at, updated_at
                 FROM students WHERE school_id = ?`;
    let countQuery = 'SELECT COUNT(*) as total FROM students WHERE school_id = ?';
    const params = [req.schoolId];
    const countParams = [req.schoolId];

    if (search) {
      query += ' AND (full_name LIKE ? OR register_number LIKE ?)';
      countQuery += ' AND (full_name LIKE ? OR register_number LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
      countParams.push(`%${search}%`, `%${search}%`);
    }
    if (standard) { query += ' AND admission_standard = ?'; countQuery += ' AND admission_standard = ?'; params.push(standard); countParams.push(standard); }
    if (division) { query += ' AND admission_division = ?'; countQuery += ' AND admission_division = ?'; params.push(division); countParams.push(division); }
    if (gender) { query += ' AND gender = ?'; countQuery += ' AND gender = ?'; params.push(gender); countParams.push(gender); }

    query += ` ORDER BY ${sortBy} ${sortDir} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await pool.query(query, params);
    const [countRows] = await pool.query(countQuery, countParams);
    const total = countRows[0].total;

    res.json({
      students: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('listStudents error:', err.message);
    res.status(500).json({ error: 'Server error fetching students' });
  }
}

async function getStudent(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM students WHERE id = ? AND school_id = ?', [req.params.id, req.schoolId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Student not found' });
    res.json({ student: rows[0] });
  } catch (err) {
    console.error('getStudent error:', err.message);
    res.status(500).json({ error: 'Server error fetching student' });
  }
}

const STUDENT_FIELDS = [
  'register_number', 'serial_id', 'full_name', 'mother_name', 'father_name', 'gender', 'dob',
  'aadhaar', 'religion', 'caste', 'sub_caste', 'nationality', 'mother_tongue',
  'birth_village', 'birth_taluka', 'birth_district', 'birth_state', 'birth_country',
  'admission_standard', 'admission_division', 'current_standard', 'current_division',
  'admission_date', 'prev_school', 'prev_standard',
  'roll_number', 'blood_group', 'parent_mobile', 'address',
  'apaar_id', 'student_id_no', 'pen_no', 'loc_no'
];

// Server-side validation for the student identifier fields — never trust
// the frontend's maxLength/pattern alone, since these numbers (Aadhaar
// especially) end up printed on official certificates. Empty/undefined is
// always allowed (these fields are optional; a school may not have every
// number for every student, especially older records — see backward
// compatibility requirement).
function validateStudentIdentifiers(body) {
  const checks = [
    { field: 'apaar_id', label: 'APAAR ID', pattern: /^\d{12}$/, message: 'APAAR ID must be exactly 12 digits' },
    { field: 'aadhaar', label: 'Aadhaar Number', pattern: /^\d{12}$/, message: 'Aadhaar number must be exactly 12 digits' },
    { field: 'pen_no', label: 'PEN No.', pattern: /^\d{11}$/, message: 'PEN No. must be exactly 11 digits' },
    { field: 'student_id_no', label: 'Student ID', maxLength: 20 },
    { field: 'loc_no', label: 'LOC No.', maxLength: 20 },
  ];
  for (const check of checks) {
    const value = body[check.field];
    if (value === undefined || value === null || String(value).trim() === '') continue;
    const str = String(value).trim();
    if (check.pattern && !check.pattern.test(str)) return check.message;
    if (check.maxLength && str.length > check.maxLength) return `${check.label} must be at most ${check.maxLength} characters`;
  }
  return null;
}

function generateSaralId() {
  const year = new Date().getFullYear();
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `SARAL-${year}-${rand}`;
}

async function createStudent(req, res) {
  try {
    const { full_name } = req.body;

    if (!full_name || !full_name.trim()) {
      return res.status(400).json({
        error: 'Student full name is required'
      });
    }

    const idError = validateStudentIdentifiers(req.body);
    if (idError) return res.status(400).json({ error: idError });

    // Auto-generate Saral ID if not supplied by the user
    if (!req.body.serial_id || String(req.body.serial_id).trim() === '') {
      req.body.serial_id = generateSaralId();
    }

    const id = uuidv4();

    const columns = ['id', 'school_id', ...STUDENT_FIELDS];

    const values = [
      id,
      req.schoolId,
      ...STUDENT_FIELDS.map((field) => {
        let value = req.body[field];

        // Convert undefined, null and empty string to NULL
        if (
          value === undefined ||
          value === null ||
          String(value).trim() === ""
        ) {
          return null;
        }

        // Convert date fields to NULL if invalid
        if (field === "dob" || field === "admission_date") {
          const date = new Date(value);

          if (isNaN(date.getTime())) {
            return null;
          }

          return value;
        }

        return value;
      })
    ];

    if (req.file) {
      const { toJpegPath } = require('../utils/imageConvert');
      const photoPath = await toJpegPath(req.file.path);
      columns.push('photo_url', 'photo_data');
      values.push(photoPath, fs.readFileSync(photoPath));
    }

    console.log("Request Body:", req.body);
    console.log("Insert Values:", values);

    const placeholders = columns.map(() => "?").join(", ");

    await pool.query(
      `INSERT INTO students (${columns.join(", ")})
       VALUES (${placeholders})`,
      values
    );

    const [rows] = await pool.query(
      "SELECT * FROM students WHERE id = ?",
      [id]
    );

    res.status(201).json({
      student: rows[0]
    });

  } catch (err) {
    console.error("createStudent error:", err);

    res.status(500).json({
      error: err.message
    });
  }
}
async function updateStudent(req, res) {
  try {
    const [existing] = await pool.query('SELECT * FROM students WHERE id = ? AND school_id = ?', [req.params.id, req.schoolId]);
    if (existing.length === 0) return res.status(404).json({ error: 'Student not found' });

    const idError = validateStudentIdentifiers(req.body);
    if (idError) return res.status(400).json({ error: idError });

    const updates = [];
    const values = [];
    STUDENT_FIELDS.forEach(field => {
      if (req.body[field] !== undefined) { updates.push(`${field} = ?`); values.push(req.body[field]); }
    });
    if (req.file) {
      const { toJpegPath } = require('../utils/imageConvert');
      const photoPath = await toJpegPath(req.file.path);
      updates.push('photo_url = ?', 'photo_data = ?');
      values.push(photoPath, fs.readFileSync(photoPath));
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields provided to update' });

    values.push(req.params.id, req.schoolId);
    await pool.query(`UPDATE students SET ${updates.join(', ')} WHERE id = ? AND school_id = ?`, values);

    const [rows] = await pool.query('SELECT * FROM students WHERE id = ?', [req.params.id]);
    res.json({ student: rows[0] });
  } catch (err) {
    console.error('updateStudent error:', err.message);
    res.status(500).json({ error: 'Server error updating student' });
  }
}

async function deleteStudent(req, res) {
  try {
    const [result] = await pool.query('DELETE FROM students WHERE id = ? AND school_id = ?', [req.params.id, req.schoolId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Student not found' });
    res.json({ message: 'Student deleted successfully' });
  } catch (err) {
    console.error('deleteStudent error:', err.message);
    res.status(500).json({ error: 'Server error deleting student' });
  }
}

// Column headers expected in the uploaded Excel/CSV file. Kept simple and
// matching the most commonly-required fields so a school admin filling this
// out in Excel doesn't need to know internal field names - just plain
// readable headers in the first row.
// Every field the Student form itself collects (photo excepted — that can't
// go in a spreadsheet cell), in the same order as the form, so the template
// is a complete round-trip of what a school can otherwise only enter one
// student at a time. Date columns are labelled with the format we actually
// require (see parseImportDate) so a school never has to guess.
const IMPORT_COLUMNS = [
  { header: 'Full Name *', field: 'full_name', altHeaders: ['Full Name'] },
  { header: 'Register Number', field: 'register_number' },
  { header: 'Serial ID', field: 'serial_id' },
  { header: "Mother's Name", field: 'mother_name' },
  { header: "Father's Name", field: 'father_name' },
  { header: 'Gender', field: 'gender' },
  { header: 'Date of Birth (DD-MM-YYYY)', field: 'dob', isDate: true, altHeaders: ['DOB (YYYY-MM-DD)'] },
  { header: 'Aadhaar Number', field: 'aadhaar' },
  { header: 'APAAR ID', field: 'apaar_id' },
  { header: 'Student ID', field: 'student_id_no' },
  { header: 'PEN No.', field: 'pen_no' },
  { header: 'LOC No.', field: 'loc_no' },
  { header: 'Religion', field: 'religion' },
  { header: 'Caste', field: 'caste' },
  { header: 'Sub-caste', field: 'sub_caste' },
  { header: 'Nationality', field: 'nationality' },
  { header: 'Mother Tongue', field: 'mother_tongue' },
  { header: 'Birth Village', field: 'birth_village' },
  { header: 'Birth Taluka', field: 'birth_taluka' },
  { header: 'Birth District', field: 'birth_district' },
  { header: 'Birth State', field: 'birth_state' },
  { header: 'Birth Country', field: 'birth_country' },
  { header: 'Previous School Name', field: 'prev_school' },
  { header: 'Previous Standard', field: 'prev_standard' },
  { header: 'Admission Standard', field: 'admission_standard' },
  { header: 'Division', field: 'admission_division' },
  { header: 'Admission Date (DD-MM-YYYY)', field: 'admission_date', isDate: true },
  { header: 'Current Standard', field: 'current_standard' },
  { header: 'Current Division', field: 'current_division' },
  { header: 'Roll Number', field: 'roll_number' },
  { header: 'Blood Group', field: 'blood_group' },
  { header: 'Parent Mobile', field: 'parent_mobile' },
  { header: 'Address', field: 'address' },
];

const IMPORT_SAMPLE_ROW = [
  'Aditya Rajesh Patil', '2024001', 'S001', 'Sunita Patil', 'Rajesh Patil', 'Male', '15-05-2013',
  '123456789012', '123456789012', 'STU-001', '12345678901', 'LOC-001',
  'Hindu', 'General', 'Open', 'Indian', 'Marathi',
  'Pune', 'Haveli', 'Pune', 'Maharashtra', 'India',
  '', '', '7', 'A', '01-06-2020', '', '', '23', 'B+', '9876543210', 'Pune, Maharashtra',
];

function pad2(n) { return String(n).padStart(2, '0'); }

// Excel silently converts a manually-typed date into its own native date
// type — read back through the xlsx library (with cellDates: true) that
// arrives here as a real JS Date, not the "15-05-2013" text the admin saw
// in the cell. A school might also just type the date as plain text per the
// template's DD-MM-YYYY instruction. Accept both, plus ISO as a fallback for
// re-uploaded exports, and always normalize to YYYY-MM-DD for the DATE
// column — anything else is reported as a clear per-row error instead of a
// raw SQL "Incorrect date value" surfacing to the school admin.
function parseImportDate(raw) {
  if (raw === null || raw === undefined || raw === '') return { value: null, error: null };
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return { value: null, error: 'is not a valid date' };
    // xlsx's serial-number-to-Date conversion has a known floating-point
    // rounding drift (confirmed: converting back the exact serial for a
    // clean midnight date can land several hours into the neighboring day),
    // which silently shifted the imported date by a day depending on the
    // server's timezone. Snapping to the nearest UTC day boundary before
    // reading the calendar fields cancels that drift out.
    const snapped = new Date(Math.round(raw.getTime() / 86400000) * 86400000);
    return { value: `${snapped.getUTCFullYear()}-${pad2(snapped.getUTCMonth() + 1)}-${pad2(snapped.getUTCDate())}`, error: null };
  }
  const str = String(raw).trim();
  if (!str) return { value: null, error: null };

  let m = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const day = Number(m[1]), month = Number(m[2]), year = Number(m[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { value: `${year}-${pad2(month)}-${pad2(day)}`, error: null };
    }
    return { value: null, error: `"${str}" is not a valid date` };
  }
  m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return { value: `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`, error: null };

  return { value: null, error: `"${str}" is not a valid date — use DD-MM-YYYY format` };
}

// GET /api/students/import-template - downloadable .xlsx with correct headers
async function downloadImportTemplate(req, res) {
  try {
    const headers = IMPORT_COLUMNS.map(c => c.header);
    const worksheet = XLSX.utils.aoa_to_sheet([headers, IMPORT_SAMPLE_ROW]);
    worksheet['!cols'] = headers.map(h => ({ wch: Math.max(14, Math.min(28, h.length + 2)) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="student-import-template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    console.error('downloadImportTemplate error:', err.message);
    res.status(500).json({ error: 'Server error generating template' });
  }
}

// POST /api/students/import - bulk-create students from an uploaded .xlsx/.csv file.
// Validates each row independently and reports per-row errors rather than
// failing the whole batch on one bad row - a school admin importing 200
// students shouldn't lose all 200 because row 47 was missing a name.
async function importStudents(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    // cellDates: true — without it, a cell Excel stored as its native date
    // type comes back as a raw serial number (e.g. 45123) instead of a date,
    // which is the "type date" error this was built to fix.
    const workbook = XLSX.readFile(req.file.path, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

    if (rows.length === 0) {
      return res.status(400).json({ error: 'The uploaded file has no data rows' });
    }
    if (rows.length > 1000) {
      return res.status(400).json({ error: 'Maximum 1000 rows per import. Please split into smaller files.' });
    }

    const results = { created: 0, failed: 0, errors: [], importedStudents: [] };

    function cellFor(row, col) {
      if (row[col.header] !== undefined && row[col.header] !== '') return row[col.header];
      for (const alt of col.altHeaders || []) {
        if (row[alt] !== undefined && row[alt] !== '') return row[alt];
      }
      return row[col.header];
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 because row 1 is the header and i is 0-indexed

      const fullName = String(cellFor(row, IMPORT_COLUMNS[0]) || '').trim();
      if (!fullName) {
        results.failed++;
        results.errors.push({ row: rowNum, error: 'Full Name is required' });
        continue;
      }

      const values = { full_name: fullName };
      let rowError = null;
      for (const col of IMPORT_COLUMNS) {
        if (col.field === 'full_name') continue;
        const raw = cellFor(row, col);
        if (col.isDate) {
          const parsed = parseImportDate(raw);
          if (parsed.error) {
            rowError = `${col.header.replace(/ \(DD-MM-YYYY\)$/, '')}: ${parsed.error}`;
            break;
          }
          values[col.field] = parsed.value;
        } else {
          const str = String(raw ?? '').trim();
          values[col.field] = str || null;
        }
      }
      if (rowError) {
        results.failed++;
        results.errors.push({ row: rowNum, error: rowError });
        continue;
      }

      const idError = validateStudentIdentifiers(values);
      if (idError) {
        results.failed++;
        results.errors.push({ row: rowNum, error: idError });
        continue;
      }

      try {
        const id = uuidv4();
        const fields = IMPORT_COLUMNS.map(c => c.field);
        const columns = ['id', 'school_id', ...fields];
        const placeholders = columns.map(() => '?').join(', ');
        const insertValues = [id, req.schoolId, ...fields.map(f => values[f] ?? null)];
        await pool.query(`INSERT INTO students (${columns.join(', ')}) VALUES (${placeholders})`, insertValues);
        results.created++;
        results.importedStudents.push({ id, full_name: fullName });
      } catch (rowErr) {
        results.failed++;
        results.errors.push({ row: rowNum, error: rowErr.message });
      }
    }

    // Clean up the uploaded temp file now that we're done reading it.
    fs.unlink(req.file.path, () => {});

    res.json(results);
  } catch (err) {
    console.error('importStudents error:', err.message);
    res.status(500).json({ error: 'Server error processing import file. Make sure it is a valid .xlsx or .csv file.' });
  }
}

module.exports = { listStudents, getStudent, createStudent, updateStudent, deleteStudent, downloadImportTemplate, importStudents, IMPORT_COLUMNS };
