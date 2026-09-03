const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { buildVerifyUrl } = require('./qrPayload');
const { toPdfSafe } = require('./imageConvert');

// Default border/accent colour used only when a school has not uploaded a
// PNG border template — a neutral slate, not the previous orange/gold.
const GOLD = '#7A8CA3';
const NAVY = '#0F2A5E';
const GREY = '#6b7280';
const TEXT = '#1a1a1a';
const BONAFIDE_FRAME_PATH = process.env.BONAFIDE_FRAME_PATH ||
  path.resolve(__dirname, '../../../attached_assets/bonafide_student_copy_white.png');
const LC_FRAME_PATH = process.env.LC_FRAME_PATH ||
  path.resolve(__dirname, '../../../attached_assets/ChatGPT_Image_Aug_16,_2026,_09_36_17_PM_1786938001048.png');

function safe(v, fallback = '') {
  return (v === null || v === undefined || v === '') ? fallback : String(v);
}

function sentenceCase(v, fallback = '') {
  const value = safe(v, fallback).trim();
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

function canDraw(v) {
  return Buffer.isBuffer(v) || (typeof v === 'string' && !!v && fs.existsSync(v));
}

function fmtDate(d) {
  if (!d) return '';
  // A plain "YYYY-MM-DD" string (an HTML date input, or a DB DATE column
  // that comes back as a string) must never be round-tripped through
  // `new Date(string)` — that parses it as UTC midnight, and reading it
  // back with the server's LOCAL getters can roll it back a day depending
  // on server timezone. Read the calendar digits directly instead.
  if (typeof d === 'string') {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  // A DATE-type column that already arrived as a Date object (both mysql2
  // and pg parse it that way) is pinned to UTC midnight — same rollback
  // risk as above, so read it with UTC getters. A genuine instant (e.g.
  // `new Date()` for "today's date" on a footer) essentially never lands
  // exactly on UTC midnight, so this tells the two apart without needing
  // to know the server's timezone at all.
  const isUtcMidnight = dt.getUTCHours() === 0 && dt.getUTCMinutes() === 0 && dt.getUTCSeconds() === 0 && dt.getUTCMilliseconds() === 0;
  const dd = String(isUtcMidnight ? dt.getUTCDate() : dt.getDate()).padStart(2, '0');
  const mm = String((isUtcMidnight ? dt.getUTCMonth() : dt.getMonth()) + 1).padStart(2, '0');
  const yyyy = isUtcMidnight ? dt.getUTCFullYear() : dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

const NUM_WORDS = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
  'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
const TENS = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function numToWords(n) {
  if (n < 20) return NUM_WORDS[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + NUM_WORDS[n % 10] : '');
  if (n < 1000) return NUM_WORDS[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + numToWords(n % 100) : '');
  if (n < 100000) return numToWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + numToWords(n % 1000) : '');
  return String(n);
}

function dobInWords(dobStr) {
  if (!dobStr) return '';
  // Same UTC-midnight vs local-instant distinction as fmtDate — see there
  // for why this can't just always use one or the other.
  if (typeof dobStr === 'string') {
    const m = dobStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const day = numToWords(parseInt(m[3], 10));
      const month = MONTHS[parseInt(m[2], 10) - 1];
      const year = numToWords(parseInt(m[1], 10));
      return `${day} ${month} ${year}`;
    }
  }
  const dt = new Date(dobStr);
  if (isNaN(dt.getTime())) return '';
  const isUtcMidnight = dt.getUTCHours() === 0 && dt.getUTCMinutes() === 0 && dt.getUTCSeconds() === 0 && dt.getUTCMilliseconds() === 0;
  const day = numToWords(isUtcMidnight ? dt.getUTCDate() : dt.getDate());
  const month = MONTHS[isUtcMidnight ? dt.getUTCMonth() : dt.getMonth()];
  const year = numToWords(isUtcMidnight ? dt.getUTCFullYear() : dt.getFullYear());
  return `${day} ${month} ${year}`;
}

function genSerial(prefix) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${ymd}-${rand}`;
}

function fitCenteredText(doc, text, x, y, width, maxFontSize, color, bold = true, minFontSize = 7) {
  const fontName = bold ? 'Helvetica-Bold' : 'Helvetica';
  let fontSize = maxFontSize;
  doc.font(fontName);
  while (fontSize > minFontSize && doc.fontSize(fontSize).widthOfString(text) > width) {
    fontSize -= 0.5;
  }
  doc.fontSize(fontSize).fillColor(color).text(text, x, y, { width, align: 'center', lineBreak: false });
  // Even with lineBreak:false, PDFKit wraps when the text exceeds `width`
  // (e.g. shrink hit minFontSize) — advance by the real rendered height.
  const h = doc.heightOfString(text, { width, align: 'center' });
  return y + Math.max(fontSize * 1.25, h);
}

// Single-line text that never overflows its box: shrinks the font down to
// minFontSize first, and if it's still too wide even there, truncates with
// an ellipsis — so a very long name/address/remark can never run into the
// border, the next row, or another field, regardless of length.
function fitSingleLineText(doc, text, x, y, width, maxFontSize, color, bold = true, minFontSize = 7) {
  const fontName = bold ? 'Helvetica-Bold' : 'Helvetica';
  let fontSize = maxFontSize;
  doc.font(fontName);
  while (fontSize > minFontSize && doc.fontSize(fontSize).widthOfString(text) > width) {
    fontSize -= 0.5;
  }
  doc.fontSize(fontSize).fillColor(color)
    .text(text, x, y, { width, lineBreak: false, ellipsis: true });
  return fontSize;
}

// Indian academic year (June–May): e.g. Aug 2026 → "2026 - 27"
function currentAcademicYear() {
  const now = new Date();
  const startYear = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear} - ${String((startYear + 1) % 100).padStart(2, '0')}`;
}

function drawDoubleBorder(doc, top = 16, bottom = null) {
  const { width, height } = doc.page;
  const bottomY = bottom || height - 16;
  doc.save();
  doc.lineWidth(3).strokeColor(GOLD).rect(16, top, width - 32, bottomY - top).stroke();
  doc.lineWidth(1.2).strokeColor(NAVY).rect(24, top + 8, width - 48, bottomY - top - 16).stroke();
  doc.restore();
}

