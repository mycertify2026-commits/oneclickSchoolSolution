const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('./db');
const DEMO_EMAIL = 'janhavikhonde20@gmail.com';

const DEMO_SCHOOLS = [
  ['DEMO001', 'Demo Sunrise Public School', 'Pune', 'Pune', 'Haveli', 'English', 'CBSE'],
  ['DEMO002', 'Demo Vidya Niketan', 'Nashik', 'Nashik', 'Nashik', 'Marathi', 'SSC (Maharashtra State Board)'],
  ['DEMO003', 'Demo Green Valley Academy', 'Nagpur', 'Nagpur', 'Nagpur', 'English', 'CBSE'],
  ['DEMO004', 'Demo Knowledge Tree School', 'Mumbai', 'Mumbai', 'Mumbai', 'English', 'ICSE'],
  ['DEMO005', 'Demo Saraswati High School', 'Kolhapur', 'Kolhapur', 'Karvir', 'Marathi', 'SSC (Maharashtra State Board)'],
];

const STUDENT_NAMES = [
  ['Aarav', 'Sharma'], ['Anaya', 'Patil'], ['Vihaan', 'Joshi'],
  ['Saanvi', 'Deshmukh'], ['Aditya', 'Kulkarni'],
];

function demoAssetPath(kind, schoolNo, studentNo) {
  const dir = path.join(__dirname, '..', '..', 'uploads', 'demo-assets');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${kind}-${schoolNo}-${studentNo}.svg`);
}

function writeDummySvg(filePath, label, color) {
  if (fs.existsSync(filePath)) return;
  const safeLabel = String(label).replace(/[^A-Za-z0-9 -]/g, '').slice(0, 20);
  fs.writeFileSync(filePath, `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="600" viewBox="0 0 480 600">
  <rect width="480" height="600" fill="${color}"/>
  <circle cx="240" cy="220" r="105" fill="#ffffff" opacity=".92"/>
  <circle cx="240" cy="185" r="48" fill="${color}"/>
  <path d="M125 390c20-92 210-92 230 0v36H125z" fill="${color}"/>
  <text x="240" y="520" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" font-weight="700" fill="#ffffff">${safeLabel}</text>
</svg>`);
}

function writeSchoolAssets(schoolNo, schoolName, color) {
  const logoPath = demoAssetPath('school-logo', schoolNo, 0);
  const signaturePath = demoAssetPath('signature', schoolNo, 0);
  const stampPath = demoAssetPath('stamp', schoolNo, 0);
  writeDummySvg(logoPath, `SCHOOL ${schoolNo}`, color);
  if (!fs.existsSync(signaturePath)) {
    fs.writeFileSync(signaturePath, `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="180">
      <path d="M25 125 C100 25 120 160 185 90 S300 25 330 105 S420 160 570 45" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"/>
      <text x="300" y="165" text-anchor="middle" font-family="cursive" font-size="24" fill="#334155">Head Master</text>
    </svg>`);
  }
  if (!fs.existsSync(stampPath)) {
    fs.writeFileSync(stampPath, `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="260">
      <circle cx="130" cy="130" r="105" fill="none" stroke="${color}" stroke-width="7"/>
      <circle cx="130" cy="130" r="82" fill="none" stroke="${color}" stroke-width="2"/>
      <text x="130" y="117" text-anchor="middle" font-family="Arial" font-size="22" font-weight="bold" fill="${color}">CERTIFYPRO</text>
      <text x="130" y="145" text-anchor="middle" font-family="Arial" font-size="18" fill="${color}">DEMO SCHOOL</text>
    </svg>`);
  }
  return { logoPath, signaturePath, stampPath, schoolName };
}

async function seedDemoData({ closePool = true } = {}) {
  const conn = await pool.getConnection();
  const demoPasswordHash = await bcrypt.hash('Demo@123', 10);
  const colors = ['#2563eb', '#0f766e', '#7c3aed', '#c2410c', '#be123c'];
  let createdSchools = 0;
  let createdStudents = 0;

  try {
    await conn.beginTransaction();

    for (let schoolIndex = 0; schoolIndex < DEMO_SCHOOLS.length; schoolIndex++) {
      const [loginId, schoolName, city, district, taluka, medium, board] = DEMO_SCHOOLS[schoolIndex];
      const adminEmail = `demo.${loginId.toLowerCase()}@certifypro.test`;
      const assets = writeSchoolAssets(schoolIndex + 1, schoolName, colors[schoolIndex]);
      const [existingSchools] = await conn.query(
        'SELECT id, admin_user_id FROM schools WHERE login_id = ? AND deleted_at IS NULL',
        [loginId]
      );

      let schoolId = existingSchools[0]?.id;
      let adminId = existingSchools[0]?.admin_user_id;

      if (!schoolId) {
        adminId = uuidv4();
        schoolId = uuidv4();
        await conn.query(
          `INSERT INTO users (id, role, name, email, mobile, password_hash, is_active, password_set)
           VALUES (?, 'schoolAdmin', ?, ?, ?, ?, 1, 1)`,
          [adminId, `Demo Admin ${schoolIndex + 1}`, adminEmail, `90000000${String(schoolIndex + 1).padStart(2, '0')}`, demoPasswordHash]
        );
        await conn.query(
          `INSERT INTO schools
           (id, admin_user_id, name, login_id, udise_code, village, city, district, taluka,
            pin_code, phone, email, medium, board, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
          [
            schoolId, adminId, schoolName, loginId, `DEMOUDISE${schoolIndex + 1}`,
            `${city} Demo Village`, city, district, taluka, `41100${schoolIndex + 1}`,
            `90100000${String(schoolIndex + 1).padStart(2, '0')}`, DEMO_EMAIL, medium, board,
          ]
        );
        await conn.query(
          'INSERT INTO wallets (id, school_id, balance) VALUES (?, ?, ?)',
          [uuidv4(), schoolId, 1000]
        );
        createdSchools++;
      } else {
        await conn.query(
          `UPDATE schools SET email = ?, logo_url = ?, signature_url = ?, stamp_url = ?
           WHERE id = ?`,
          [DEMO_EMAIL, assets.logoPath, assets.signaturePath, assets.stampPath, schoolId]
        );
      }

      if (!existingSchools[0]) {
        await conn.query(
          `UPDATE schools SET email = ?, logo_url = ?, signature_url = ?, stamp_url = ?
           WHERE id = ?`,
          [DEMO_EMAIL, assets.logoPath, assets.signaturePath, assets.stampPath, schoolId]
        );
      }

      const [studentCountRows] = await conn.query(
        'SELECT COUNT(*) AS count FROM students WHERE school_id = ?',
        [schoolId]
      );
      const existingCount = Number(studentCountRows[0]?.count || 0);

      for (let studentIndex = existingCount; studentIndex < 5; studentIndex++) {
        const [firstName, lastName] = STUDENT_NAMES[studentIndex];
        const fullName = `${firstName} ${lastName} Demo ${schoolIndex + 1}`;
        const photoPath = demoAssetPath('student', schoolIndex + 1, studentIndex + 1);
        writeDummySvg(photoPath, `DEMO ${schoolIndex + 1}-${studentIndex + 1}`, colors[schoolIndex]);
        await conn.query(
          `INSERT INTO students
           (id, school_id, register_number, serial_id, full_name, mother_name, father_name,
            gender, dob, aadhaar, religion, caste, sub_caste, nationality, mother_tongue,
            birth_village, birth_taluka, birth_district, birth_state, birth_country,
            admission_standard, admission_division, admission_date, prev_school, prev_standard,
            roll_number, blood_group, parent_mobile, address, photo_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuidv4(), schoolId, `D${schoolIndex + 1}00${studentIndex + 1}`,
            `SARAL-DEMO-${schoolIndex + 1}${studentIndex + 1}`, fullName,
            `Sunita ${lastName}`, `Rajesh ${lastName}`, studentIndex % 2 ? 'Female' : 'Male',
            `201${4 + (studentIndex % 3)}-0${5 + (studentIndex % 4)}-1${studentIndex + 1}`,
            `99990000${schoolIndex}${studentIndex}`, 'Hindu', studentIndex % 2 ? 'OBC' : 'Open',
            'Demo', 'Indian', 'Marathi', `${city} Demo Village`, taluka, district,
            'Maharashtra', 'India', `${5 + studentIndex}th`, studentIndex % 2 ? 'B' : 'A',
            `202${1 + (studentIndex % 3)}-06-10`, 'Demo Primary School',
            `${4 + studentIndex}th`, String(studentIndex + 1), ['A+', 'B+', 'O+', 'AB+', 'A-'][studentIndex],
            `98${String(70000000 + schoolIndex * 100 + studentIndex)}`, `${schoolName}, ${city}`,
            photoPath,
          ]
        );
        createdStudents++;
      }
    }

    await conn.commit();
    console.log(`Demo seed complete: ${createdSchools} schools, ${createdStudents} students created.`);
    console.log('Demo school login IDs: DEMO001 to DEMO005');
    console.log('Demo password for all school admins: Demo@123');
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
    if (closePool) await pool.end();
  }
}

if (require.main === module) {
  seedDemoData().catch((error) => {
    console.error('Demo seed failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { seedDemoData };