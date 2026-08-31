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
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const sortBy = SORTABLE_STUDENT_FIELDS.includes(req.query.sortBy) ? req.query.sortBy : 'full_name';
    const sortDir = String(req.query.sortDir).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    let query = 'SELECT * FROM students WHERE school_id = ?';
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
  'roll_number', 'blood_group', 'parent_mobile', 'address'
];

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
const IMPORT_COLUMNS = [
  { header: 'Full Name', field: 'full_name', required: true },
  { header: 'Register Number', field: 'register_number' },
  { header: "Mother's Name", field: 'mother_name' },
  { header: "Father's Name", field: 'father_name' },
  { header: 'Gender', field: 'gender' },
  { header: 'DOB (YYYY-MM-DD)', field: 'dob' },
  { header: 'Admission Standard', field: 'admission_standard' },
  { header: 'Division', field: 'admission_division' },
  { header: 'Roll Number', field: 'roll_number' },
  { header: 'Parent Mobile', field: 'parent_mobile' },
  { header: 'Blood Group', field: 'blood_group' },
  { header: 'Address', field: 'address' }
];

// GET /api/students/import-template - downloadable .xlsx with correct headers
async function downloadImportTemplate(req, res) {
  try {
    const headers = IMPORT_COLUMNS.map(c => c.header);
    const sampleRow = ['Aditya Rajesh Patil', '2024001', 'Sunita Patil', 'Rajesh Patil', 'Male', '2013-05-15', '7', 'A', '23', '9876543210', 'B+', 'Pune'];
    const worksheet = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
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
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

    if (rows.length === 0) {
      return res.status(400).json({ error: 'The uploaded file has no data rows' });
    }
    if (rows.length > 1000) {
      return res.status(400).json({ error: 'Maximum 1000 rows per import. Please split into smaller files.' });
    }

    const results = { created: 0, failed: 0, errors: [], importedStudents: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 because row 1 is the header and i is 0-indexed

      const fullName = String(row['Full Name'] || '').trim();
      if (!fullName) {
        results.failed++;
        results.errors.push({ row: rowNum, error: 'Full Name is required' });
        continue;
      }

      try {
        const id = uuidv4();
        await pool.query(
          `INSERT INTO students (id, school_id, full_name, register_number, mother_name, father_name, gender, dob, admission_standard, admission_division, roll_number, parent_mobile, blood_group, address)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id, req.schoolId, fullName,
            String(row['Register Number'] || '') || null,
            String(row["Mother's Name"] || '') || null,
            String(row["Father's Name"] || '') || null,
            String(row['Gender'] || '') || null,
            String(row['DOB (YYYY-MM-DD)'] || '') || null,
            String(row['Admission Standard'] || '') || null,
            String(row['Division'] || '') || null,
            String(row['Roll Number'] || '') || null,
            String(row['Parent Mobile'] || '') || null,
            String(row['Blood Group'] || '') || null,
            String(row['Address'] || '') || null
          ]
        );
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