function drawHeader(doc, school, logoPath, marginX = 46) {
  const contentWidth = doc.page.width - marginX * 2;
  const top = 42;

  if (canDraw(logoPath)) {
    try { doc.image(logoPath, marginX, top, { width: 62, height: 62 }); }
    catch (e) { console.error('[PDF] logo draw failed:', e.message); }
  } else {
    doc.save().circle(marginX + 31, top + 31, 29).lineWidth(1.3).strokeColor(NAVY).stroke().restore();
  }

  let y = top + 74;

  y = fitCenteredText(doc, 'Maharashtra state education board', marginX, y, contentWidth, 15, NAVY) + 3;
  y = fitCenteredText(doc, sentenceCase(school.name, 'School name'), marginX, y, contentWidth, 16, NAVY) + 4;

  doc.font('Helvetica').fontSize(9).fillColor(TEXT)
    .text(`Taluka: ${safe(school.taluka)}, District: ${safe(school.district)}`, marginX, y, { width: contentWidth, align: 'center' });
  y += 13;

  doc.font('Helvetica').fontSize(8.5).fillColor(GREY)
    .text(`U-DISE: ${safe(school.udise_code)}   |   RECOG NO: ${safe(school.recog_no)}`, marginX, y, { width: contentWidth, align: 'center' });
  y += 15;

  return y;
}

function drawIdBox(doc, x, y, label, value, width = 130) {
  let fontSize = 11;
  doc.font('Helvetica-Bold');
  while (fontSize > 6.5 && doc.fontSize(fontSize).widthOfString(value) > width - 10) {
    fontSize -= 0.5;
  }
  doc.save();
  doc.roundedRect(x, y, width, 20, 3).fillColor(NAVY).fill();
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7.5).text(sentenceCase(label), x, y + 5.5, { width, align: 'center', lineBreak: false });
  doc.restore();
  doc.fillColor('#D6272B').font('Helvetica-Bold').fontSize(fontSize).text(value, x, y + 25, { width, align: 'center', lineBreak: false });
  return y + 40;
}

function drawTitleBanner(doc, y, title, marginX = 46) {
  const width = doc.page.width - marginX * 2;
  doc.save();
  doc.roundedRect(marginX, y, width, 30, 6).fillColor(NAVY).fill();
  doc.lineWidth(1).strokeColor(GOLD).roundedRect(marginX, y, width, 30, 6).stroke();
  doc.restore();
  fitCenteredText(doc, sentenceCase(title), marginX, y + 9, width, 16, '#fff');
  return y + 44;
}

// LC data row — keys and values share the same sentence-case 12pt style.
// The value shrinks (then ellipsizes) rather than overflow into the border,
// the next row, or the QR/photo — student data length is never guaranteed.
function drawDataRow(doc, x, y, width, num, label, value) {
  const key = sentenceCase(label);
  const displayValue = sentenceCase(value);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(TEXT).text(`${num}.`, x, y, { width: 22 });
  doc.font('Helvetica-Bold').fontSize(12).fillColor(TEXT).text(key, x + 22, y, { width: 188 });
  doc.font('Helvetica-Bold').fontSize(12).fillColor(TEXT).text(':', x + 212, y, { width: 10 });
  fitSingleLineText(doc, displayValue, x + 226, y, width - 226, 12, TEXT, true, 8);
  doc.save().moveTo(x, y + 16.5).lineTo(x + width, y + 16.5).lineWidth(0.5).strokeColor('#e2e8f0').stroke().restore();
  return y + 21;
}

function drawPhotoPanel(doc, x, y, photoPath, w = 80, h = 96) {
  doc.save();
  doc.roundedRect(x, y, w, h, 4).lineWidth(1).strokeColor(GOLD).stroke();
  if (canDraw(photoPath)) {
    try { doc.image(photoPath, x + 1, y + 1, { width: w - 2, height: h - 2 }); }
    catch (e) { console.error('[PDF] photo draw failed:', e.message); }
  } else {
    doc.font('Helvetica').fontSize(8).fillColor(GREY)
      .text('PHOTO', x, y + h / 2 - 4, { width: w, align: 'center' });
  }
  doc.restore();
  return y + h + 8;
}

function drawSignatureIfAvailable(doc, signaturePath, x, y, width, height = 30) {
  if (!canDraw(signaturePath)) return false;
  try {
    doc.image(signaturePath, x, y, { width, height, fit: [width, height] });
    return true;
  } catch (e) {
    console.error('[PDF] signature draw failed:', e.message);
    return false;
  }
}

function drawStampIfAvailable(doc, stampPath, x, y, size = 64) {
  if (!canDraw(stampPath)) return false;
  try {
    doc.image(stampPath, x, y, { width: size, height: size, fit: [size, size] });
    return true;
  } catch (e) {
    console.error('[PDF] stamp draw failed:', e.message);
    return false;
  }
}

function drawFrameIfAvailable(doc, framePath, x, y, width, height) {
  if (!canDraw(framePath)) return false;
  try {
    doc.image(framePath, x, y, { width, height });
    return true;
  } catch (e) {
    console.error('[PDF] frame draw failed:', e.message);
    return false;
  }
}

// Footer for LC: three columns — Date/Place (left), Stamp (centre), HEAD MASTER (right).
// Combined note (no-change + certified) in one line at very bottom.
function drawLcFooter(doc, y, school, opts) {
  const { dateOfIssue, place, signaturePath, stampPath } = opts;
  const width = doc.page.width - 92;

  doc.save().dash(2, { space: 2 }).moveTo(46, y).lineTo(46 + width, y).strokeColor('#cbd5e1').stroke().undash().restore();
  y += 10;

  const C1  = 46;
  const C2  = 46 + width * 0.33;
  const C3  = 46 + width * 0.66;
  const C3W = width * 0.34;

  const LINE_Y = y + 56;

  // Left: Date / Place
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(TEXT).text(`DATE  : ${dateOfIssue}`, C1, y);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(TEXT).text(`PLACE : ${place}`, C1, y + 14);

  // Centre: school stamp (if uploaded)
  drawStampIfAvailable(doc, stampPath, C2, y + 2, 52);

  // Right: principal/head master signature (only if uploaded)
  drawSignatureIfAvailable(doc, signaturePath, C3, LINE_Y - 28, 130, 26);

  // Signature lines
  doc.moveTo(C1, LINE_Y).lineTo(C1 + 160, LINE_Y).lineWidth(0.7).strokeColor('#999').stroke();
  doc.moveTo(C3, LINE_Y).lineTo(C3 + C3W - 4, LINE_Y).lineWidth(0.7).strokeColor('#999').stroke();

  // Labels below lines
  doc.font('Helvetica').fontSize(8).fillColor(TEXT).text('Check by / Prepared by', C1, LINE_Y + 4);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT)
    .text('HEAD MASTER', C3, LINE_Y + 4, { width: C3W, align: 'center' });
  if (school.principal_name) {
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(TEXT)
      .text(safe(school.principal_name).toUpperCase(), C3, LINE_Y + 16, { width: C3W, align: 'center' });
    doc.font('Helvetica').fontSize(7).fillColor(GREY)
      .text(safe(school.name), C3, LINE_Y + 26, { width: C3W, align: 'center' });
  } else {
    doc.font('Helvetica').fontSize(7.5).fillColor(GREY)
      .text(safe(school.name), C3, LINE_Y + 16, { width: C3W, align: 'center' });
  }

  // Combined note at bottom — single line merging both standard notes
  const noteY = doc.page.height - 44;
  doc.save().moveTo(46, noteY).lineTo(46 + width, noteY).lineWidth(1.2).strokeColor(GOLD).stroke().restore();
  doc.font('Helvetica-Oblique').fontSize(7).fillColor(GREY)
    .text(
      'No change in any entry in this certificate shall be made except by the authority issuing it. ' +
      'Certified that the above information is true to the best of our knowledge as per school records.',
      46, noteY + 6, { width, align: 'center' }
    );
}

