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

// Renders one supplied landscape bonafide design. The artwork is intentionally
// drawn first; its Student Copy heading and decorative border are already part
// of the PNG and must not be recreated in PDF text.
function renderSingleBonafide(doc, ctx, qrBuffer) {
  const { school, student, certificate, purpose, photoPath, logoPath, signaturePath, stampPath, templatePath } = ctx;
  const W = doc.page.width;
  const H = doc.page.height;
  // Same NAVY/GOLD/TEXT/GREY palette as the LC certificate (drawHeader /
  // drawTitleBanner) so the two certificates read as one professional
  // system rather than two different designs.
  const black = TEXT;
  const muted = GREY;
  // Keep the live content inside an even inset on every side of the frame.
  const left = 70;
  const right = W - 70;
  const contentW = right - left;

  if (canDraw(templatePath)) {
    try { doc.image(templatePath, 0, 0, { width: W, height: H }); } catch (e) {}
  } else {
    doc.rect(0, 0, W, H).fill('#FFFFFF');
    drawDoubleBorder(doc, 8, H - 8);
  }

  const photoW = 72;
  const photoH = 88;
  const qrSize = 70;
  // Reserve the same width on both sides so the certificate body stays
  // visually centered when the photo is on the left and QR is on the right.
  const sideW = 100;
  const textW = contentW - sideW * 2;
  const textX = left + sideW;
  const sideX = right - sideW;

  // Logo, top-left of the text column — matches LC's header, which always
  // leads with the school logo.
  const logoSz = 34;
  if (canDraw(logoPath)) {
    try { doc.image(logoPath, textX, 68, { width: logoSz, height: logoSz }); } catch (e) {}
  } else {
    doc.save().circle(textX + logoSz / 2, 68 + logoSz / 2, logoSz / 2).lineWidth(1).strokeColor(NAVY).stroke().restore();
  }

  // School identity sits below the artwork's built-in Student Copy heading.
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8)
    .text('MAHARASHTRA STATE EDUCATION BOARD', textX, 71, {
      width: textW, align: 'center', lineBreak: false, ellipsis: true
    });
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(14)
    .text(safe(school.name, 'SCHOOL NAME').toUpperCase(), textX, 84, {
      width: textW, align: 'center', lineBreak: false, ellipsis: true
    });
  doc.fillColor(black).font('Helvetica').fontSize(7.5)
    .text(
      `Taluka: ${safe(school.taluka, '-')}  |  District: ${safe(school.district, '-')}`,
      textX, 101, { width: textW, align: 'center', lineBreak: false, ellipsis: true }
    );
  doc.fillColor(muted).fontSize(7)
    .text(
      `U-DISE: ${safe(school.udise_code, '-')}  |  Recognized No.: ${safe(school.recog_no, '-')}`,
      textX, 113, { width: textW, align: 'center', lineBreak: false, ellipsis: true }
    );

  // Title banner — same solid NAVY / GOLD-border style as the LC certificate's
  // drawTitleBanner, instead of the previous plain colored text.
  const bannerY = 128;
  const bannerH = 17;
  doc.save().roundedRect(textX, bannerY, textW, bannerH, 4).fillColor(NAVY).fill()
    .lineWidth(0.8).strokeColor(GOLD).roundedRect(textX, bannerY, textW, bannerH, 4).stroke()
    .restore();
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(11)
    .text('BONAFIDE CERTIFICATE', textX, bannerY + 4, { width: textW, align: 'center', lineBreak: false });

  const heShe = student.gender === 'Male' ? 'He' : student.gender === 'Female' ? 'She' : 'He/She';
  const hisHer = student.gender === 'Male' ? 'His' : student.gender === 'Female' ? 'Her' : 'His/Her';
  const birthPlace = [
    student.birth_village,
    student.birth_taluka && `Tal. ${student.birth_taluka}`,
    student.birth_district && `Dist. ${student.birth_district}`,
  ].filter(Boolean).join(', ');
  const currentDivision = student.current_division || student.admission_division;
  const standardValue = safe(student.current_standard || student.admission_standard, '-') +
    (currentDivision ? ` (Div. ${safe(currentDivision)})` : '');

  // Split into (text, bold) segments instead of one flat string, so the
  // school-entered values stand out — everything the school typed in is
  // bold, the surrounding certificate wording stays regular weight.
  const segments = [
    { text: 'This is to certify that ' },
    { text: safe(student.full_name).toUpperCase(), bold: true },
    { text: ' is / was a bonafide student of this School / College studying in Std. ' },
    { text: standardValue, bold: true },
    { text: ' during the year ' },
    { text: safe(student.academic_year) || currentAcademicYear(), bold: true },
    { text: `. Mother's name is ` },
    { text: safe(student.mother_name, '-').toUpperCase(), bold: true },
    { text: `. ${heShe} is ` },
    { text: safe(student.caste, 'N/A'), bold: true },
    { text: ` by Caste. ${hisHer} date of Birth according to our Register is ` },
    { text: `${fmtDate(student.dob)} (in words ${dobInWords(student.dob)})`, bold: true },
    { text: `. ${hisHer} place of Birth is ` },
    { text: birthPlace || '-', bold: true },
    { text: `. ${heShe} bears a good moral character.` },
  ];
  if (purpose) {
    segments.push({ text: ' This certificate is issued for: ' }, { text: String(purpose), bold: true }, { text: '.' });
  }
  const plainPara = segments.map(s => s.text).join('');

  // Give the dynamic content real visual weight — roughly a third to a half
  // of the page, not the cramped ~22% box this used to be squeezed into.
  // Measured against the plain (non-bold) concatenation, which is narrower
  // than the mixed bold/regular render, so the chosen size always still fits.
  const bodyX = textX + 10;
  const bodyW = textW - 20;
  const bodyH = 164;
  const bodyY = 157;
  let bodySize = 14;
  while (bodySize > 8 && doc.font('Helvetica').fontSize(bodySize)
    .heightOfString(plainPara, { width: bodyW, lineGap: 3 }) > bodyH) bodySize -= 0.5;
  // pdfkit's `continued: true` reliably flows mixed-font text only under
  // left alignment — combined with `align: 'center'` it recomputes centering
  // per fragment instead of per line, scrambling multi-line output. Left
  // alignment is also the more common real-world certificate body style.
  doc.fillColor(black).fontSize(bodySize);
  segments.forEach((seg, i) => {
    doc.font(seg.bold ? 'Helvetica-Bold' : 'Helvetica');
    const isLast = i === segments.length - 1;
    if (i === 0) {
      doc.text(seg.text, bodyX, bodyY, { width: bodyW, height: bodyH, align: 'left', lineGap: 3, continued: !isLast });
    } else {
      doc.text(seg.text, { continued: !isLast });
    }
  });

  // Everything below shifts down by the same amount the paragraph box grew
  // (124 -> 164, +40) so nothing overlaps the larger text above.
  const Y = (v) => v + 40;

  // Keep the certificate body above the media row. The QR stays on the right,
  // but both media blocks begin only after the complete text paragraph.
  doc.fillColor(gold).font('Helvetica-Bold').fontSize(7)
    .text('BONAFIDE NO.', sideX, Y(287), { width: sideW, align: 'center', lineBreak: false });
  doc.fillColor(black).fontSize(8)
    .text(safe(certificate.serial_number, '-'), sideX, Y(298), { width: sideW, align: 'center', lineBreak: false, ellipsis: true });
  if (qrBuffer) {
    try { doc.image(qrBuffer, sideX + (sideW - qrSize) / 2, Y(313), { width: qrSize, height: qrSize }); } catch (e) {}
    doc.fillColor(muted).font('Helvetica').fontSize(5.5)
      .text('Scan to verify', sideX, Y(385), { width: sideW, align: 'center', lineBreak: false });
  }

  // Student photo sits below the text in the matching left-side column.
  const photoLeftX = left + (sideW - photoW) / 2;
  doc.save().roundedRect(photoLeftX, Y(292), photoW, photoH, 3)
    .lineWidth(0.8).strokeColor(gold).stroke().restore();
  if (canDraw(photoPath)) {
    try { doc.image(photoPath, photoLeftX + 1, Y(293), { width: photoW - 2, height: photoH - 2 }); } catch (e) {}
  } else {
    doc.fillColor(muted).font('Helvetica').fontSize(7)
      .text('PHOTO', photoLeftX, Y(329), { width: photoW, align: 'center', lineBreak: false });
  }

  doc.fillColor(muted).font('Helvetica-Bold').fontSize(7)
    .text(`Gr. No.: ${safe(student.register_number, '-')}`, left, Y(399), { lineBreak: false });
  doc.text(`Roll No.: ${safe(student.roll_number, '-')}`, left + 185, Y(399), { lineBreak: false });
  doc.text(`SARAL ID: ${safe(student.serial_id, '-')}`, left + 370, Y(399), { lineBreak: false });

  doc.save().moveTo(left, Y(420)).lineTo(right, Y(420))
    .lineWidth(0.5).strokeColor(gold).stroke().restore();
  doc.fillColor(muted).font('Helvetica').fontSize(6.5)
    .text('Certified that the above information is true to the best of our knowledge as per school records.',
      left, Y(427), { width: contentW, align: 'center', lineBreak: false });
  doc.fillColor(black).font('Helvetica-Bold').fontSize(7)
    .text(`DATE: ${fmtDate(new Date())}`, left, Y(449), { lineBreak: false });
  doc.text(`PLACE: ${safe(school.city || school.village || school.taluka, '-')}, Dist. ${safe(school.district, '-')}`,
    left, Y(461), { lineBreak: false });

  const signX = right - 160;
  if (canDraw(stampPath)) {
    try { doc.image(stampPath, signX + 62, Y(430), { width: 34, height: 34 }); } catch (e) {}
  }
  if (canDraw(signaturePath)) {
    try { doc.image(signaturePath, signX, Y(455), { width: 150, height: 22 }); } catch (e) {}
  }
  doc.save().moveTo(signX, Y(480)).lineTo(right, Y(480))
    .lineWidth(0.5).strokeColor(gold).stroke().restore();
  doc.fillColor(black).font('Helvetica-Bold').fontSize(7)
    .text(`(${safe(school.principal_name, 'HEAD MASTER').toUpperCase()})`, signX, Y(484),
      { width: 160, align: 'center', lineBreak: false, ellipsis: true });
  doc.text('HEAD MASTER', signX, Y(496), { width: 160, align: 'center', lineBreak: false });
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

