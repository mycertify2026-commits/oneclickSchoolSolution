// OCR-assisted field detection for uploaded certificate templates.
//
// Runs ONCE per template, at analysis time (never at render time — see
// templateRenderer.js for the per-certificate rendering path). Produces
// SUGGESTIONS only: every result is written with source='ocr_suggested' and
// is fully editable/removable in the School Admin's drag-and-drop mapping
// editor before a template can be activated. Nothing here is auto-finalized.
//
// Deliberately not a black-box ML model: matching is a plain, inspectable
// normalize + token-overlap/Levenshtein-similarity formula against a
// hand-authored vocabulary dictionary. Photo/QR/protected-zone placement is
// NOT attempted here — those aren't text and can't be OCR-detected; the
// editor offers explicit "Add Photo Box" / "Add QR Box" / "Mark Protected
// Zone" tools for those instead.
const Tesseract = require('tesseract.js');

// field_key -> label variants a real uploaded LC/Bonafide/ID-card is likely
// to already have printed on it. Covers every field the renderer (see
// templateRenderer.js's FIELD_RESOLVERS) actually knows how to populate —
// this list and that one must be kept in sync.
const FIELD_VOCABULARY = [
  { fieldKey: 'student.full_name', label: 'Student Name', labels: ['name of student', 'student name', 'name of student in full', 'name'] },
  { fieldKey: 'student.mother_name', label: "Mother's Name", labels: ["mother's name", 'mother name', "mothers name"] },
  { fieldKey: 'student.father_name', label: "Father's Name", labels: ["father's name", 'father name', "fathers name"] },
  { fieldKey: 'student.caste', label: 'Caste', labels: ['religion caste with sub caste', 'religion / caste', 'caste', 'caste category'] },
  { fieldKey: 'student.nationality', label: 'Nationality', labels: ['nationality'] },
  { fieldKey: 'student.dob', label: 'Date of Birth', labels: ['date of birth in figures', 'date of birth', 'dob', 'd.o.b'] },
  { fieldKey: 'student.dob_words', label: 'DOB in Words', labels: ['date of birth in words', 'dob in words'] },
  { fieldKey: 'student.birth_place', label: 'Place of Birth', labels: ['place of birth', 'birth place'] },
  { fieldKey: 'student.admission_date', label: 'Date of Admission', labels: ['date of admission', 'admission date'] },
  { fieldKey: 'student.prev_school', label: 'Last School Attended', labels: ['last school college attended', 'last school attended', 'previous school'] },
  { fieldKey: 'student.class_display', label: 'Class / Standard', labels: ['class in which studying', 'std', 'standard', 'class'] },
  { fieldKey: 'student.register_number', label: 'GR Number', labels: ['gr no', 'g.r. no', 'gr number', 'general register no'] },
  { fieldKey: 'student.serial_id', label: 'Saral ID', labels: ['saral id', 'saral no'] },
  { fieldKey: 'student.aadhaar_masked', label: 'Aadhaar', labels: ['aadhar', 'aadhaar', 'aadhar no'] },
  { fieldKey: 'student.roll_number', label: 'Roll Number', labels: ['roll no', 'roll number'] },
  { fieldKey: 'student.gender', label: 'Gender', labels: ['gender', 'sex'] },
  { fieldKey: 'lc.leaving_date', label: 'Date of Leaving', labels: ['date of leaving'] },
  { fieldKey: 'lc.since_when', label: 'Admitted Since', labels: ['date of admission since when', 'since when'] },
  { fieldKey: 'lc.reason_for_leaving', label: 'Reason for Leaving', labels: ['reason for leaving'] },
  { fieldKey: 'lc.remarks', label: 'Remarks', labels: ['remarks'] },
  { fieldKey: 'lc.progress', label: 'Progress', labels: ['progress'] },
  { fieldKey: 'lc.conduct', label: 'Conduct', labels: ['conduct'] },
  { fieldKey: 'school.name', label: 'School Name', labels: ['school name', 'name of school'] },
  { fieldKey: 'school.udise_code', label: 'U-DISE Code', labels: ['u dise', 'udise', 'udise code'] },
  { fieldKey: 'school.recog_no', label: 'Recognition No.', labels: ['recog no', 'recognition no'] },
  { fieldKey: 'school.principal_name', label: 'Principal/Head Master', labels: ['head master', 'principal', 'headmaster'] },
  { fieldKey: 'certificate.serial_number', label: 'Certificate No.', labels: ['certificate no', 'certificate number'] },
];

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[:._\-]/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Cheap, explainable Levenshtein distance — fine at these string lengths
// (a handful of words), no need for a dependency.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  const editSim = 1 - dist / maxLen;
  const aTokens = new Set(na.split(' '));
  const bTokens = new Set(nb.split(' '));
  const overlap = [...aTokens].filter(t => bTokens.has(t)).length;
  const tokenSim = overlap / Math.max(aTokens.size, bTokens.size);
  return Math.max(editSim, tokenSim);
}