// ── LEAVING CERTIFICATE ──────────────────────────────────────────────────────
// New layout: QR top-centre, full-width data rows (no side photo), photo centred below rows.
// Accepts manual date/reason/remarks fields so Head Master can enter back-dated or custom values.
async function generateLcPdf({
  school, student, certificate, outputPath,
  photoPath, logoPath, signaturePath, stampPath,
  lcType = 'Original',
  dateOfLeaving,
  sinceWhen,
  reasonForLeaving,
  remarks
}) {
  const [safeLogoPath, safeSignaturePath, safePhotoPath, safeStampPath] = await Promise.all([
    toPdfSafe(logoPath),
    toPdfSafe(signaturePath),
    toPdfSafe(photoPath),
    toPdfSafe(stampPath),
  ]);
  const safeTemplatePath = Buffer.isBuffer(school.lc_template_data) ? school.lc_template_data : null;
  const qrBuffer = await QRCode.toBuffer(buildVerifyUrl(certificate.id), {
    width: 240, margin: 2, errorCorrectionLevel: 'H'
  }).catch((error) => {
    console.error('[PDF] Bonafide QR generation failed:', error.message);
    return null;
  });

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0 });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      if (canDraw(safeTemplatePath)) {
        try { doc.image(safeTemplatePath, 0, 0, { width: doc.page.width, height: doc.page.height }); } catch (e) {}
      } else {
        drawDoubleBorder(doc);
      }

      // ── Top row: Logo (left) | QR (centre) | Cert ID (right) ──
      const boxW    = 130;
      const certIdX = doc.page.width - 46 - boxW;
      // The QR block is 60pt tall while the certificate-number block is
      // shorter. Offset the latter by half the difference so both blocks
      // share the same vertical centre as the logo and QR.
      const metaTop = 42;
      const qrSize = 60;
      const certMetaHeight = 40;
      const certIdY = metaTop + (qrSize - certMetaHeight) / 2;
      drawIdBox(doc, certIdX, certIdY, 'CERTIFICATE NO.', certificate.serial_number, boxW);

      // QR horizontally centred on the certificate/content area itself —
      // not between the logo and cert-ID box, which drifts off-centre
      // whenever either block's width changes.
      if (qrBuffer) {
        const contentWidth = doc.page.width - 92; // 46pt margin each side, matches drawHeader/drawLcFooter
        const qrX = Math.round(46 + (contentWidth - qrSize) / 2);
        try { doc.image(qrBuffer, qrX, metaTop, { width: qrSize, height: qrSize }); } catch (e) {}
        doc.font('Helvetica').fontSize(5).fillColor(GREY)
          .text('Scan to verify', qrX, metaTop + qrSize + 2, { width: qrSize, align: 'center', lineBreak: false });
      }

      let y = drawHeader(doc, school, safeLogoPath);

      // ── Original / Duplicate pill ──
      const typeLabel      = sentenceCase(lcType || 'Original');
      const typeLabelColor = typeLabel === 'DUPLICATE' ? '#dc2626' : '#1d4ed8';
      doc.save()
        .roundedRect(doc.page.width / 2 - 55, y, 110, 18, 9)
        .fillColor(typeLabelColor).fill().restore();
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9)
        .text(typeLabel, doc.page.width / 2 - 55, y + 4.5, { width: 110, align: 'center', lineBreak: false });
      y += 26;

      y = drawTitleBanner(doc, y, 'School leaving certificate');

      // ── U-DISE / Roll No. / G.R. No. / Saral ID bar ──
      const contentWidth = doc.page.width - 92;
      const idBarSeg = contentWidth / 4;
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TEXT);
      doc.text(`U-DISE: ${sentenceCase(school.udise_code, '-')}`,       46,               y, { width: idBarSeg });
      doc.text(`Roll No.: ${sentenceCase(student.roll_number, '-')}`,   46 + idBarSeg,     y, { width: idBarSeg });
      doc.text(`G.R. No.: ${sentenceCase(student.register_number, '-')}`, 46 + 2 * idBarSeg, y, { width: idBarSeg });
      doc.text(`Saral ID: ${sentenceCase(student.serial_id, '-')}`,     46 + 3 * idBarSeg, y, { width: idBarSeg });
      y += 16;
      doc.font('Helvetica').fontSize(7.5).fillColor(GREY)
        .text(`Aadhar: ${student.aadhaar ? 'XXXX-XXXX-' + String(student.aadhaar).slice(-4) : '-'}`, 46, y, { width: contentWidth });
      y += 14;

      // ── Data rows — full content width, compact 18 pt height ──
      // Passed straight to fmtDate (not wrapped in `new Date()` first) so a
      // plain "YYYY-MM-DD" string never goes through UTC-midnight parsing.
      const leavingDate = dateOfLeaving ? fmtDate(dateOfLeaving) : '';

      const rows = [
        ['Name of student in full',        safe(student.full_name)],
        ["Mother's name",                  safe(student.mother_name, '-')],
        ['Religion / caste with sub-caste',`${safe(student.religion)} - ${safe(student.caste)}${student.sub_caste ? ' (' + student.sub_caste + ')' : ''}`],
        ['Nationality',                    safe(student.nationality, 'Indian')],
        ['Date of Birth in figures',       fmtDate(student.dob)],
        ['Date of Birth in words',         dobInWords(student.dob)],
        ['Place of Birth',                 [student.birth_village, student.birth_taluka, student.birth_district].filter(Boolean).join(', ')],
        ['Date of Admission',              fmtDate(student.admission_date)],
        ['Last School / College attended', safe(student.prev_school || student.previous_school, '—')],
        ['Progress',                       'Good'],
        ['Conduct',                        'Good'],
        ['Date of Leaving',                leavingDate],
        ['Date of admission (since when)', fmtDate(student.admission_date)],
        ['Reason for leaving',             safe(reasonForLeaving, '')],
        ['Class in which studying',        `${safe(student.current_standard || student.admission_standard)} standard (${safe(student.current_division || student.admission_division)})`],
        ['Remarks',                        safe(remarks, '')],
      ];

      let rowY = y;
      rows.forEach((r, i) => {
        rowY = drawDataRow(doc, 46, rowY, contentWidth, i + 1, r[0], r[1]);
      });

      // ── Footer: Check by (left) | Photo (centre) | HEAD MASTER (right) — one line ──
      const fw   = contentWidth;
      let fy     = rowY + 10;

      doc.save().dash(2, { space: 2 }).moveTo(46, fy).lineTo(46 + fw, fy).strokeColor('#cbd5e1').stroke().undash().restore();
      fy += 10;

      // Date / Place at top-left of footer block
      doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT)
        .text(`Date  : ${leavingDate || fmtDate(new Date())}`, 46, fy);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT)
        .text(`Place : ${sentenceCase(school.city || school.village || school.taluka)}`, 46, fy + 14);

      // Photo centred
      const photoW  = 80, photoH = 90;
      const photoX  = doc.page.width / 2 - photoW / 2;
      const photoY  = fy;
      drawPhotoPanel(doc, photoX, photoY, safePhotoPath, photoW, photoH);

      // Signature line baseline aligned to the bottom of the photo
      const LINE_Y = photoY + photoH;
      const C3     = 46 + fw * 0.68;
      const C3W    = fw * 0.32;

      // School stamp placed ABOVE the Head Master signature (right side)
      drawStampIfAvailable(doc, safeStampPath, C3 + C3W / 2 - 26, LINE_Y - 86, 52);
      drawSignatureIfAvailable(doc, safeSignaturePath, C3 + 10, LINE_Y - 30, 130, 28);

      doc.moveTo(46, LINE_Y).lineTo(46 + 160, LINE_Y).lineWidth(0.7).strokeColor('#999').stroke();
      doc.moveTo(C3, LINE_Y).lineTo(C3 + C3W - 4, LINE_Y).lineWidth(0.7).strokeColor('#999').stroke();

      doc.font('Helvetica').fontSize(9).fillColor(TEXT).text('Check by / prepared by', 46, LINE_Y + 5);
      // Principal name in brackets ABOVE the "HEAD MASTER" label
      if (school.principal_name) {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT)
          .text(`(${sentenceCase(school.principal_name)})`, C3, LINE_Y + 4, { width: C3W, align: 'center' });
        doc.font('Helvetica-Bold').fontSize(9)
          .text('Head master', C3, LINE_Y + 14, { width: C3W, align: 'center' });
        doc.font('Helvetica').fontSize(7.5).fillColor(GREY)
          .text(sentenceCase(school.name), C3, LINE_Y + 26, { width: C3W, align: 'center' });
      } else {
        doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT)
          .text('Head master', C3, LINE_Y + 5, { width: C3W, align: 'center' });
        doc.font('Helvetica').fontSize(8).fillColor(GREY)
          .text(sentenceCase(school.name), C3, LINE_Y + 17, { width: C3W, align: 'center' });
      }

      // Supplied transparent PNG frame is drawn last so its ornamentation
      // surrounds the text, QR image, birth date and principal details.
      if (!canDraw(safeTemplatePath)) {
        drawFrameIfAvailable(doc, LC_FRAME_PATH, 0, 0, doc.page.width, doc.page.height);
      }

      // Combined note at bottom — kept well clear of the page edge so a
      // school-uploaded border template (of realistic thickness) never
      // overlaps it, matching the ~46pt margin used everywhere else on
      // this certificate.
      const noteY = doc.page.height - 70;
      doc.save().moveTo(46, noteY).lineTo(46 + fw, noteY).lineWidth(1.2).strokeColor(GOLD).stroke().restore();
      doc.font('Helvetica-Oblique').fontSize(7).fillColor(GREY)
        .text(
          'No change in any entry in this certificate shall be made except by the authority issuing it. ' +
          'Certified that the above information is true to the best of our knowledge as per school records.',
          46, noteY + 6, { width: fw, align: 'center' }
        );

      doc.end();
      stream.on('finish', () => resolve(outputPath));
      stream.on('error', reject);
    } catch (e) { reject(e); }
  });
}

