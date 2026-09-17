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
// LC-only palette (School Admin requested a specific blue "Student
// Information" / "School Details" panel format) — kept separate from the
// GOLD/NAVY theme used elsewhere in this file so Bonafide/ID Card are
// unaffected.
const LC_BLUE = '#123C82';
const LC_BLUE_BG = '#E8F1FC';
const LC_BORDER = '#B7CDEE';

// School Settings > Certificate Header/Footer stores raw contentEditable
// HTML (bold/italic/underline + div/br line breaks from the browser) —
// pdfkit can't render HTML, so this reduces it to plain text with the
// original line breaks preserved. Inline emphasis (bold/italic/underline)
// is intentionally not reproduced here: the field is short admin-entered
// notes text, not a design surface, so plain text is the correct fidelity
// for "make it configurable" without adding a full mini HTML-to-PDF layer.
function stripHtmlToText(html) {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(div|p)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

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

// Never print a raw Aadhaar number on a certificate — same masking already
// used elsewhere in this file, extracted here since drawIdInfoTable needs it too.
function maskAadhaar(aadhaar) {
  return aadhaar ? `XXXX-XXXX-${String(aadhaar).slice(-4)}` : '-';
}

// Compact bordered table for the 6 core student ID numbers (G.R. No,
// Aadhaar, Saral ID, APAAR ID, PEN No, LOC No) — used identically in both
// LC (right after the title banner) and Bonafide (right before it), so the
// two certificate types present the same ID information the same way.
// cellRows is an array of [label1, value1, label2, value2] triples, one per
// row. Returns the Y position just below the table.
function drawIdInfoTable(doc, x, y, width, cellRows) {
  const rowH = 16;
  const colW = width / 2;
  const tableH = rowH * cellRows.length;
  doc.save().lineWidth(0.7).strokeColor('#94a3b8').rect(x, y, width, tableH).stroke().restore();
  doc.save().lineWidth(0.7).strokeColor('#94a3b8').moveTo(x + colW, y).lineTo(x + colW, y + tableH).stroke().restore();
  cellRows.forEach(([label1, value1, label2, value2], i) => {
    const rowY = y + i * rowH;
    if (i > 0) {
      doc.save().lineWidth(0.5).strokeColor('#cbd5e1').moveTo(x, rowY).lineTo(x + width, rowY).stroke().restore();
    }
    fitSingleLineText(doc, `${label1} : ${value1}`, x + 8, rowY + 4.5, colW - 16, 9, TEXT, true, 6.5);
    fitSingleLineText(doc, `${label2} : ${value2}`, x + colW + 8, rowY + 4.5, colW - 16, 9, TEXT, true, 6.5);
  });
  return y + tableH;
}

// Indian academic year (June–May): e.g. Aug 2026 → "2026 - 27"
function currentAcademicYear() {
  const now = new Date();
  const startYear = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear} - ${String((startYear + 1) % 100).padStart(2, '0')}`;
}

function drawDoubleBorder(doc, top = 16, bottom = null, single = false) {
  const { width, height } = doc.page;
  const bottomY = bottom || height - 16;
  doc.save();
  doc.lineWidth(3).strokeColor(GOLD).rect(16, top, width - 32, bottomY - top).stroke();
  if (!single) {
    doc.lineWidth(1.2).strokeColor(NAVY).rect(24, top + 8, width - 48, bottomY - top - 16).stroke();
  }
  doc.restore();
}

// Board/school identity text sits in the column BETWEEN the logo and the
// QR/Certificate-No. stack — same row, not a separate row below them — so
// text is passed its own textX/textW rather than the full page width.
function drawHeader(doc, school, textX, textW, startY) {
  let y = startY;

  // Sanstha (trust) name and the board name are both school-configurable
  // (School Settings > Certificate Header) — "Maharashtra State Education
  // Board" is only the column's default value, not a hardcoded string here.
  if (school.sanstha_name) {
    y = fitCenteredText(doc, safe(school.sanstha_name), textX, y, textW, 11, LC_BLUE, false, 8) + 2;
  }
  // Board name and school name are the two large, bold headline lines —
  // each shrink-then-real-height chained off the one above it (never a
  // fixed offset) since either can wrap to 2 lines for a long name.
  y = fitCenteredText(doc, safe(school.board_name, 'Maharashtra State Education Board'), textX, y, textW, 19, LC_BLUE, true, 12) + 3;
  y = fitCenteredText(doc, sentenceCase(school.name, 'School name'), textX, y, textW, 18, LC_BLUE, true, 11) + 5;
  y = fitCenteredText(doc, `Taluka: ${safe(school.taluka)}, District: ${safe(school.district)}`, textX, y, textW, 10, TEXT, false, 7.5) + 2;

  // U-DISE sits next to RECOG NO here in the header, not in the ID info bar
  // below the title banner (moved per request — was previously duplicated
  // in both places, then dropped from here entirely; now it lives only here).
  y = fitCenteredText(doc, `U-DISE: ${safe(school.udise_code)}   |   RECOG NO: ${safe(school.recog_no)}`, textX, y, textW, 9, GREY, false, 6.5) + 2;

  return y;
}

function drawIdBox(doc, x, y, label, value, width = 130) {
  let fontSize = 11;
  doc.font('Helvetica-Bold');
  while (fontSize > 6.5 && doc.fontSize(fontSize).widthOfString(value) > width - 10) {
    fontSize -= 0.5;
  }
  doc.save();
  doc.roundedRect(x, y, width, 18, 3).fillColor(LC_BLUE).fill();
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7.5).text(sentenceCase(label), x, y + 4.5, { width, align: 'center', lineBreak: false });
  doc.restore();
  doc.fillColor('#D6272B').font('Helvetica-Bold').fontSize(fontSize).text(value, x, y + 22, { width, align: 'center', lineBreak: false });
  return y + 35;
}

// Big rounded "pill" title banner (School Admin requested this exact look
// for the LC) — full-height corner radius and a wider font than the boxy
// banner used to have, and doesn't span the full content width like it did.
function drawTitleBanner(doc, y, title, marginX = 46) {
  const fullWidth = doc.page.width - marginX * 2;
  const bannerW = fullWidth * 0.86;
  const bannerX = marginX + (fullWidth - bannerW) / 2;
  // Bold + bigger than the original 16/17pt, but snugger around the text
  // than the previous 40pt-tall version — that had too much vertical
  // padding above/below the title compared to the reference image.
  const bannerH = 30;
  doc.save().roundedRect(bannerX, y, bannerW, bannerH, bannerH / 2).fillColor(LC_BLUE).fill().restore();
  fitCenteredText(doc, sentenceCase(title), bannerX, y + 5, bannerW, 19, '#fff', true, 14);
  return y + bannerH + 8;
}

// ── "Student Information" / "School Details" bordered panels ─────────────
// Content height isn't known until it's drawn (varies by row count), so the
// panel border is drawn LAST around the recorded start/end Y rather than
// needing a height up front — draws fine either order since strokes never
// get covered by the fills drawn in between.
function drawPanelTitleBar(doc, x, y, width, title) {
  const headerH = 24;
  doc.save().rect(x, y, width, headerH).fillColor(LC_BLUE_BG).fill().restore();
  doc.fillColor(LC_BLUE).font('Helvetica-Bold').fontSize(11.5)
    .text(title, x + 12, y + 6.5, { width: width - 24, lineBreak: false });
  doc.save().lineWidth(0.8).strokeColor(LC_BORDER).moveTo(x, y + headerH).lineTo(x + width, y + headerH).stroke().restore();
  return y + headerH;
}
function drawPanelBorder(doc, x, startY, width, endY, radius = 6) {
  doc.save().lineWidth(1).strokeColor(LC_BORDER).roundedRect(x, startY, width, endY - startY, radius).stroke().restore();
}

// The 2-column x 3-row student ID table, restyled for the "Student
// Information" panel — separate from the shared drawIdInfoTable (which
// Bonafide also uses) so Bonafide's look is unaffected by this LC-only
// redesign. Label/colon/value each get a fixed slot so the colons line up
// down the column, matching the requested reference layout.
function drawStudentInfoTable(doc, x, y, width, cellRows) {
  // Taller rows and more inset around the text (was 22pt/12pt) so cells
  // have visible breathing room instead of text sitting flush against the
  // row dividers and left edge — per request, this was reading as cluttered.
  const rowH = 26;
  const padX = 14;
  const colW = width / 2;
  const labelW = colW * 0.52;
  const tableH = rowH * cellRows.length;
  doc.save().lineWidth(0.8).strokeColor(LC_BORDER).rect(x, y, width, tableH).stroke().restore();
  doc.save().lineWidth(0.8).strokeColor(LC_BORDER).moveTo(x + colW, y).lineTo(x + colW, y + tableH).stroke().restore();
  // Label AND value both bold now (label was plain weight before) — per
  // request, and bumped from 9.5pt to 10.5pt.
  const drawCell = (cx, cy, label, value) => {
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(TEXT).text(label, cx, cy, { width: labelW - padX + 2, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(TEXT).text(':', cx + labelW - 6, cy, { width: 8, lineBreak: false });
    fitSingleLineText(doc, value, cx + labelW + 10, cy, colW - labelW - padX - 12, 10.5, TEXT, true, 7.5);
  };
  cellRows.forEach(([l1, v1, l2, v2], i) => {
    const rowY = y + i * rowH;
    if (i > 0) {
      doc.save().lineWidth(0.6).strokeColor(LC_BLUE_BG).moveTo(x, rowY).lineTo(x + width, rowY).stroke().restore();
    }
    const textY = rowY + rowH / 2 - 5.5;
    drawCell(x + padX, textY, l1, v1);
    drawCell(x + colW + padX, textY, l2, v2);
  });
  return y + tableH;
}

// The 15-row "Sr. No. | Particulars | Information" table, replacing the old
// plain "N. Label : Value" rows with a real bordered 3-column table matching
// the requested reference format.
function drawSchoolDetailsTable(doc, x, y, width, rows) {
  // Taller rows and more inset around the text (was 22pt/18pt header/row
  // height, 8pt padding) so cells have visible breathing room instead of
  // text sitting flush against the row dividers — per request, this was
  // reading as cluttered.
  const headerH = 25, rowH = 21, padX = 10;
  const srW = 34, particularsW = width * 0.33, infoW = width - srW - particularsW;
  const totalH = headerH + rowH * rows.length;

  doc.save().rect(x, y, width, headerH).fillColor(LC_BLUE_BG).fill().restore();
  doc.font('Helvetica-Bold').fontSize(10).fillColor(LC_BLUE)
    .text('Sr. No.', x, y + 8, { width: srW, align: 'center', lineBreak: false });
  doc.text('Particulars', x + srW + padX, y + 8, { width: particularsW - padX * 2, lineBreak: false });
  doc.text('Information', x + srW + particularsW + padX, y + 8, { width: infoW - padX * 2, lineBreak: false });

  // Particulars column is bold now too (was plain weight before, while
  // Information was already bold) — per request, and bumped from 9pt to 10pt.
  rows.forEach(([label, value], i) => {
    const rowY = y + headerH + i * rowH;
    if (i > 0) {
      doc.save().lineWidth(0.5).strokeColor(LC_BLUE_BG).moveTo(x, rowY).lineTo(x + width, rowY).stroke().restore();
    }
    const textY = rowY + rowH / 2 - 5.5;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT)
      .text(String(i + 1), x, textY, { width: srW, align: 'center', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT)
      .text(sentenceCase(label), x + srW + padX, textY, { width: particularsW - padX * 2, lineBreak: false });
    fitSingleLineText(doc, sentenceCase(value, '-'), x + srW + particularsW + padX, textY, infoW - padX * 2, 10, TEXT, true, 7);
  });

  doc.save().lineWidth(0.8).strokeColor(LC_BORDER).moveTo(x, y + headerH).lineTo(x + width, y + headerH).stroke().restore();
  doc.save().lineWidth(0.8).strokeColor(LC_BORDER).moveTo(x + srW, y).lineTo(x + srW, y + totalH).stroke().restore();
  doc.save().lineWidth(0.8).strokeColor(LC_BORDER).moveTo(x + srW + particularsW, y).lineTo(x + srW + particularsW, y + totalH).stroke().restore();
  doc.save().lineWidth(0.8).strokeColor(LC_BORDER).rect(x, y, width, totalH).stroke().restore();

  return y + totalH;
}


function drawPhotoPanel(doc, x, y, photoPath, w = 80, h = 96) {
  doc.save();
  doc.roundedRect(x, y, w, h, 4).lineWidth(1).strokeColor(LC_BLUE).stroke();
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

// Renders a centered, word-wrapped paragraph where selected segments (the
// actual DB-fetched values) render bold while the surrounding sentence stays
// regular weight. pdfkit's `continued` text mode does not reflow correctly
// when combined with `align: 'center'` across a multi-line wrap (segments
// visibly overlap), so line-breaking and per-line centering are done here
// manually, word by word.
function splitIntoBoldWords(segments) {
  const words = [];
  segments.forEach(seg => {
    seg.text.split(/\s+/).filter(Boolean).forEach(text => words.push({ text, bold: !!seg.bold }));
  });
  // A segment boundary landing right before punctuation (e.g. a bold value
  // followed by the plain-text ". Mother's name is") tokenizes the "." as
  // its own word, which would otherwise render with a phantom space before
  // it. Glue standalone leading punctuation onto the previous word instead.
  const merged = [];
  words.forEach(w => {
    if (/^[.,;:!?]+$/.test(w.text) && merged.length > 0) {
      merged[merged.length - 1].text += w.text;
    } else {
      merged.push({ ...w });
    }
  });
  return merged;
}

function wrapBoldWords(doc, words, fontSize, maxWidth) {
  const spaceWidth = doc.fontSize(fontSize).font('Helvetica').widthOfString(' ');
  const lines = [];
  let current = [];
  let currentWidth = 0;
  words.forEach(w => {
    const wWidth = doc.font(w.bold ? 'Helvetica-Bold' : 'Helvetica').widthOfString(w.text);
    const candidateWidth = current.length === 0 ? wWidth : currentWidth + spaceWidth + wWidth;
    if (candidateWidth > maxWidth && current.length > 0) {
      lines.push({ words: current, width: currentWidth });
      current = [w];
      currentWidth = wWidth;
    } else {
      current.push(w);
      currentWidth = candidateWidth;
    }
  });
  if (current.length) lines.push({ words: current, width: currentWidth });
  return lines;
}

// Shrinks fontSize (like every other shrink-to-fit block in this file) until
// the wrapped paragraph fits maxHeight, then draws each line centered.
function drawCenteredBoldParagraph(doc, x, y, width, maxHeight, segments, initialSize, color, lineGap = 2) {
  const words = splitIntoBoldWords(segments);
  let fontSize = initialSize;
  let lines, lineHeight, totalHeight;
  do {
    lines = wrapBoldWords(doc, words, fontSize, width);
    lineHeight = fontSize * 1.15 + lineGap;
    totalHeight = lines.length * lineHeight - lineGap;
    if (totalHeight <= maxHeight || fontSize <= 7) break;
    fontSize -= 0.5;
  } while (true);

  const spaceWidth = doc.fontSize(fontSize).font('Helvetica').widthOfString(' ');
  let curY = y;
  lines.forEach(line => {
    let curX = x + (width - line.width) / 2;
    line.words.forEach(w => {
      const font = w.bold ? 'Helvetica-Bold' : 'Helvetica';
      doc.font(font).fillColor(color).fontSize(fontSize).text(w.text, curX, curY, { lineBreak: false });
      curX += doc.widthOfString(w.text) + spaceWidth;
    });
    curY += lineHeight;
  });
  return curY;
}

// Same bold-segment word-wrapping as drawCenteredBoldParagraph above, but
// full-justified (both edges align) instead of centered — the formal-
// document look the Bonafide redesign asked for. Distributes the line's
// slack evenly between word gaps; the last line (and any single-word line)
// is left as natural left-aligned spacing, matching standard justify
// convention — stretching it to the full width reads as a rendering bug,
// not a deliberate typographic choice.
function drawJustifiedBoldParagraph(doc, x, y, width, maxHeight, segments, initialSize, color, lineGap = 2) {
  const words = splitIntoBoldWords(segments);
  let fontSize = initialSize;
  let lines, lineHeight, totalHeight;
  do {
    lines = wrapBoldWords(doc, words, fontSize, width);
    lineHeight = fontSize * 1.15 + lineGap;
    totalHeight = lines.length * lineHeight - lineGap;
    if (totalHeight <= maxHeight || fontSize <= 7) break;
    fontSize -= 0.5;
  } while (true);

  const spaceWidth = doc.fontSize(fontSize).font('Helvetica').widthOfString(' ');
  let curY = y;
  lines.forEach((line, i) => {
    const isLastLine = i === lines.length - 1;
    const gapCount = line.words.length - 1;
    const extraPerGap = (!isLastLine && gapCount > 0) ? (width - line.width) / gapCount : 0;
    let curX = x;
    line.words.forEach(w => {
      const font = w.bold ? 'Helvetica-Bold' : 'Helvetica';
      doc.font(font).fillColor(color).fontSize(fontSize).text(w.text, curX, curY, { lineBreak: false });
      curX += doc.widthOfString(w.text) + spaceWidth + extraPerGap;
    });
    curY += lineHeight;
  });
  return curY;
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
  remarks,
  classInWhichStudying,
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

      const drawLcPageBorder = () => {
        if (canDraw(safeTemplatePath)) {
          try { doc.image(safeTemplatePath, 0, 0, { width: doc.page.width, height: doc.page.height }); } catch (e) {}
        } else {
          // Clean flat double-line border in the requested blue "Student
          // Information / School Details" format — no ornamental frame
          // graphic (that was gold-toned and would clash with this palette).
          doc.save().lineWidth(1.4).strokeColor(LC_BLUE).rect(14, 14, doc.page.width - 28, doc.page.height - 28).stroke().restore();
          doc.save().lineWidth(0.8).strokeColor(LC_BLUE).rect(20, 20, doc.page.width - 40, doc.page.height - 40).stroke().restore();
        }
      };
      drawLcPageBorder();

      // ── Top row, all in one line: Logo (left) | Board/School name (centre) |
      // QR + Certificate No. stacked (right) ── QR sits directly above the
      // Certificate Number box so both read as one verification unit, and is
      // the same size as the school logo (62pt) on request.
      const boxW     = 100;
      const certIdX  = doc.page.width - 52 - boxW;
      const metaTop  = 30;
      const qrSize   = 62;
      const logoSize = 62;
      const logoX    = 46;

      if (canDraw(safeLogoPath)) {
        try { doc.image(safeLogoPath, logoX, metaTop, { width: logoSize, height: logoSize }); }
        catch (e) { console.error('[PDF] logo draw failed:', e.message); }
      } else {
        doc.save().circle(logoX + logoSize / 2, metaTop + logoSize / 2, logoSize / 2 - 2).lineWidth(1.3).strokeColor(LC_BLUE).stroke().restore();
      }

      if (qrBuffer) {
        const qrX = certIdX + (boxW - qrSize) / 2;
        try { doc.image(qrBuffer, qrX, metaTop, { width: qrSize, height: qrSize }); } catch (e) {}
      }
      const certIdY = metaTop + qrSize + 6;
      const certIdBottom = drawIdBox(doc, certIdX, certIdY, 'CERTIFICATE NO.', certificate.serial_number, boxW);
      // "Scan to verify" replaces a fixed government URL — this system's
      // own QR verification page, not a claim about a domain we don't own.
      doc.font('Helvetica-Oblique').fontSize(6.5).fillColor('#b91c1c')
        .text('(Scan QR to verify)', certIdX, certIdBottom, { width: boxW, align: 'center', lineBreak: false });
      let rightColBottom = certIdBottom + 7;

      // ── Original / Duplicate marker — unobtrusive, only shown for an
      // actual Duplicate copy (an Original renders with nothing extra here,
      // matching the requested reference which has no visible marker at all).
      // sentenceCase only capitalizes the first letter (e.g. 'duplicate' ->
      // 'Duplicate'), so compare case-insensitively — matching against the
      // literal 'DUPLICATE' here always failed silently.
      const typeLabel = sentenceCase(lcType || 'Original');
      if (typeLabel.toUpperCase() === 'DUPLICATE') {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#dc2626')
          .text('DUPLICATE COPY', certIdX, rightColBottom, { width: boxW, align: 'center', lineBreak: false });
        rightColBottom += 9;
      }

      // Photo — School Admin can turn this off per school (Settings). Moved
      // into this right-hand column (below the certificate number) since
      // the requested reference format has no photo slot in the footer.
      const showLcPhoto = school.lc_show_photo === undefined || school.lc_show_photo === null
        ? true
        : Boolean(Number(school.lc_show_photo));
      if (showLcPhoto) {
        rightColBottom = drawPhotoPanel(doc, certIdX, rightColBottom + 1, safePhotoPath, boxW, 42);
      }

      // The QR+Certificate-No. column (logo-matched QR size, stacked above
      // the number box) is inherently taller than the identity text block
      // next to it — starting the text flush at the top left a noticeable
      // dead gap below it before the next section. Nudging the text block
      // down distributes that whitespace evenly above and below instead.
      const textX = logoX + logoSize + 14;
      const textW = certIdX - 14 - textX;
      const textTopOffset = school.sanstha_name ? 6 : 12;
      let y = drawHeader(doc, school, textX, textW, metaTop + textTopOffset);

      // ── School-configured header text (School Settings > Certificate
      // Header) — additive text below the school name/logo, empty by
      // default so a school that never sets this renders identically to
      // before this field existed. Centered on the same textX/textW column
      // as the board/school name above it (not the full page width) so it
      // shares their center instead of visibly sitting off to one side.
      const headerText = stripHtmlToText(school.cert_header).replace(/\n+/g, ' ');
      if (headerText) {
        // fitCenteredText (shrink-then-real-height) instead of a plain
        // .text() at a fixed font size with a fixed y-advance afterwards —
        // a long header wraps to 2 lines in this narrow column, and a fixed
        // advance would let the 2nd line bleed into the banner below it.
        y = fitCenteredText(doc, headerText, textX, y, textW, 8, TEXT, false, 6) + 2;
      }

      // Both header columns (identity text on the left, QR/cert-no/photo on
      // the right) can vary in height — start the title banner below
      // whichever is taller, never a fixed offset.
      y = Math.max(y, rightColBottom) + 10;

      y = drawTitleBanner(doc, y, 'School leaving certificate');

      // ── "Student Information" panel: bordered 2 x 3 ID table ──
      // U-DISE moved up into the header next to RECOG NO (see drawHeader).
      const contentWidth = doc.page.width - 92;
      const panel1Y = y;
      y = drawPanelTitleBar(doc, 46, y, contentWidth, 'Student Information');
      y = drawStudentInfoTable(doc, 46, y, contentWidth, [
        ['General Register No.', sentenceCase(student.register_number, '-'), 'Student Aadhar No', maskAadhaar(student.aadhaar)],
        ['Student Saral Id', sentenceCase(student.serial_id, '-'), 'Student Apar Id', sentenceCase(student.apaar_id, '-')],
        ['Student PEN ID', sentenceCase(student.pen_no, '-'), 'LOC No.', sentenceCase(student.loc_no, '-')],
      ]);
      drawPanelBorder(doc, 46, panel1Y, contentWidth, y);
      y += 6;

      // ── "Student Details" panel: bordered Sr.No/Particulars/Information table
      // (labeled "School Details" in the first pass — renamed since every row
      // here is actually about the student, not the school) ──
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
        ['Reason for leaving',             safe(reasonForLeaving, '')],
        ['Class in which studying',        classInWhichStudying || `${safe(student.current_standard || student.admission_standard)} standard (${safe(student.current_division || student.admission_division)})`],
        ['Remarks',                        safe(remarks, '')],
      ];

      const panel2Y = y;
      y = drawPanelTitleBar(doc, 46, y, contentWidth, 'Student Details');
      y = drawSchoolDetailsTable(doc, 46, y, contentWidth, rows);
      drawPanelBorder(doc, 46, panel2Y, contentWidth, y);

      // ── School-configured footer text (School Settings > Certificate
      // Footer) — additive, empty by default.
      const footerText = stripHtmlToText(school.cert_footer).replace(/\n+/g, ' ');
      if (footerText) {
        y = fitCenteredText(doc, footerText, 46, y + 10, contentWidth, 8, TEXT, false, 6) + 4;
      }

      // Minimum space the Date/Place + signature block needs no matter what:
      // gap after the tables, the Date/Place lines, a gap down to the
      // signature line, then the line plus its two label lines below it.
      const minGapAfterPanels = 8, dateBlockH = 28, minGapToSig = 28, sigTailH = 30;
      const minFooterH = minGapAfterPanels + dateBlockH + minGapToSig + sigTailH;

      // An unusually tall combination above (long sanstha/board/school names,
      // a full custom header/footer, every optional field filled, photo +
      // Duplicate marker) can leave too little room for this whole block.
      // Rather than let pdfkit auto-paginate mid-block (splitting it across
      // pages in a broken-looking way), move the whole block onto a fresh,
      // still-bordered page together.
      if (y + minFooterH > doc.page.height - 30) {
        doc.addPage();
        drawLcPageBorder();
        y = 40;
      }

      // On a shorter certificate there's real leftover space between the
      // tables and the note (anchored near the physical bottom margin) —
      // spread part of it into these two gaps instead of clustering
      // Date/Place tight against the tables and leaving all that space
      // empty just above the note (the "cluttered on top, empty at the
      // bottom" complaint). Capped so a near-empty page doesn't stretch the
      // footer into something silly — the rest just stays as bottom margin.
      const noteTargetY = doc.page.height - 45;
      const slack = Math.max(0, Math.min(90, (noteTargetY - 18) - y - minFooterH));
      const gapToSig = minGapToSig + slack * 0.7;
      y += minGapAfterPanels + slack * 0.3;

      // ── Footer: Date/Place (left) | seal (centre) | Checked-by / Head
      // Master signature lines ──
      doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT).text(`Date  : ${leavingDate || fmtDate(new Date())}`, 46, y);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT).text(`Place : ${sentenceCase(school.city || school.village || school.taluka)}`, 46, y + 14);

      const sigLineY = y + dateBlockH + gapToSig;
      const C1 = 46, C1W = contentWidth * 0.42;
      const C3 = 46 + contentWidth * 0.58, C3W = contentWidth * 0.42;

      // School stamp, sitting just above the signature line. The
      // Principal's signature itself is intentionally NOT drawn here — LC
      // and Bonafide are meant to be hand-signed on the printed hard copy;
      // only the ID Card carries a printed/uploaded signature.
      drawStampIfAvailable(doc, safeStampPath, 46 + contentWidth / 2 - 18, sigLineY - 36, 36);

      doc.moveTo(C1, sigLineY).lineTo(C1 + C1W, sigLineY).lineWidth(0.7).strokeColor('#9ca3af').stroke();
      doc.moveTo(C3, sigLineY).lineTo(C3 + C3W, sigLineY).lineWidth(0.7).strokeColor('#9ca3af').stroke();

      doc.font('Helvetica').fontSize(9).fillColor(TEXT)
        .text('Checked by / Approved by', C1, sigLineY + 5, { width: C1W, align: 'center', lineBreak: false });
      // Designation label only (Principal / Mukhyadhyapak / Headmaster / a
      // custom title) — the Principal's name itself is shown on the ID Card
      // only, never printed here even when school.principal_name is set.
      const lcSignatureLabel = safe(school.lc_signature_label, 'Head Master');
      doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT)
        .text(lcSignatureLabel, C3, sigLineY + 5, { width: C3W, align: 'center', lineBreak: false });
      // fitSingleLineText (shrink-then-ellipsis), not a plain wrapping
      // .text() — a long school name wrapping to 2 lines here pushed the
      // total content past the page bottom and triggered an unwanted,
      // mostly-blank 2nd page (pdfkit auto-paginates flowed text that would
      // overflow, even with margin:0).
      fitSingleLineText(doc, sentenceCase(school.name), C3, sigLineY + 17, C3W, 8, GREY, false, 6);

      // Combined note at bottom — anchored near the physical bottom margin
      // for the normal case (matching the ~46pt margin used everywhere else
      // on this certificate), but never less than sigLineY + 32 so an
      // unusually tall header/table combination (long names, every optional
      // field filled) can't push the signature block into/past it.
      const noteY = Math.max(doc.page.height - 45, sigLineY + 32);
      doc.save().moveTo(46, noteY).lineTo(46 + contentWidth, noteY).lineWidth(1).strokeColor(LC_BLUE).stroke().restore();
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(TEXT)
        .text(
          'No change in any entry in this certificate shall be made except by the authority issuing it. ' +
          'Certified that the above information is true to the best of our knowledge as per school records.',
          46, noteY + 6, { width: contentWidth, align: 'center' }
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

// Formal "label on the left, value on the right" table — one field per row,
// consistent column widths/borders/padding throughout — used by the
// Bonafide redesign's student-reference-numbers section. Distinct from
// drawIdInfoTable (which LC and the older Bonafide layout use, two label:
// value pairs side by side per row) since this redesign specifically asked
// for a plain two-column table instead.
function drawLabelValueRows(doc, x, y, width, rows, borderColor) {
  const rowH = 20, labelW = width * 0.42;
  const tableH = rowH * rows.length;
  doc.save().lineWidth(0.8).strokeColor(borderColor).rect(x, y, width, tableH).stroke().restore();
  doc.save().lineWidth(0.8).strokeColor(borderColor).moveTo(x + labelW, y).lineTo(x + labelW, y + tableH).stroke().restore();
  rows.forEach(([label, value], i) => {
    const rowY = y + i * rowH;
    if (i > 0) {
      doc.save().lineWidth(0.6).strokeColor(borderColor).moveTo(x, rowY).lineTo(x + width, rowY).stroke().restore();
    }
    const textY = rowY + rowH / 2 - 5;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(GREY).text(label, x + 10, textY, { width: labelW - 20, lineBreak: false });
    fitSingleLineText(doc, value, x + labelW + 10, textY, width - labelW - 20, 9.5, TEXT, true, 7);
  });
  return y + tableH;
}

// Renders one portrait bonafide certificate — a clean, restrained
// navy/white/light-grey formal-document layout (redesigned per request):
// logo (left) | school identity (centre) | QR + certificate ID (right) in
// the header, a single divider, a "BONAFIDE CERTIFICATE" title bar, a
// plain label:value reference-numbers table, a fully-justified certifying
// paragraph, a shaded key-facts panel (name/class/year) with the student
// photo beside it, and a footer of Date of Issue / Place / two signature
// lines. The QR code and certificate serial number are real, live data —
// only the decorative gold accents, ornamental flourishes and the
// redundant "digitally verified" badge/lock icon from the previous design
// were removed, not the certificate's actual verification mechanism.
function renderSingleBonafide(doc, ctx, qrBuffer) {
  const { school, student, certificate, purpose, photoPath, logoPath, stampPath, templatePath } = ctx;
  const W = doc.page.width;
  const H = doc.page.height;
  const black = TEXT;
  const muted = GREY;
  const left = 40;
  const right = W - 40;
  const contentW = right - left;
  const REF_BORDER = '#CBD5E1';

  if (canDraw(templatePath)) {
    try { doc.image(templatePath, 0, 0, { width: W, height: H }); } catch (e) {}
  } else {
    // Single restrained navy rule, not the old gold double-border — this
    // redesign is deliberately a plain navy/white/light-grey palette.
    doc.rect(0, 0, W, H).fill('#FFFFFF');
    doc.save().lineWidth(1).strokeColor(NAVY).rect(18, 18, W - 36, H - 36).stroke().restore();
  }

  // ── Header: logo (left) | school identity (centre) | QR + cert ID (right) ──
  const logoCx = left + 26, logoCy = 68, logoR = 26;
  if (canDraw(logoPath)) {
    try { doc.save().circle(logoCx, logoCy, logoR).clip().image(logoPath, logoCx - logoR, logoCy - logoR, { width: logoR * 2, height: logoR * 2 }).restore(); } catch (e) {}
  }
  doc.save().circle(logoCx, logoCy, logoR).lineWidth(1.2).strokeColor(NAVY).stroke().restore();

  const idBoxW = 115, idBoxX = right - idBoxW;
  const qrSize = 56, qrX = idBoxX + (idBoxW - qrSize) / 2, qrY = logoCy - logoR;
  if (qrBuffer) {
    try { doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize }); } catch (e) {}
  }
  const certIdLabelY = qrY + qrSize + 6;
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor(muted)
    .text('CERTIFICATE ID', idBoxX, certIdLabelY, { width: idBoxW, align: 'center', lineBreak: false });
  let idSz = 10;
  doc.font('Helvetica-Bold');
  while (idSz > 6.5 && doc.fontSize(idSz).widthOfString(safe(certificate.serial_number, '-')) > idBoxW - 6) idSz -= 0.5;
  doc.fontSize(idSz).fillColor(NAVY)
    .text(safe(certificate.serial_number, '-'), idBoxX, certIdLabelY + 9, { width: idBoxW, align: 'center', lineBreak: false });
  const rightColBottomY = certIdLabelY + 9 + idSz + 4;

  const textX = logoCx + logoR + 16;
  const textW = idBoxX - 16 - textX;
  let y = 40;
  if (school.sanstha_name) {
    y = fitCenteredText(doc, safe(school.sanstha_name).toUpperCase(), textX, y, textW, 8.5, muted, false, 6.5) + 2;
  }
  if (school.board_name) {
    y = fitCenteredText(doc, safe(school.board_name).toUpperCase(), textX, y, textW, 9.5, muted, false, 7) + 2;
  }
  // School name is the line most likely to wrap to 2 lines in this narrow
  // centre column — chain off its real returned height instead of a fixed
  // offset, so the address line below it can never overlap regardless of
  // how long the name is or where it wraps.
  y = fitCenteredText(doc, safe(school.name, 'SCHOOL NAME').toUpperCase(), textX, y, textW, 16, NAVY, true, 10) + 3;
  y = fitCenteredText(doc, `Taluka: ${safe(school.taluka, '-')}, District: ${safe(school.district, '-')}`,
    textX, y, textW, 9, black, false, 6.5) + 2;
  if (school.udise_code || school.recog_no) {
    y = fitCenteredText(doc, `U-DISE: ${safe(school.udise_code, '-')}   |   RECOG NO: ${safe(school.recog_no, '-')}`,
      textX, y, textW, 7.5, muted, false, 6);
  }

  // School-configured header text (School Settings > Certificate Header) —
  // additive, empty by default. Chained off the address block above.
  const bonafideHeaderText = stripHtmlToText(school.cert_header).replace(/\n+/g, ' ');
  if (bonafideHeaderText) {
    y = fitCenteredText(doc, bonafideHeaderText, textX, y + 1, textW, 7, muted, false, 5.5);
  }

  // Below whichever header column is taller — text centre or QR/ID right —
  // instead of a fixed Y, so a long school name or address can never
  // overlap the divider that follows.
  const headerBottomY = Math.max(y, rightColBottomY, logoCy + logoR);
  const dividerY = headerBottomY + 10;
  doc.save().moveTo(left, dividerY).lineTo(right, dividerY).lineWidth(0.75).strokeColor(REF_BORDER).stroke().restore();

  // ── Title bar ──────────────────────────────────────────────────────────
  const bannerY = dividerY + 14, bannerH = 26;
  doc.save().roundedRect(left, bannerY, contentW, bannerH, 3).fillColor(NAVY).fill().restore();
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(14)
    .text('BONAFIDE CERTIFICATE', left, bannerY + 7, { width: contentW, align: 'center', lineBreak: false });

  // ── Student reference numbers — plain label:value table ───────────────────
  const afterBannerY = bannerY + bannerH + 16;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY)
    .text('STUDENT REFERENCE NUMBERS', left, afterBannerY, { width: contentW, lineBreak: false });
  const tableY = afterBannerY + 14;
  const tableBottomY = drawLabelValueRows(doc, left, tableY, contentW, [
    ['General Register No.', sentenceCase(student.register_number, '-')],
    ['Student Aadhaar No.', maskAadhaar(student.aadhaar)],
    ['Student SARAL ID', sentenceCase(student.serial_id, '-')],
    ['Student APAAR ID', sentenceCase(student.apaar_id, '-')],
    ['Student PEN No.', sentenceCase(student.pen_no, '-')],
    ['LOC No.', sentenceCase(student.loc_no, '-')],
  ], REF_BORDER);

  // ── Body paragraph — fully justified, not centered ────────────────────────
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
  const academicYearStr = safe(student.academic_year) || currentAcademicYear();
  const motherNameUpper = safe(student.mother_name, '-').toUpperCase();
  const casteStr = safe(student.caste, 'N/A');
  const dobStr = fmtDate(student.dob);
  const dobWordsStr = dobInWords(student.dob);
  const birthPlaceStr = birthPlace || '-';

  const paraSegments = [
    { text: 'This is to certify that ' },
    { text: safe(student.full_name).toUpperCase(), bold: true },
    { text: ' is / was a bonafide student of this School / College Studying in Std. ' },
    { text: standardValue, bold: true },
    { text: ' during the year ' },
    { text: academicYearStr, bold: true },
    { text: `. Mother's name is ` },
    { text: motherNameUpper, bold: true },
    { text: `. ${heShe} is ` },
    { text: casteStr, bold: true },
    { text: ` by Caste. ${hisHer} date of Birth according to our Register is ` },
    { text: dobStr, bold: true },
    { text: ` (in words ${dobWordsStr}). ${hisHer} place of Birth is ` },
    { text: birthPlaceStr, bold: true },
    { text: `. ${heShe} bears a good moral character.` },
  ];
  if (purpose) {
    paraSegments.push({ text: ' This certificate is issued on the request for the purpose of: ' });
    paraSegments.push({ text: purpose, bold: true });
    paraSegments.push({ text: '.' });
  }

  const bodyY = tableBottomY + 18;
  const bodyBottomY = drawJustifiedBoldParagraph(doc, left, bodyY, contentW, 150, paraSegments, 10.5, black, 3);

  // ── Footer: Date of Issue / Place (left) + student photo (right) in one
  // row, then Class Teacher / Principal signatures below — chained off the
  // paragraph's real bottom, never a fixed offset, same reasoning as
  // everywhere else in this layout. The name/class/year highlight panel
  // that used to sit here was dropped — that information is already in the
  // paragraph above, so it was pure repetition.
  const footerY = bodyBottomY + 20;
  const photoW = 64, photoH = 84;
  const photoX = right - photoW;
  const dateAreaW = contentW - photoW - 16;
  const footerColW = dateAreaW / 2;

  doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY).text('DATE OF ISSUE', left, footerY, { lineBreak: false });
  doc.font('Helvetica').fontSize(9.5).fillColor(black).text(fmtDate(new Date()), left, footerY + 11, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY).text('PLACE', left + footerColW, footerY, { lineBreak: false });
  doc.font('Helvetica').fontSize(9.5).fillColor(black)
    .text(`${safe(school.city || school.village || school.taluka, '-')}, Dist. ${safe(school.district, '-')}`,
      left + footerColW, footerY + 11, { width: footerColW - 4, lineBreak: false, ellipsis: true });

  doc.save().rect(photoX, footerY, photoW, photoH).lineWidth(1).strokeColor(NAVY).stroke().restore();
  if (canDraw(photoPath)) {
    try { doc.image(photoPath, photoX + 1, footerY + 1, { width: photoW - 2, height: photoH - 2 }); } catch (e) {}
  } else {
    doc.fillColor(muted).font('Helvetica').fontSize(7)
      .text('PHOTO', photoX, footerY + photoH / 2 - 4, { width: photoW, align: 'center', lineBreak: false });
  }

  // School-configured footer text (School Settings > Certificate Footer) —
  // additive, empty by default.
  let afterDateRowY = footerY + photoH + 16;
  const bonafideFooterText = stripHtmlToText(school.cert_footer).replace(/\n+/g, ' ');
  if (bonafideFooterText) {
    doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(muted)
      .text(bonafideFooterText, left, afterDateRowY, { width: contentW, align: 'center', lineBreak: false, ellipsis: true });
    afterDateRowY += 14;
  }

  // Signature images are intentionally NOT drawn here — Bonafide is meant to
  // be hand-signed on the printed hard copy; only the ID Card carries a
  // printed/uploaded signature. The stamp/seal (a school's own upload, not
  // an invented government seal) is unaffected.
  const sigLineY = afterDateRowY + 40;
  const sigColW = contentW / 3;

  doc.save().moveTo(left + 10, sigLineY).lineTo(left + sigColW - 15, sigLineY).lineWidth(0.8).strokeColor('#94A3B8').stroke().restore();
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(black)
    .text('Class Teacher', left + 10, sigLineY + 4, { width: sigColW - 25, align: 'center', lineBreak: false });

  const sealCx = W / 2, sealCy = sigLineY - 14, sealR = 20;
  if (canDraw(stampPath)) {
    try { doc.save().circle(sealCx, sealCy, sealR).clip().image(stampPath, sealCx - sealR, sealCy - sealR, { width: sealR * 2, height: sealR * 2 }).restore(); } catch (e) {}
  }
  doc.save().circle(sealCx, sealCy, sealR).lineWidth(1).strokeColor(REF_BORDER).stroke().restore();

  doc.save().moveTo(right - sigColW + 15, sigLineY).lineTo(right - 10, sigLineY).lineWidth(0.8).strokeColor('#94A3B8').stroke().restore();
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(black)
    .text(safe(school.bonafide_signature_label, 'Principal'), right - sigColW + 15, sigLineY + 4, { width: sigColW - 25, align: 'center', lineBreak: false });
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
      // Portrait A4 (was landscape) — renderSingleBonafide derives every
      // horizontal position from doc.page.width, so it reflows to the
      // narrower width; a school's own uploaded bonafide_template_data (or
      // the shared default frame) is still stretched to fill the page, so a
      // landscape-shaped background image will look stretched here until
      // replaced with a portrait one.
      const doc = new PDFDocument({ size: 'A4', margin: 0 });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // No shared default frame image fallback here (there used to be one,
      // BONAFIDE_FRAME_PATH) — that silently overrode this whole redesign
      // with an old ornamental PNG background for every school that hasn't
      // uploaded their own custom Bonafide template, which is most of them.
      // Only a school's own real upload takes over the layout now; every
      // other school gets the new programmatic navy/white/light-grey design.
      const ctx = {
        school, student, certificate, purpose,
        photoPath: safePhotoPath, logoPath: safeLogoPath,
        signaturePath: safeSignaturePath, stampPath: safeStampPath,
        templatePath,
      };

      renderSingleBonafide(doc, ctx, qrBuffer);

      doc.end();
      stream.on('finish', () => resolve(outputPath));
      stream.on('error', reject);
    } catch (e) { reject(e); }
  });
}

module.exports = { generateLcPdf, generateBonafidePdf, genSerial, fmtDate, dobInWords, fitCenteredText, fitSingleLineText, safe, sentenceCase };