const MATCH_THRESHOLD = 0.72;

// Given one OCR'd line's text, find the best vocabulary match (if any).
function matchLabel(lineText) {
  let best = null;
  for (const entry of FIELD_VOCABULARY) {
    for (const candidate of entry.labels) {
      const score = similarity(lineText, candidate);
      if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
        best = { fieldKey: entry.fieldKey, label: entry.label, score };
      }
    }
  }
  return best;
}

// Splits a matched OCR line like "1. Name of student in full : Test Student"
// into the label portion (numbering stripped, so it matches cleanly against
// the vocabulary) and where the value visually starts (character offset,
// used to size the suggested value box).
function splitLabelFromLine(lineText) {
  const colonIdx = lineText.indexOf(':');
  const labelPart = colonIdx >= 0 && colonIdx < lineText.length - 1 ? lineText.slice(0, colonIdx + 1) : lineText;
  const valueStartRatio = colonIdx >= 0 && colonIdx < lineText.length - 1 ? (colonIdx + 1) / lineText.length : 1;
  const cleanLabel = labelPart.replace(/^\s*\d{1,2}[.).]\s*/, '').replace(/:\s*$/, '');
  return { labelPart, cleanLabel, valueStartRatio };
}

/**
 * @param {Buffer} imageBuffer  the rasterized template PNG
 * @param {number} pageWidthPt  page width the suggested x/y/width/height
 *                              should be expressed in (pdfkit point-space)
 * @param {number} pageHeightPt
 * @param {number} imagePixelWidth  pixel width of imageBuffer (for the
 *                                  pixel->point scale factor)
 * @param {number} imagePixelHeight
 * @returns {Promise<Array<{field_type, field_key, label, x, y, width, height, source, confidence}>>}
 */
async function detectFields(imageBuffer, { pageWidthPt, pageHeightPt, imagePixelWidth, imagePixelHeight }) {
  const worker = await Tesseract.createWorker('eng');
  let data;
  try {
    ({ data } = await worker.recognize(imageBuffer, {}, { blocks: true }));
  } finally {
    await worker.terminate();
  }

  const lines = data.lines || (data.blocks || []).flatMap(b =>
    (b.paragraphs || []).flatMap(p => p.lines || [])
  );

  const scaleX = pageWidthPt / imagePixelWidth;
  const scaleY = pageHeightPt / imagePixelHeight;
  const usedFieldKeys = new Set();
  const suggestions = [];

  for (const line of lines) {
    const text = (line.text || '').trim();
    if (!text) continue;
    const { cleanLabel, valueStartRatio } = splitLabelFromLine(text);
    const match = matchLabel(cleanLabel);
    if (!match || usedFieldKeys.has(match.fieldKey)) continue; // first/best line wins per field
    usedFieldKeys.add(match.fieldKey);

    const lineWidthPx = line.bbox.x1 - line.bbox.x0;
    const lineHeightPx = Math.max(line.bbox.y1 - line.bbox.y0, 18);

    let valueX0Px, valueWidthPx;
    if (valueStartRatio < 0.98) {
      // Label + inline value/blank on the same line — suggest the box just
      // to the right of where the colon/label ends.
      valueX0Px = line.bbox.x0 + lineWidthPx * valueStartRatio;
      valueWidthPx = Math.max(imagePixelWidth * 0.9 - valueX0Px, 40);
    } else {
      // Standalone label (no inline value) — suggest the line directly
      // below it, spanning from the label's left edge to the page's right
      // margin, rather than guessing a narrower width.
      valueX0Px = line.bbox.x0;
      valueWidthPx = imagePixelWidth * 0.9 - valueX0Px;
    }
    const valueY0Px = valueStartRatio < 0.98 ? line.bbox.y0 : line.bbox.y1 + 4;

    suggestions.push({
      field_type: 'text',
      field_key: match.fieldKey,
      label: match.label,
      x: Number((valueX0Px * scaleX).toFixed(2)),
      y: Number((valueY0Px * scaleY).toFixed(2)),
      width: Number((valueWidthPx * scaleX).toFixed(2)),
      height: Number((lineHeightPx * scaleY).toFixed(2)),
      source: 'ocr_suggested',
      confidence: Number((line.confidence || 0).toFixed(2)),
    });
  }

  return suggestions;
}

module.exports = { detectFields, matchLabel, FIELD_VOCABULARY };