// ── BONAFIDE CERTIFICATE ─────────────────────────────────────────────────────
// Single copy, A4 landscape. Photo and QR at bottom-right area.
// Renders one bonafide copy starting at yOffset on a portrait A4 page.
// ALL content is strictly clipped to [MAR … MAR+CONT_W] so it can never
// bleed into the right-panel (photo / cert-ID) column.
function renderBonafideCopy(doc, ctx, qrBuffer, yOffset, copyLabel) {
  const { school, student, certificate, purpose, photoPath, logoPath, signaturePath, stampPath, framePath, templatePath } = ctx;

  const PAGE_W = doc.page.width;       // 595.28
  const COPY_H = doc.page.height / 2;  // 420.94  — half of A4 portrait

  // A school template is a background, so it must be placed before all
  // dynamic content. The built-in transparent frame remains an end overlay.
  if (canDraw(templatePath)) {
    try { doc.image(templatePath, 0, yOffset, { width: PAGE_W, height: COPY_H }); } catch (e) {}
  }

  // ── Layout constants ─────────────────────────────────────────────────────
  const MAR    = 30;                    // left / right page margin
  const FULL_W = PAGE_W - MAR * 2;      // full inner width ≈ 535

  // Start INSIDE the double border (outer at yOffset+10/+2, inner at +8 more)
  let y = yOffset + 22;

  // ── Copy label pill ("STUDENT COPY" / "SCHOOL COPY") — centered ──────────
  const PILL_W = 110;
  doc.save().roundedRect((PAGE_W - PILL_W) / 2, y, PILL_W, 13, 6).fillColor(NAVY).fill().restore();
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(6.5)
    .text(copyLabel, (PAGE_W - PILL_W) / 2, y + 3.5, { width: PILL_W, align: 'center', lineBreak: false });
  y += 17;

  const headerTop = y;

  // ── LOGO (top-left) ───────────────────────────────────────────────────────
  const LOGO_SZ = 42;
  if (canDraw(logoPath)) {
    try { doc.image(logoPath, MAR + 4, headerTop, { width: LOGO_SZ, height: LOGO_SZ }); }
    catch (e) {}
  } else {
    doc.save().circle(MAR + 4 + LOGO_SZ / 2, headerTop + LOGO_SZ / 2, LOGO_SZ / 2)
      .lineWidth(1).strokeColor(NAVY).stroke().restore();
  }

  // ── RIGHT: "BONAFIDE NO." pill + serial + QR ─────────────────────────────
  const RP_W = 118;
  const RP_X = PAGE_W - MAR - RP_W;
  let ry = headerTop;
  doc.save().roundedRect(RP_X, ry, RP_W, 14, 3).fillColor(NAVY).fill().restore();
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(6.5)
    .text('BONAFIDE NO.', RP_X, ry + 3.5, { width: RP_W, align: 'center', lineBreak: false });
  ry += 17;
  let snSz = 8.5;
  doc.font('Helvetica-Bold');
  while (snSz > 5.5 && doc.fontSize(snSz).widthOfString(certificate.serial_number) > RP_W - 4) snSz -= 0.5;
  doc.fontSize(snSz).fillColor('#D6272B')
    .text(certificate.serial_number, RP_X, ry, { width: RP_W, align: 'center', lineBreak: false });
  ry += snSz + 5;
  if (qrBuffer) {
    const qrSz = 64;
    try { doc.image(qrBuffer, RP_X + (RP_W - qrSz) / 2, ry, { width: qrSz, height: qrSz }); } catch (e) {}
    ry += qrSz;
  }

  // ── SCHOOL HEADER (center column, between logo and right panel) ──────────
  const TX = MAR + LOGO_SZ + 12;
  const TW = RP_X - TX - 8;
  let ty = headerTop;
  ty = fitCenteredText(doc, 'MAHARASHTRA STATE EDUCATION BOARD', TX, ty, TW, 11, NAVY) + 3;
  ty = fitCenteredText(doc, safe(school.name, 'SCHOOL NAME').toUpperCase(), TX, ty, TW, 12.5, NAVY) + 3;
  doc.font('Helvetica').fontSize(7.5).fillColor(TEXT)
    .text(`Taluka: ${safe(school.taluka)}, District: ${safe(school.district)}`,
      TX, ty, { width: TW, align: 'center', lineBreak: false });
  ty += 10;
  doc.font('Helvetica').fontSize(7).fillColor(GREY)
    .text(`U-DISE: ${safe(school.udise_code)}  |  RECOG NO: ${safe(school.recog_no)}`,
      TX, ty, { width: TW, align: 'center', lineBreak: false });
  ty += 10;

  // Keep the full-width student-number row below the QR's reserved area.
  // Previously the QR visually covered Roll No. / SARAL ID and reduced
  // the quiet zone needed by phone scanners.
  y = Math.max(headerTop + LOGO_SZ, ty, ry) + 9;

  // ── GR / Roll / SARAL row (full width) ────────────────────────────────────
  const SEG = FULL_W / 3;
  doc.font('Helvetica').fontSize(7.5).fillColor(TEXT);
  doc.text(`Gr. No.: ${safe(student.register_number,'—')}`, MAR,          y, { width: SEG, lineBreak: false });
  doc.text(`Roll No.: ${safe(student.roll_number,'—')}`,    MAR + SEG,    y, { width: SEG, align: 'center', lineBreak: false });
  doc.text(`SARAL ID: ${safe(student.serial_id,'—')}`,      MAR + 2*SEG,  y, { width: SEG, align: 'right', lineBreak: false });
  y += 12;

  // ── BONAFIDE CERTIFICATE banner (full width) ──────────────────────────────
  doc.save()
    .roundedRect(MAR, y, FULL_W, 18, 4).fillColor(NAVY).fill()
    .lineWidth(0.7).strokeColor(GOLD).roundedRect(MAR, y, FULL_W, 18, 4).stroke()
    .restore();
  fitCenteredText(doc, 'BONAFIDE CERTIFICATE', MAR, y + 4, FULL_W, 11, '#fff');
  y += 26;

  // ── Body: paragraph style ─────────────────────────────────────────────────
  const heShe   = student.gender === 'Male' ? 'He' : student.gender === 'Female' ? 'She' : 'He/She';
  const hisHer  = student.gender === 'Male' ? 'His' : student.gender === 'Female' ? 'Her' : 'His/Her';

  doc.font('Helvetica').fontSize(8).fillColor(TEXT)
    .text('This is to certify that', MAR, y, { width: FULL_W, align: 'center' });
  y += 12;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY)
    .text(safe(student.full_name).toUpperCase(), MAR, y, { width: FULL_W, align: 'center' });
  y += 16;

  const birthPlace = [
    student.birth_village,
    student.birth_taluka   && 'Tal. '  + student.birth_taluka,
    student.birth_district && 'Dist. ' + student.birth_district,
  ].filter(Boolean).join(', ');

  const para =
    `is / was a bonafide student of this School / College studying in Std. ${safe(student.admission_standard)}` +
    (student.admission_division ? ` (Div. ${safe(student.admission_division)})` : '') +
    ` during the year ${safe(student.academic_year) || currentAcademicYear()}` +
    `. Mother's name is ${safe(student.mother_name).toUpperCase()}. ` +
    `${heShe} is ${safe(student.caste, 'N/A')} by Caste. ` +
    `${hisHer} date of Birth according to our Register is ${fmtDate(student.dob)} ` +
    `(in words ${dobInWords(student.dob)}). ` +
    `${hisHer} place of Birth is ${birthPlace || '-'}. ` +
    `${heShe} bears a good moral character.` +
    (purpose ? ` This certificate is issued on the request of the student / parent for the purpose of: ${purpose}.` : '');

  // Shrink paragraph font until it fits above the footer band (CERT_Y).
  const CERT_Y   = yOffset + COPY_H - 96;  // dotted "Certified..." band
  // Photo box (66×80) sits at the right, just above CERT_Y — keep the
  // paragraph clear of its top edge so text never runs into the photo.
  const availH   = (CERT_Y - 88) - y - 6;
  let pSz = 8, pGap = 3;
  doc.font('Helvetica');
  while (pSz > 5.5 &&
         doc.fontSize(pSz).heightOfString(para, { width: FULL_W - 12, lineGap: pGap }) > availH) {
    pSz -= 0.5;
    if (pGap > 1) pGap -= 0.5;
  }
  doc.fontSize(pSz).fillColor(TEXT)
    .text(para, MAR + 6, y, { width: FULL_W - 12, align: 'center', lineGap: pGap, height: availH, ellipsis: true });

  // ── STUDENT PHOTO — in the blank area at right, between paragraph & footer ──
  const PH_W = 66, PH_H = 80;
  const phX = MAR + FULL_W - PH_W - 6;
  const phY = CERT_Y - PH_H - 8;
  doc.save().roundedRect(phX, phY, PH_W, PH_H, 3).lineWidth(0.8).strokeColor(GOLD).stroke().restore();
  if (canDraw(photoPath)) {
    try { doc.image(photoPath, phX + 1, phY + 1, { width: PH_W - 2, height: PH_H - 2 }); }
    catch (e) { console.error('[PDF] bonafide photo:', e.message); }
  } else {
    doc.font('Helvetica').fontSize(7).fillColor(GREY)
      .text('PHOTO', phX, phY + PH_H / 2 - 4, { width: PH_W, align: 'center', lineBreak: false });
  }

  // ── Footer (anchored to bottom of the copy, clear of the inner border) ───
  // Inner border sits ~yOffset+COPY_H-10; keep everything above yOffset+COPY_H-24.
  const FOOTER_Y = CERT_Y + 18;            // DATE / PLACE block
  const LINE_Y   = FOOTER_Y + 32;          // signature lines

  // dotted separator + certified line
  doc.save().dash(2, { space: 2 })
    .moveTo(MAR, CERT_Y).lineTo(MAR + FULL_W, CERT_Y)
    .lineWidth(0.5).strokeColor('#9ca3af').stroke().undash().restore();
  doc.font('Helvetica').fontSize(7).fillColor(GREY)
    .text('Certified that the above information is true to the best of our knowledge as per school records.',
      MAR, CERT_Y + 5, { width: FULL_W, align: 'center', lineBreak: false });

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(TEXT);
  doc.text(`DATE : ${fmtDate(new Date())}`, MAR, FOOTER_Y, { lineBreak: false });
  doc.text(`PLACE : ${safe(school.city || school.village || school.taluka)}, Dist. ${safe(school.district)}`,
    MAR, FOOTER_Y + 10, { lineBreak: false });

  // Right block, stacked order: 1) seal  2) signature  3) (name)  4) HEAD MASTER
  const FC3  = MAR + FULL_W * 0.68;
  const FC3W = FULL_W * 0.32;

  drawStampIfAvailable(doc, stampPath, FC3 + FC3W / 2 - 18, LINE_Y - 44, 36);
  drawSignatureIfAvailable(doc, signaturePath, FC3, LINE_Y - 24, FC3W - 10, 20);

  doc.save().moveTo(MAR, LINE_Y).lineTo(MAR + 120, LINE_Y).lineWidth(0.5).strokeColor('#aaa').stroke().restore();
  doc.save().moveTo(FC3, LINE_Y).lineTo(FC3 + FC3W - 2, LINE_Y).lineWidth(0.5).strokeColor('#aaa').stroke().restore();

  doc.font('Helvetica').fontSize(6.5).fillColor(TEXT).text('Class Teacher', MAR, LINE_Y + 3, { lineBreak: false });
  if (school.principal_name) {
    doc.font('Helvetica-Bold').fontSize(6).fillColor(TEXT)
      .text(`(${safe(school.principal_name).toUpperCase()})`, FC3, LINE_Y + 2, { width: FC3W, align: 'center', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(6.5)
      .text('HEAD MASTER', FC3, LINE_Y + 10, { width: FC3W, align: 'center', lineBreak: false });
  } else {
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(TEXT)
      .text('HEAD MASTER', FC3, LINE_Y + 3, { width: FC3W, align: 'center', lineBreak: false });
    doc.font('Helvetica').fontSize(6).fillColor(GREY)
      .text(safe(school.name), FC3, LINE_Y + 11, { width: FC3W, align: 'center', lineBreak: false });
  }

  // Draw the supplied transparent frame after all content. The frame's
  // transparent centre preserves the QR image, DOB and principal details.
  drawFrameIfAvailable(doc, framePath, 0, yOffset, PAGE_W, COPY_H);
}

// Small filled check mark, drawn as a path rather than relying on a font
// glyph (Helvetica's WinAnsi encoding doesn't reliably include ✓).
function drawCheckGlyph(doc, cx, cy, size, color) {
  const s = size / 2;
  doc.save().lineWidth(Math.max(1, size / 5)).strokeColor(color).lineCap('round').lineJoin('round')
    .moveTo(cx - s, cy).lineTo(cx - s / 4, cy + s * 0.7).lineTo(cx + s, cy - s * 0.6)
    .stroke().restore();
}

// Small padlock, drawn from a rounded body + a stroked shackle arc — same
// reasoning as the check mark above (no dependable lock glyph in Helvetica).
function drawLockGlyph(doc, cx, topY, size, color) {
  const bodyW = size, bodyH = size * 0.8;
  const bodyX = cx - bodyW / 2, bodyY = topY + size * 0.35;
  doc.save().strokeColor(color).lineWidth(1.2)
    .path(`M ${bodyX + 2} ${bodyY} A ${bodyW / 2 - 2} ${size * 0.35} 0 0 1 ${bodyX + bodyW - 2} ${bodyY}`)
    .stroke().restore();
  doc.save().roundedRect(bodyX, bodyY, bodyW, bodyH, 1.5).fillColor(color).fill().restore();
}

// Small ornamental divider used either side of the board-name line —
// a short gold hairline with a diamond at its outer end.
function drawFlourish(doc, x, y, lineW, towardRight) {
  const dx = towardRight ? lineW : -lineW;
  doc.save().moveTo(x, y).lineTo(x + dx, y).lineWidth(0.6).strokeColor(GOLD).stroke().restore();
  const dCx = x + dx;
  doc.save().translate(dCx, y).rotate(45).rect(-2.5, -2.5, 5, 5).fillColor(GOLD).fill().restore();
}

// Renders one landscape bonafide certificate. Layout modeled directly on a
// reference design the school provided: board/school identity + circular
// emblem + certificate-ID/QR block up top, a labeled ID row, a navy title
// banner, a centered certificate body, a photo with a "digitally signed"
// badge, a 3-box Date/Place/Verified strip, and a 3-column signature row
// with a seal in the middle.
function renderSingleBonafide(doc, ctx, qrBuffer) {
  const { school, student, certificate, purpose, photoPath, logoPath, signaturePath, stampPath, templatePath } = ctx;
  const W = doc.page.width;
  const H = doc.page.height;
  const black = TEXT;
  const muted = GREY;
  const left = 36;
  const right = W - 36;
  const contentW = right - left;

  if (canDraw(templatePath)) {
    try { doc.image(templatePath, 0, 0, { width: W, height: H }); } catch (e) {}
  } else {
    doc.rect(0, 0, W, H).fill('#FFFFFF');
    drawDoubleBorder(doc, 8, H - 8);
  }

  // ── "STUDENT COPY" pill, top centre ──────────────────────────────────────
  const pillW = 110;
  doc.save().roundedRect((W - pillW) / 2, 16, pillW, 15, 7).fillColor(NAVY).fill().restore();
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7.5)
    .text('STUDENT COPY', (W - pillW) / 2, 20, { width: pillW, align: 'center', lineBreak: false });

  // ── Header: emblem (left) | board/school identity (centre) | cert-ID + QR (right) ──
  // Everything here starts below the "STUDENT COPY" pill (bottom edge y=31)
  // with a clear gap, so nothing overlaps it.
  const logoSz = 60;
  const logoCx = left + 46, logoCy = 80;
  if (canDraw(logoPath)) {
    try { doc.save().circle(logoCx, logoCy, logoSz / 2).clip().image(logoPath, logoCx - logoSz / 2, logoCy - logoSz / 2, { width: logoSz, height: logoSz }).restore(); } catch (e) {}
  }
  doc.save().circle(logoCx, logoCy, logoSz / 2).lineWidth(1.5).strokeColor(NAVY).stroke()
    .circle(logoCx, logoCy, logoSz / 2 - 3).lineWidth(0.6).strokeColor(GOLD).stroke().restore();

  const idBoxW = 130, idBoxX = right - idBoxW;
  doc.save().roundedRect(idBoxX, 36, idBoxW, 14, 3).fillColor(NAVY).fill().restore();
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7)
    .text('CERTIFICATE ID', idBoxX, 40, { width: idBoxW, align: 'center', lineBreak: false });
  let idSz = 11;
  doc.font('Helvetica-Bold');
  while (idSz > 6.5 && doc.fontSize(idSz).widthOfString(safe(certificate.serial_number, '-')) > idBoxW - 6) idSz -= 0.5;
  doc.fontSize(idSz).fillColor('#D6272B')
    .text(safe(certificate.serial_number, '-'), idBoxX, 53, { width: idBoxW, align: 'center', lineBreak: false });
  const qrSize = 58, qrX = idBoxX + (idBoxW - qrSize) / 2, qrY = 68;
  if (qrBuffer) {
    try { doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize }); } catch (e) {}
  }
  doc.fillColor(muted).font('Helvetica').fontSize(6)
    .text(`S/N: ${safe(certificate.serial_number, '-')}`, idBoxX, qrY + qrSize + 3, { width: idBoxW, align: 'center', lineBreak: false, ellipsis: true });

  const textX = logoCx + logoSz / 2 + 16;
  const textW = idBoxX - 16 - textX;
  const boardY = 38;
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13)
    .text('MAHARASHTRA STATE EDUCATION BOARD', textX, boardY, { width: textW, align: 'center', lineBreak: false, ellipsis: true });
  drawFlourish(doc, textX + 2, boardY + 6, 8, false);
  drawFlourish(doc, textX + textW - 2, boardY + 6, 8, true);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(17)
    .text(safe(school.name, 'SCHOOL NAME').toUpperCase(), textX, boardY + 18, { width: textW, align: 'center', lineBreak: false, ellipsis: true });
  doc.fillColor(black).font('Helvetica').fontSize(8.5)
    .text(`Taluka: ${safe(school.taluka, '-')}, District: ${safe(school.district, '-')}, Maharashtra`,
      textX, boardY + 40, { width: textW, align: 'center', lineBreak: false, ellipsis: true });
  doc.fillColor(muted).font('Helvetica').fontSize(7.5)
    .text(`U-DISE: ${safe(school.udise_code, '-')}   |   RECOG NO: ${safe(school.recog_no, '-')}`,
      textX, boardY + 53, { width: textW, align: 'center', lineBreak: false, ellipsis: true });

  // ── ID row: Gr. No. / Roll No. / SARAL ID / Aadhar No. ───────────────────
  const idRowY = 140;
  doc.save().moveTo(left, idRowY - 6).lineTo(right, idRowY - 6).lineWidth(0.6).strokeColor(GOLD).stroke().restore();
  const idFields = [
    ['Gr. No.', safe(student.register_number, '-')],
    ['Roll No.', safe(student.roll_number, '-')],
    ['SARAL ID', safe(student.serial_id, '-')],
    ['Aadhar No.', student.aadhaar ? 'XXXX-XXXX-' + String(student.aadhaar).slice(-4) : '-'],
  ];
  const idSeg = contentW / idFields.length;
  idFields.forEach(([label, value], i) => {
    const x = left + i * idSeg;
    doc.circle(x + 6, idRowY + 4, 2.5).fillColor(GOLD).fill();
    doc.fillColor(black).font('Helvetica-Bold').fontSize(7.5)
      .text(`${label}: `, x + 14, idRowY, { continued: true, lineBreak: false });
    doc.font('Helvetica').fillColor(muted).text(value, { lineBreak: false, width: idSeg - 18 });
  });

  // ── "This is to certify that" + title banner ──────────────────────────────
  doc.fillColor(muted).font('Helvetica-Oblique').fontSize(9)
    .text('This is to certify that', left, 162, { width: contentW, align: 'center', lineBreak: false });

  const bannerY = 176, bannerH = 22;
  doc.save().roundedRect(left, bannerY, contentW, bannerH, 5).fillColor(NAVY).fill()
    .lineWidth(1).strokeColor(GOLD).roundedRect(left, bannerY, contentW, bannerH, 5).stroke()
    .restore();
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(14)
    .text('BONAFIDE CERTIFICATE', left, bannerY + 6, { width: contentW, align: 'center', lineBreak: false });

  // ── Student name ───────────────────────────────────────────────────────
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(17)
    .text(safe(student.full_name).toUpperCase(), left, 208, { width: contentW, align: 'center', lineBreak: false, ellipsis: true });

  // ── Body paragraph (centered, shrink-to-fit above the footer strip) ──────
  const heShe = student.gender === 'Male' ? 'He' : student.gender === 'Female' ? 'She' : 'He/She';
  const hisHer = student.gender === 'Male' ? 'His' : student.gender === 'Female' ? 'Her' : 'His/Her';
  const birthPlace = [
    student.birth_village,
    student.birth_taluka && `Tal. ${student.birth_taluka}`,
    student.birth_district && `Dist. ${student.birth_district}`,
  ].filter(Boolean).join(', ');
  const currentDivision = student.current_division || student.admission_division;
  const standardValue = safe(student.current_standard || student.admission_standard, '-') +
    (currentDivision ? ` Div. ${safe(currentDivision)}` : '');

  let para = `is / was a bonafide student of this School / College Studying in Std. ${standardValue} ` +
    `during the year ${safe(student.academic_year) || currentAcademicYear()}. Mother's name is ${safe(student.mother_name, '-').toUpperCase()}. ` +
    `${heShe} is ${safe(student.caste, 'N/A')} by Caste. ${hisHer} date of Birth according to our Register is ${fmtDate(student.dob)} ` +
    `(in words ${dobInWords(student.dob)}). ${hisHer} place of Birth is ${birthPlace || '-'}. ${heShe} bears a good moral character.`;
  if (purpose) para += ` This certificate is issued on the request for the purpose of: ${purpose}.`;

  const bodyY = 232;
  const photoResW = 66, photoResX = right - photoResW - 4;
  const bodyW = contentW - photoResW - 16;
  const bodyBottom = 344;
  let bodySize = 10.5;
  doc.font('Helvetica');
  while (bodySize > 7 && doc.fontSize(bodySize).heightOfString(para, { width: bodyW, align: 'center', lineGap: 2 }) > bodyBottom - bodyY) bodySize -= 0.5;
  doc.fillColor(black).fontSize(bodySize)
    .text(para, left, bodyY, { width: bodyW, align: 'center', lineGap: 2 });

  // ── Student photo + digitally-signed badge, right of the body text ───────
  const photoResH = 78, photoResY = bodyY;
  doc.save().roundedRect(photoResX, photoResY, photoResW, photoResH, 3).lineWidth(1).strokeColor(GOLD).stroke().restore();
  if (canDraw(photoPath)) {
    try { doc.image(photoPath, photoResX + 1, photoResY + 1, { width: photoResW - 2, height: photoResH - 2 }); } catch (e) {}
  } else {
    doc.fillColor(muted).font('Helvetica').fontSize(7)
      .text('PHOTO', photoResX, photoResY + photoResH / 2 - 4, { width: photoResW, align: 'center', lineBreak: false });
  }
  const badgeY = photoResY + photoResH + 6, badgeH = 14;
  doc.save().roundedRect(photoResX, badgeY, photoResW, badgeH, 6).fillColor('#ECFDF5').fill()
    .lineWidth(0.6).strokeColor('#10B981').roundedRect(photoResX, badgeY, photoResW, badgeH, 6).stroke().restore();
  drawCheckGlyph(doc, photoResX + 10, badgeY + badgeH / 2, 7, '#10B981');
  doc.fillColor('#047857').font('Helvetica-Bold').fontSize(6.2)
    .text('Digitally Signed', photoResX + 16, badgeY + 4, { width: photoResW - 18, lineBreak: false });

  // ── Footer strip: Date of Issue | Place | Verified ───────────────────────
  const stripY = 354, stripH = 44, stripSeg = contentW / 3;
  doc.save().moveTo(left, stripY - 8).lineTo(right, stripY - 8).lineWidth(0.6).strokeColor(GOLD).stroke().restore();

  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(7.5)
    .text('DATE OF ISSUE', left, stripY, { width: stripSeg, align: 'center', lineBreak: false });
  doc.fillColor(black).font('Helvetica').fontSize(9)
    .text(fmtDate(new Date()), left, stripY + 12, { width: stripSeg, align: 'center', lineBreak: false });

  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(7.5)
    .text('PLACE', left + stripSeg, stripY, { width: stripSeg, align: 'center', lineBreak: false });
  doc.fillColor(black).font('Helvetica').fontSize(9)
    .text(`${safe(school.city || school.village || school.taluka, '-')}, Dist. ${safe(school.district, '-')}`,
      left + stripSeg, stripY + 12, { width: stripSeg, align: 'center', lineBreak: false, ellipsis: true });

  const verX = left + stripSeg * 2;
  drawLockGlyph(doc, verX + stripSeg / 2, stripY - 2, 11, NAVY);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(7.5)
    .text('VERIFIED', verX, stripY + 12, { width: stripSeg, align: 'center', lineBreak: false });
  doc.fillColor(muted).font('Helvetica').fontSize(6)
    .text('This is a digitally-generated certificate. No physical signature is needed.',
      verX + 6, stripY + 23, { width: stripSeg - 12, align: 'center', lineGap: 1 });

  // ── Signature row: Class Teacher | seal | Principal ──────────────────────
  const sigY = 414, lineY = sigY + 32;
  const sigColW = contentW / 3;

  if (canDraw(signaturePath)) {
    try { doc.image(signaturePath, left + 20, sigY, { width: sigColW - 60, height: 24, fit: [sigColW - 60, 24] }); } catch (e) {}
  }
  doc.save().moveTo(left + 15, lineY).lineTo(left + sigColW - 25, lineY).lineWidth(0.7).strokeColor('#999').stroke().restore();
  doc.fillColor(black).font('Helvetica-Bold').fontSize(8)
    .text('Class Teacher', left + 15, lineY + 4, { width: sigColW - 40, align: 'center', lineBreak: false });

  const sealCx = W / 2, sealCy = lineY - 10, sealR = 26;
  if (canDraw(stampPath)) {
    try { doc.save().circle(sealCx, sealCy, sealR).clip().image(stampPath, sealCx - sealR, sealCy - sealR, { width: sealR * 2, height: sealR * 2 }).restore(); } catch (e) {}
  }
  doc.save().circle(sealCx, sealCy, sealR).lineWidth(1.2).strokeColor(NAVY).stroke()
    .circle(sealCx, sealCy, sealR - 4).lineWidth(0.6).strokeColor(GOLD).stroke().restore();

  const principalSigX = right - (sigColW - 40);
  if (canDraw(signaturePath)) {
    try { doc.image(signaturePath, principalSigX, sigY, { width: sigColW - 60, height: 24, fit: [sigColW - 60, 24] }); } catch (e) {}
  }
  doc.save().moveTo(right - sigColW + 25, lineY).lineTo(right - 15, lineY).lineWidth(0.7).strokeColor('#999').stroke().restore();
  doc.fillColor(black).font('Helvetica-Bold').fontSize(8)
    .text('Principal', right - sigColW + 25, lineY + 4, { width: sigColW - 40, align: 'center', lineBreak: false });
  doc.fillColor(muted).font('Helvetica').fontSize(6.5)
    .text('(Digital Signature)', right - sigColW + 25, lineY + 15, { width: sigColW - 40, align: 'center', lineBreak: false });
}