// Same layout scaffolding as Bonafide (photo/QR side columns, header,
// signature footer) but the body names two students and states the sibling
// relationship instead of one student's bonafide status. No school-specific
// PNG frame exists for this type (only lc/bonafide/idcard have one), so it
// always uses the plain default double-border frame.
function renderSingleRelation(doc, ctx, qrBuffer) {
  const { school, student, relatedStudent, certificate, photoPath, signaturePath, stampPath } = ctx;
  const W = doc.page.width;
  const H = doc.page.height;
  const gold = '#7A8CA3';
  const black = '#111827';
  const muted = '#374151';
  const left = 70;
  const right = W - 70;
  const contentW = right - left;

  doc.rect(0, 0, W, H).fill('#FFFFFF');
  drawDoubleBorder(doc, 8, H - 8);

  const photoW = 72;
  const photoH = 88;
  const qrSize = 70;
  const sideW = 100;
  const textW = contentW - sideW * 2;
  const textX = left + sideW;
  const sideX = right - sideW;

  doc.fillColor(gold).font('Helvetica-Bold').fontSize(16)
    .text(safe(school.name, 'SCHOOL NAME').toUpperCase(), textX, 78, {
      width: textW, align: 'center', lineBreak: false, ellipsis: true
    });
  doc.fillColor(black).font('Helvetica').fontSize(7.5)
    .text(
      `Taluka: ${safe(school.taluka, '-')}  |  District: ${safe(school.district, '-')}`,
      textX, 99, { width: textW, align: 'center', lineBreak: false, ellipsis: true }
    );
  doc.fillColor(muted).fontSize(7)
    .text(
      `U-DISE: ${safe(school.udise_code, '-')}  |  Recognized No.: ${safe(school.recog_no, '-')}`,
      textX, 112, { width: textW, align: 'center', lineBreak: false, ellipsis: true }
    );

  doc.save().moveTo(textX + 12, 127).lineTo(textX + textW - 12, 127)
    .lineWidth(0.8).strokeColor(gold).stroke().restore();
  doc.fillColor(gold).font('Helvetica-Bold').fontSize(13)
    .text('RELATION CERTIFICATE', textX, 135, { width: textW, align: 'center', lineBreak: false });

  const standardOf = (s) => {
    const div = s.current_division || s.admission_division;
    return safe(s.current_standard || s.admission_standard, '-') + (div ? ` (Div. ${safe(div)})` : '');
  };
  const sameParents = safe(student.father_name).trim().toLowerCase() &&
    safe(student.father_name).trim().toLowerCase() === safe(relatedStudent.father_name).trim().toLowerCase();

  const segments = [
    { text: 'This is to certify that ' },
    { text: safe(student.full_name).toUpperCase(), bold: true },
    { text: ', studying in Std. ' },
    { text: standardOf(student), bold: true },
    { text: `, son/daughter of ` },
    { text: safe(student.father_name, '-').toUpperCase(), bold: true },
    { text: ' and ' },
    { text: safe(student.mother_name, '-').toUpperCase(), bold: true },
    { text: ', and ' },
    { text: safe(relatedStudent.full_name).toUpperCase(), bold: true },
    { text: ', studying in Std. ' },
    { text: standardOf(relatedStudent), bold: true },
    sameParents
      ? { text: ', son/daughter of the same parents,' }
      : { text: `, son/daughter of ${safe(relatedStudent.father_name, '-').toUpperCase()} and ${safe(relatedStudent.mother_name, '-').toUpperCase()},`, bold: true },
    { text: ' are real brother/sister and are bonafide students of this School as per our records.' },
  ];
  const plainPara = segments.map(s => s.text).join('');

  const bodyX = textX + 10;
  const bodyW = textW - 20;
  const bodyH = 164;
  const bodyY = 157;
  let bodySize = 14;
  while (bodySize > 8 && doc.font('Helvetica').fontSize(bodySize)
    .heightOfString(plainPara, { width: bodyW, lineGap: 3 }) > bodyH) bodySize -= 0.5;
  doc.fillColor(black).fontSize(bodySize);
  segments.forEach((seg, i) => {
    doc.font(seg.bold ? 'Helvetica-Bold' : 'Helvetica');
    const isLast = i === segments.length - 1;
    if (i === 0) {
      doc.text(seg.text, bodyX, bodyY, { width: bodyW, height: bodyH, align: 'left', lineGap: 3, continued: !isLast });
    } else {
      doc.text(seg.text, { continued: !isLast });
    }
  });

  const Y = (v) => v + 40;

  doc.fillColor(gold).font('Helvetica-Bold').fontSize(7)
    .text('CERTIFICATE NO.', sideX, Y(287), { width: sideW, align: 'center', lineBreak: false });
  doc.fillColor(black).fontSize(8)
    .text(safe(certificate.serial_number, '-'), sideX, Y(298), { width: sideW, align: 'center', lineBreak: false, ellipsis: true });
  if (qrBuffer) {
    try { doc.image(qrBuffer, sideX + (sideW - qrSize) / 2, Y(313), { width: qrSize, height: qrSize }); } catch (e) {}
    doc.fillColor(muted).font('Helvetica').fontSize(5.5)
      .text('Scan to verify', sideX, Y(385), { width: sideW, align: 'center', lineBreak: false });
  }

  const photoLeftX = left + (sideW - photoW) / 2;
  doc.save().roundedRect(photoLeftX, Y(292), photoW, photoH, 3)
    .lineWidth(0.8).strokeColor(gold).stroke().restore();
  if (canDraw(photoPath)) {
    try { doc.image(photoPath, photoLeftX + 1, Y(293), { width: photoW - 2, height: photoH - 2 }); } catch (e) {}
  } else {
    doc.fillColor(muted).font('Helvetica').fontSize(7)
      .text('PHOTO', photoLeftX, Y(329), { width: photoW, align: 'center', lineBreak: false });
  }

  doc.fillColor(muted).font('Helvetica-Bold').fontSize(7)
    .text(`Gr. No.: ${safe(student.register_number, '-')}`, left, Y(399), { lineBreak: false });
  doc.text(`Sibling Gr. No.: ${safe(relatedStudent.register_number, '-')}`, left + 250, Y(399), { lineBreak: false });

  doc.save().moveTo(left, Y(420)).lineTo(right, Y(420))
    .lineWidth(0.5).strokeColor(gold).stroke().restore();
  doc.fillColor(muted).font('Helvetica').fontSize(6.5)
    .text('Certified that the above information is true to the best of our knowledge as per school records.',
      left, Y(427), { width: contentW, align: 'center', lineBreak: false });
  doc.fillColor(black).font('Helvetica-Bold').fontSize(7)
    .text(`DATE: ${fmtDate(new Date())}`, left, Y(449), { lineBreak: false });
  doc.text(`PLACE: ${safe(school.city || school.village || school.taluka, '-')}, Dist. ${safe(school.district, '-')}`,
    left, Y(461), { lineBreak: false });

  const signX = right - 160;
  if (canDraw(stampPath)) {
    try { doc.image(stampPath, signX + 62, Y(430), { width: 34, height: 34 }); } catch (e) {}
  }
  if (canDraw(signaturePath)) {
    try { doc.image(signaturePath, signX, Y(455), { width: 150, height: 22 }); } catch (e) {}
  }
  doc.save().moveTo(signX, Y(480)).lineTo(right, Y(480))
    .lineWidth(0.5).strokeColor(gold).stroke().restore();
  doc.fillColor(black).font('Helvetica-Bold').fontSize(7)
    .text(`(${safe(school.principal_name, 'HEAD MASTER').toUpperCase()})`, signX, Y(484),
      { width: 160, align: 'center', lineBreak: false, ellipsis: true });
  doc.text('HEAD MASTER', signX, Y(496), { width: 160, align: 'center', lineBreak: false });
}

async function generateRelationPdf({ school, student, relatedStudent, certificate, outputPath, photoPath, signaturePath, stampPath }) {
  const [safeSignaturePath, safeStampPath, safePhotoPath] = await Promise.all([
    toPdfSafe(signaturePath),
    toPdfSafe(stampPath),
    toPdfSafe(photoPath),
  ]);
  const qrBuffer = await QRCode.toBuffer(buildVerifyUrl(certificate.id), { width: 80, margin: 1 }).catch(() => null);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: [842, 555.37], margin: 0 });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      const ctx = {
        school, student, relatedStudent, certificate,
        photoPath: safePhotoPath, signaturePath: safeSignaturePath, stampPath: safeStampPath,
      };

      renderSingleRelation(doc, ctx, qrBuffer);

      doc.end();
      stream.on('finish', () => resolve(outputPath));
      stream.on('error', reject);
    } catch (e) { reject(e); }
  });
}

module.exports = { generateLcPdf, generateBonafidePdf, generateRelationPdf, genSerial, fmtDate, dobInWords, fitCenteredText, fitSingleLineText, safe, sentenceCase };