async function generateBonafidePdf({ school, student, certificate, outputPath, photoPath, logoPath, purpose, signaturePath, stampPath }) {
  const [safeLogoPath, safeSignaturePath, safeStampPath, safePhotoPath] = await Promise.all([
    toPdfSafe(logoPath),
    toPdfSafe(signaturePath),
    toPdfSafe(stampPath),
    toPdfSafe(photoPath),
  ]);
  const templatePath = Buffer.isBuffer(school.bonafide_template_data) ? school.bonafide_template_data : null;
  const qrBuffer = await QRCode.toBuffer(buildVerifyUrl(certificate.id), { width: 80, margin: 1 }).catch(() => null);

  return new Promise((resolve, reject) => {
    try {
      // One landscape page. The supplied PNG already contains the Student Copy
      // label, so it must not be repeated by the PDF renderer.
      const doc = new PDFDocument({ size: [842, 555.37], margin: 0 });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      const ctx = {
        school, student, certificate, purpose,
        photoPath: safePhotoPath, logoPath: safeLogoPath,
        signaturePath: safeSignaturePath, stampPath: safeStampPath,
        templatePath: templatePath || BONAFIDE_FRAME_PATH,
      };

      renderSingleBonafide(doc, ctx, qrBuffer);

      doc.end();
      stream.on('finish', () => resolve(outputPath));
      stream.on('error', reject);
    } catch (e) { reject(e); }
  });
}

module.exports = { generateLcPdf, generateBonafidePdf, genSerial, fmtDate, dobInWords, fitCenteredText, fitSingleLineText, safe, sentenceCase };
