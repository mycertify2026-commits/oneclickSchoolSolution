/**
 * idCardPdf.js — Reference-format single-side student ID card.
 *
 * The card is intentionally generated as one page only. Its aspect ratio and
 * footer feature strip follow the supplied reference image.
 *
 * The active front layout follows the supplied reference labels, including
 * Valid Till, and keeps every dynamic value inside a bounded region.
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const QRCode = require('qrcode');
const { fmtDate } = require('./certificatePdf');
const { buildVerifyUrl } = require('./qrPayload');
const { toPdfSafe } = require('./imageConvert');

const NAVY   = '#0D2359';
const GOLD   = '#C8971F';
const ORANGE = '#E05A10';
const WHITE  = '#ffffff';
const GREY   = '#64748b';
const TEXT   = '#1a1a1a';

const BOX_COLORS = [
  '#2E7D32','#1565C0','#6A1B9A','#E65100','#B71C1C',
  '#00695C','#283593','#880E4F','#0D47A1','#004D40',
];

function safe(v, fb = '') {
  return (v === null || v === undefined || v === '') ? fb : String(v);
}
function canDraw(v) {
  return (Buffer.isBuffer(v) && v.length > 0) || (typeof v === 'string' && !!v && fs.existsSync(v));
}
function parseColor(c, def) {
  if (!c) return def;
  const m = (c + '').match(/#[0-9a-fA-F]{3,8}/);
  return m ? m[0] : def;
}

const DEFAULT_FEATURE_ICONS = [
  { key: 'shield', visible: true, caption1: '760 MICRON PVC', caption2: '' },
  { key: 'drop', visible: true, caption1: 'WATER RESISTANT', caption2: '' },
  { key: 'sun', visible: true, caption1: 'ANTI FADE PRINT', caption2: '' },
  { key: 'arrows', visible: true, caption1: 'SCRATCH RESISTANT', caption2: '' },
  { key: 'hourglass', visible: true, caption1: 'LONG LIFE', caption2: '(5-10 YEARS)' },
];

// Each school can individually show/hide and relabel each of the 5
// card-material icons — stored as a JSON array (see
// migrate-add-idcard-feature-icons.js). Falls back to the original fixed
// set if unset or malformed, so a school that never touches this setting
// renders exactly as before this feature existed.
function parseFeatureIcons(raw) {
  if (!raw) return DEFAULT_FEATURE_ICONS;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr) || arr.length === 0) return DEFAULT_FEATURE_ICONS;
    return arr;
  } catch (e) {
    return DEFAULT_FEATURE_ICONS;
  }
}

// A stored standard is usually already ordinal ("9th"), so blindly
// appending "th Standard" produced "9thth Standard" whenever the value
// itself carried a suffix — only add the suffix when the value is a bare
// number.
function formatStandardLabel(std) {
  if (!std) return '';
  const s = String(std).trim();
  return /[a-zA-Z]$/.test(s) ? `${s} Standard` : `${s}th Standard`;
}

function acadYear(y) {
  return `${y}-${String(y + 1).slice(-2)}`;
}

function currentAcadStartYear() {
  const now = new Date();
  return now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
}

async function generateIdCardPdf({ school, student, certificate, outputPath, photoPath, logoPath, signaturePath, stampPath }) {
  const [safeLogoPath, safePhotoPath, safeSignaturePath, safeStampPath] = await Promise.all([
    toPdfSafe(logoPath),
    toPdfSafe(photoPath),
    toPdfSafe(signaturePath),
    toPdfSafe(stampPath),
  ]);
  logoPath      = safeLogoPath;
  photoPath     = safePhotoPath;
  signaturePath = safeSignaturePath;
  stampPath     = safeStampPath;

  const qrBuffer = await QRCode.toBuffer(buildVerifyUrl(certificate.id), { width: 300, margin: 1 }).catch(() => null);

  let bgBuf = null;
  if (school.id_card_template_data && Buffer.isBuffer(school.id_card_template_data)) {
    bgBuf = school.id_card_template_data;
  }
  if (!bgBuf && school.id_card_bg_data && Buffer.isBuffer(school.id_card_bg_data) && school.id_card_bg_data.length > 0) {
    bgBuf = school.id_card_bg_data;
  }

  // Watermark is a distinct, opt-in body-area effect (School Admin uploads
  // and enables it separately) — never confused with the panel-only
  // background image above, which is always-on whenever a template exists.
  const watermarkEnabled = school.id_card_watermark_enabled === 1 || school.id_card_watermark_enabled === true;
  const watermarkBuf = watermarkEnabled && Buffer.isBuffer(school.id_card_watermark_data) && school.id_card_watermark_data.length > 0
    ? school.id_card_watermark_data
    : null;
  const watermarkOpacity = school.id_card_watermark_opacity !== undefined && school.id_card_watermark_opacity !== null
    ? Math.min(1, Math.max(0, Number(school.id_card_watermark_opacity)))
    : 0.1;

  const headerColor = parseColor(school.id_card_primary_color, NAVY);
  const accentColor = (() => {
    if (!school.id_card_primary_color) return '#0a1e42';
    const mm = (school.id_card_primary_color + '').match(/#[0-9a-fA-F]{3,8}/g);
    return mm && mm.length >= 2 ? mm[1] : (mm ? mm[0] : '#0a1e42');
  })();

  const admStd   = parseInt(student.current_standard || student.admission_standard) || 5;
  const curYear  = currentAcadStartYear();
  const stdOneYear = curYear - (admStd - 1);
  const stdGrid  = Array.from({ length: 10 }, (_, i) => ({
    std: i + 1,
    year: acadYear(stdOneYear + i),
    isCurrent: i + 1 === admStd,
  }));

  const isVertical = school.id_card_orientation === 'vertical';

  return new Promise((resolve, reject) => {
    try {
       // Reference image is 631 × 426 (1.481:1). Keep a practical PDF size
       // while preserving that exact landscape proportion. Vertical is the
       // same physical CR80 card stock rotated — width/height swapped.
       const W = isVertical ? 163.4 : 242;
       const H = isVertical ? 242 : 163.4;
      const MARGIN = 3;

      const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: true });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

       const bgOpacity = school.id_card_bg_opacity !== undefined && school.id_card_bg_opacity !== null
         ? Math.min(1, Math.max(0, Number(school.id_card_bg_opacity)))
         : 0.15;
       const borderColor = parseColor(school.id_card_border_color, null);
       const showFeatureStrip = school.id_card_show_feature_strip !== 0 && school.id_card_show_feature_strip !== false;
       const featureIcons = parseFeatureIcons(school.id_card_feature_icons);

       const drawArgs = { W, H, MARGIN, headerColor, accentColor, school, student, certificate, photoPath, logoPath, signaturePath, stampPath, qrBuffer, bgBuf, bgOpacity, borderColor, showFeatureStrip, featureIcons, watermarkBuf, watermarkOpacity, GOLD, ORANGE, NAVY, GREY, TEXT, WHITE };
       if (isVertical) drawFrontVertical(doc, drawArgs);
       else drawFront(doc, drawArgs);

      doc.end();
      stream.on('finish', () => resolve(outputPath));
      stream.on('error', reject);
    } catch (e) { reject(e); }
  });
}

// ── FRONT ────────────────────────────────────────────────────────────────────
function drawFront(doc, { W, H, MARGIN, headerColor, accentColor, school, student, certificate, photoPath, logoPath, signaturePath, stampPath, qrBuffer, bgBuf, bgOpacity, borderColor, showFeatureStrip, featureIcons, watermarkBuf, watermarkOpacity, GOLD, ORANGE, NAVY, GREY, TEXT, WHITE }) {
  const FTR_H = 24;
  const CARD_TOP = 12;
  const RIGHT_X = 188;
  // No separate Student UID strip — that band was removed (it duplicated the
  // GR No. field and left no room for a real signature/address), so the
  // panel and content area now run all the way down to the feature strip.
  const CONTENT_BOTTOM = H - FTR_H;

  doc.rect(0, 0, W, H).fillColor(WHITE).fill();

  if (watermarkBuf && watermarkOpacity > 0) {
    try {
      doc.save().opacity(watermarkOpacity);
      const wmSize = Math.min(W, CONTENT_BOTTOM - CARD_TOP) * 0.9;
      doc.image(watermarkBuf, (W - wmSize) / 2, CARD_TOP + (CONTENT_BOTTOM - CARD_TOP - wmSize) / 2, { width: wmSize, height: wmSize, fit: [wmSize, wmSize] });
      doc.restore();
    } catch (e) {}
  }

  // Reference layout: a themed architectural panel (school's chosen Primary
  // Color) with a gold edge, occupying the right side of the card — this is
  // always the base design, so "Primary Color" always has visible effect.
  doc.save()
    .moveTo(RIGHT_X, CARD_TOP).lineTo(W, CARD_TOP).lineTo(W, CONTENT_BOTTOM)
    .lineTo(RIGHT_X, CONTENT_BOTTOM).lineTo(166, 88).closePath()
    .fillColor(headerColor).fill().restore();
  // Panel edge accent — gold by default, but honors the same Border Line
  // Color chosen in Settings so a school can eliminate the yellow/gold
  // entirely by picking their own color (or leave it for the original look).
  doc.save().moveTo(RIGHT_X, CARD_TOP).lineTo(W, CARD_TOP).lineTo(W, CONTENT_BOTTOM)
    .lineWidth(1.2).strokeColor(borderColor || GOLD).stroke().restore();
  doc.save().moveTo(RIGHT_X, CARD_TOP).lineTo(166, 88).lineTo(RIGHT_X, CONTENT_BOTTOM)
    .lineWidth(0.8).strokeColor(borderColor || GOLD).stroke().restore();

  // Subtle school-building watermark in the panel — only when no uploaded
  // background image is taking its place.
  if (!bgBuf) {
    doc.save().opacity(0.16).fillColor('#b7c8e8');
    doc.rect(198, 58, 37, 47).fill();
    doc.moveTo(193, 58).lineTo(216, 40).lineTo(240, 58).closePath().fill();
    doc.rect(202, 69, 5, 36).fillColor(accentColor).fill();
    doc.rect(214, 69, 5, 36).fillColor(accentColor).fill();
    doc.rect(226, 69, 5, 36).fillColor(accentColor).fill();
    doc.rect(207, 62, 4, 4).fillColor(accentColor).fill();
    doc.rect(219, 62, 4, 4).fillColor(accentColor).fill();
    doc.rect(231, 62, 4, 4).fillColor(accentColor).fill();
    doc.restore();
  }

  // Uploaded background image — confined to exactly the colored panel's own
  // diagonal shape (same polygon as the panel fill above), drawn at reduced
  // opacity so it reads as a watermark laid OVER the Primary Color rather
  // than replacing it, and never bleeding onto the white photo/text side of
  // the card or past the panel's own edge.
  if (bgBuf) {
    try {
      doc.save();
      doc.opacity(bgOpacity);
      doc.moveTo(RIGHT_X, CARD_TOP).lineTo(W, CARD_TOP).lineTo(W, CONTENT_BOTTOM)
        .lineTo(RIGHT_X, CONTENT_BOTTOM).lineTo(166, 88).closePath().clip();
      doc.image(bgBuf, 166, CARD_TOP, { width: W - 166, height: CONTENT_BOTTOM - CARD_TOP });
      doc.restore();
    } catch (e) {}
  }

  // School logo and branding. Logo and QR are kept the same size (32pt) so
  // neither reads as more "official" than the other.
  const logoX = 13, logoY = 19, logoSize = 32;
  if (canDraw(logoPath)) {
    try { doc.image(logoPath, logoX, logoY, { width: logoSize, height: logoSize }); } catch (e) {}
  }
  // Sanstha name (optional, School Settings > Certificate Header) is a tiny
  // line above the school name — shifts everything below it down by a fixed
  // amount only when set, so a school that never uses it sees no layout
  // change at all.
  const idSanshaOffset = school.sanstha_name ? 7 : 0;
  if (school.sanstha_name) {
    const sanstha = fitSingleLine(doc, safe(school.sanstha_name).toUpperCase(), 118, 'Helvetica-Bold', 5);
    doc.font('Helvetica-Bold').fontSize(5).fillColor(GREY)
      .text(sanstha, 66, 19, { width: 118, lineBreak: false });
  }
  const schoolName = safe(school.id_card_school_name || school.name, 'School name');
  const schoolFont = 9.2;
  const schoolNameLines = splitSchoolName(doc, schoolName.toUpperCase(), 117, 'Helvetica-Bold', schoolFont);
  schoolNameLines.forEach((line, index) => {
    doc.font('Helvetica-Bold').fontSize(schoolFont).fillColor(headerColor)
      .text(line, 66, 19 + idSanshaOffset + index * 9.2, { width: 117, lineBreak: false });
  });
  const defaultSubtitle = school.recog_no ? `CBSE Affiliation No. ${school.recog_no}` : '';
  const configuredSubtitle = safe(school.id_card_subtitle);
  const subtitleValue = !configuredSubtitle || configuredSubtitle === 'Student ID Card'
    ? defaultSubtitle
    : configuredSubtitle;
  if (subtitleValue) {
    const subtitle = fitSingleLine(doc, subtitleValue, 118, 'Helvetica', 5.2);
    doc.font('Helvetica').fontSize(5.2).fillColor(TEXT)
      .text(subtitle, 66, 39 + idSanshaOffset, { width: 118, lineBreak: false });
  }
  const contact = [school.website, school.phone || school.email].filter(Boolean).join('  |  ');
  if (contact) {
    const contactText = fitSingleLine(doc, contact, 118, 'Helvetica', 4.8);
    doc.font('Helvetica').fontSize(4.8).fillColor(TEXT)
      .text(contactText, 66, 48 + idSanshaOffset, { width: 118, lineBreak: false });
  }

  // Student photo — slightly smaller than the original reference to make
  // room for a real Principal Signature image lower on the card.
  const PH_X = 16, PH_Y = 62, PH_W = 44, PH_H = 54;
  doc.save().roundedRect(PH_X, PH_Y, PH_W, PH_H, 2)
    .lineWidth(0.8).strokeColor(headerColor).stroke().restore();
  if (canDraw(photoPath)) {
    try {
      doc.image(photoPath, PH_X + 1, PH_Y + 1, { width: PH_W - 2, height: PH_H - 2 });
    } catch (e) {
      drawPhotoPlaceholder(doc, PH_X, PH_Y, PH_W, PH_H, GREY);
    }
  } else {
    drawPhotoPlaceholder(doc, PH_X, PH_Y, PH_W, PH_H, GREY);
  }

  // Compact, consistently aligned key/value fields.
  const FX = 68, LABEL_W = 39, VALUE_X = FX + LABEL_W + 4;
  const fieldWidth = RIGHT_X - VALUE_X - 3;
  const fields = [
    ['Student Name', safe(student.full_name)],
    ['GR No.', safe(student.gr_number || student.register_number)],
    ['Date of Birth', fmtDate(student.dob)],
    ["Father's Mobile", safe(student.parent_mobile)],
    ["Father's Name", safe(student.father_name)],
    ['Valid Till', safe(student.id_card_valid_till || formatStandardLabel(student.current_standard || student.admission_standard))],
  ];
  fields.forEach(([label, value], index) => {
    const y = 65 + index * 9;
    doc.font('Helvetica').fontSize(5.6).fillColor(TEXT)
      .text(label, FX, y, { width: LABEL_W, lineBreak: false, ellipsis: true });
    doc.font('Helvetica').fontSize(5.6).fillColor(TEXT)
      .text(':', FX + LABEL_W - 1, y, { width: 4, lineBreak: false });
    const valueText = fitSingleLine(doc, value || '—', fieldWidth, 'Helvetica-Bold', 5.6);
    doc.font('Helvetica-Bold').fontSize(5.6).fillColor(TEXT)
      .text(valueText, VALUE_X, y, { width: fieldWidth, lineBreak: false });
  });

  // ── Address + Principal Signature — the space freed by dropping the old
  // text-only "Authorized by" row and the Student UID strip. A real
  // signature image now sits above the designation label instead of plain
  // text standing in for it.
  const sigBandY = 65 + fields.length * 9 + 2;
  if (school.id_card_show_address && student.address) {
    const addrW = 68;
    const addrText = fitSingleLine(doc, `Address: ${student.address}`, addrW, 'Helvetica', 4.6);
    doc.font('Helvetica').fontSize(4.6).fillColor(TEXT)
      .text(addrText, FX, sigBandY + 3, { width: addrW, lineBreak: false });
  }
  const sigW = 42, sigH = 11, sigX = FX + 74;
  const sigLineY = sigBandY + sigH;
  if (canDraw(signaturePath)) {
    try { doc.image(signaturePath, sigX, sigBandY, { width: sigW, height: sigH, fit: [sigW, sigH] }); } catch (e) {}
  }
  doc.save().moveTo(sigX, sigLineY).lineTo(sigX + sigW, sigLineY).lineWidth(0.4).strokeColor('#9ca3af').stroke().restore();
  doc.font('Helvetica').fontSize(4.2).fillColor(GREY)
    .text(safe(school.idcard_signature_label, 'Principal'), sigX, sigLineY + 1, { width: sigW, align: 'center', lineBreak: false });

  // QR code — now equal-sized to the logo and no longer needs to overlap
  // a Student UID strip (removed above), so it sits cleanly in the panel.
  const QR_SZ = 32, QR_X = RIGHT_X + (W - RIGHT_X - QR_SZ) / 2, QR_Y = 92;
  doc.save().roundedRect(QR_X - 3, QR_Y - 3, QR_SZ + 6, QR_SZ + 6, 2).fillColor(WHITE).fill().restore();
  if (qrBuffer) {
    try { doc.image(qrBuffer, QR_X, QR_Y, { width: QR_SZ, height: QR_SZ }); } catch (e) {}
  }

  // Feature strip shown on the supplied reference image — the School Admin
  // controls this from Settings: a master on/off switch
  // (id_card_show_feature_strip) plus per-icon visibility and caption text
  // (id_card_feature_icons). Hidden icons are simply omitted; the
  // remaining visible ones spread evenly across the full width, and no
  // other element on the card reflows (the card's standard size is
  // unaffected either way).
  const featureY = CONTENT_BOTTOM;
  doc.rect(0, featureY, W, FTR_H).fillColor(WHITE).fill();
  const features = showFeatureStrip ? featureIcons.filter(f => f.visible !== false) : [];
  const featureW = W / (features.length || 1);
  features.forEach((feature, index) => {
    const x = index * featureW;
    if (index > 0) {
      doc.save().moveTo(x, featureY + 4).lineTo(x, H - 4)
        .lineWidth(0.3).strokeColor('#e5e7eb').stroke().restore();
    }
    drawFeatureIcon(doc, feature.key, x + featureW / 2, featureY + 7, headerColor);
    if (feature.caption1) {
      doc.font('Helvetica-Bold').fontSize(3.4).fillColor(TEXT)
        .text(feature.caption1, x + 1, featureY + 13, { width: featureW - 2, align: 'center', lineBreak: false });
    }
    if (feature.caption2) {
      doc.font('Helvetica-Bold').fontSize(3.1).fillColor(TEXT)
        .text(feature.caption2, x + 1, featureY + 17, { width: featureW - 2, align: 'center', lineBreak: false });
    }
  });

  // Single clean border line (the old two-tone gray+gold frame is gone,
  // per explicit request to remove the yellow border) - color follows the
  // School Admin's choice, defaulting to a neutral gray.
  doc.save().rect(1, CARD_TOP, W - 2, H - CARD_TOP - 1).lineWidth(1.2).strokeColor(borderColor || '#d1d5db').stroke().restore();
}

// ── FRONT — VERTICAL (portrait) ─────────────────────────────────────────────
// Same physical CR80 card, rotated: a top identity band, a centered photo,
// full-width label:value rows (more breathing room than the landscape
// two-column layout), then the same UID strip and feature strip conventions
// as the landscape design, just re-flowed for a narrower width.
function drawFrontVertical(doc, { W, H, MARGIN, headerColor, accentColor, school, student, certificate, photoPath, logoPath, signaturePath, stampPath, qrBuffer, bgBuf, bgOpacity, borderColor, showFeatureStrip, featureIcons, watermarkBuf, watermarkOpacity, GREY, TEXT, WHITE }) {
  const FTR_H = 24;
  const CONTENT_BOTTOM = H - FTR_H;
  const CARD_TOP = 8;
  const HDR_H = 50;

  doc.rect(0, 0, W, H).fillColor(WHITE).fill();

  if (watermarkBuf && watermarkOpacity > 0) {
    try {
      doc.save().opacity(watermarkOpacity);
      const wmSize = Math.min(W, CONTENT_BOTTOM - CARD_TOP - HDR_H) * 0.9;
      doc.image(watermarkBuf, (W - wmSize) / 2, CARD_TOP + HDR_H + (CONTENT_BOTTOM - CARD_TOP - HDR_H - wmSize) / 2, { width: wmSize, height: wmSize, fit: [wmSize, wmSize] });
      doc.restore();
    } catch (e) {}
  }

  // ── Header band: logo | school name (wraps to 2 lines) | QR ──────────────
  doc.save().rect(0, CARD_TOP, W, HDR_H).fillColor(headerColor).fill().restore();

  const logoSz = 26;
  if (canDraw(logoPath)) {
    try { doc.image(logoPath, 10, CARD_TOP + 12, { width: logoSz, height: logoSz }); } catch (e) {}
  }

  const qrSz = 26;
  const qrX = W - 8 - qrSz, qrY = CARD_TOP + 10;
  doc.save().roundedRect(qrX - 2, qrY - 2, qrSz + 4, qrSz + 4, 2).fillColor(WHITE).fill().restore();
  if (qrBuffer) {
    try { doc.image(qrBuffer, qrX, qrY, { width: qrSz, height: qrSz }); } catch (e) {}
  }

  const nameX = 10 + logoSz + 6;
  const nameW = qrX - 6 - nameX;
  const schoolName = safe(school.id_card_school_name || school.name, 'School name').toUpperCase();
  const nameLines = splitSchoolName(doc, schoolName, nameW, 'Helvetica-Bold', 7.2);
  nameLines.slice(0, 2).forEach((line, index) => {
    doc.font('Helvetica-Bold').fontSize(7.2).fillColor(WHITE)
      .text(line, nameX, CARD_TOP + 10 + index * 8.4, { width: nameW, align: 'center', lineBreak: false });
  });
  const subtitleValue = safe(school.id_card_subtitle) || (school.recog_no ? `Recog. No. ${school.recog_no}` : '');
  if (subtitleValue) {
    const subtitle = fitSingleLine(doc, subtitleValue, nameW, 'Helvetica', 5);
    doc.font('Helvetica').fontSize(5).fillColor('#dbe4f5')
      .text(subtitle, nameX, CARD_TOP + 10 + nameLines.slice(0, 2).length * 8.4 + 1, { width: nameW, align: 'center', lineBreak: false });
  }

  // ── Student photo, centered ───────────────────────────────────────────────
  // Slightly smaller than the original reference to make room for a real
  // Principal Signature image lower on the card.
  const PH_W = 54, PH_H = 58, PH_X = (W - PH_W) / 2, PH_Y = CARD_TOP + HDR_H + 8;
  doc.save().roundedRect(PH_X, PH_Y, PH_W, PH_H, 2).lineWidth(0.8).strokeColor(headerColor).stroke().restore();
  if (canDraw(photoPath)) {
    try { doc.image(photoPath, PH_X + 1, PH_Y + 1, { width: PH_W - 2, height: PH_H - 2 }); }
    catch (e) { drawPhotoPlaceholder(doc, PH_X, PH_Y, PH_W, PH_H, GREY); }
  } else {
    drawPhotoPlaceholder(doc, PH_X, PH_Y, PH_W, PH_H, GREY);
  }

  // ── Full-width label:value rows ───────────────────────────────────────────
  const FX = 12, LABEL_W = 46, VALUE_X = FX + LABEL_W + 4;
  const fieldWidth = W - VALUE_X - 10;
  const fields = [
    ['Student Name', safe(student.full_name)],
    ['GR No.', safe(student.gr_number || student.register_number)],
    ['Date of Birth', fmtDate(student.dob)],
    ["Father's Mobile", safe(student.parent_mobile)],
    ["Father's Name", safe(student.father_name)],
    ['Valid Till', safe(student.id_card_valid_till || formatStandardLabel(student.current_standard || student.admission_standard))],
  ];
  const rowY0 = PH_Y + PH_H + 8;
  fields.forEach(([label, value], index) => {
    const y = rowY0 + index * 9;
    doc.font('Helvetica').fontSize(6.4).fillColor(TEXT)
      .text(label, FX, y, { width: LABEL_W, lineBreak: false, ellipsis: true });
    doc.font('Helvetica').fontSize(6.4).fillColor(TEXT)
      .text(':', FX + LABEL_W - 1, y, { width: 4, lineBreak: false });
    const valueText = fitSingleLine(doc, value || '—', fieldWidth, 'Helvetica-Bold', 6.4);
    doc.font('Helvetica-Bold').fontSize(6.4).fillColor(TEXT)
      .text(valueText, VALUE_X, y, { width: fieldWidth, lineBreak: false });
  });

  // ── Address + Principal Signature — the space freed by dropping the old
  // text-only "Authorized by" row and the Student UID strip. A real
  // signature image now sits above the designation label instead of plain
  // text standing in for it.
  const sigBandY = rowY0 + fields.length * 9 + 2;
  if (school.id_card_show_address && student.address) {
    const addrW = W - FX * 2;
    const addrText = fitSingleLine(doc, `Address: ${student.address}`, addrW, 'Helvetica', 5.2);
    doc.font('Helvetica').fontSize(5.2).fillColor(TEXT)
      .text(addrText, FX, sigBandY, { width: addrW, lineBreak: false });
  }
  const sigW = 50, sigH = 11, sigX = (W - sigW) / 2, sigY = sigBandY + 10;
  const sigLineY = sigY + sigH;
  if (canDraw(signaturePath)) {
    try { doc.image(signaturePath, sigX, sigY, { width: sigW, height: sigH, fit: [sigW, sigH] }); } catch (e) {}
  }
  doc.save().moveTo(sigX, sigLineY).lineTo(sigX + sigW, sigLineY).lineWidth(0.4).strokeColor('#9ca3af').stroke().restore();
  doc.font('Helvetica').fontSize(4.8).fillColor(GREY)
    .text(safe(school.idcard_signature_label, 'Principal'), sigX, sigLineY + 1, { width: sigW, align: 'center', lineBreak: false });

  // ── Feature strip ──────────────────────────────────────────────────────────
  const featureY = CONTENT_BOTTOM;
  doc.rect(0, featureY, W, FTR_H).fillColor(WHITE).fill();
  const features = showFeatureStrip ? featureIcons.filter(f => f.visible !== false) : [];
  const featureW = W / (features.length || 1);
  features.forEach((feature, index) => {
    const x = index * featureW;
    if (index > 0) {
      doc.save().moveTo(x, featureY + 4).lineTo(x, H - 4).lineWidth(0.3).strokeColor('#e5e7eb').stroke().restore();
    }
    drawFeatureIcon(doc, feature.key, x + featureW / 2, featureY + 7, headerColor);
    if (feature.caption1) {
      doc.font('Helvetica-Bold').fontSize(3.2).fillColor(TEXT)
        .text(feature.caption1, x + 1, featureY + 13, { width: featureW - 2, align: 'center', lineBreak: false });
    }
    if (feature.caption2) {
      doc.font('Helvetica-Bold').fontSize(2.9).fillColor(TEXT)
        .text(feature.caption2, x + 1, featureY + 17, { width: featureW - 2, align: 'center', lineBreak: false });
    }
  });

  doc.save().rect(1, CARD_TOP, W - 2, H - CARD_TOP - 1).lineWidth(1.2).strokeColor(borderColor || '#d1d5db').stroke().restore();
}

// Draw these as vectors instead of Unicode glyphs. Helvetica does not contain
// the symbols used by the reference, so glyphs render as broken text in PDFs.
function drawFeatureIcon(doc, type, cx, cy, color) {
  doc.save().lineWidth(0.8).strokeColor(color).fillColor(WHITE);
  if (type === 'shield') {
    doc.moveTo(cx, cy - 6).lineTo(cx + 5, cy - 4).lineTo(cx + 4, cy + 2)
      .lineTo(cx, cy + 6).lineTo(cx - 4, cy + 2).lineTo(cx - 5, cy - 4)
      .closePath().fillAndStroke();
    doc.lineWidth(0.5).moveTo(cx - 2, cy).lineTo(cx - 0.5, cy + 1.5)
      .lineTo(cx + 2.5, cy - 2).stroke();
  } else if (type === 'drop') {
    doc.moveTo(cx, cy - 7).bezierCurveTo(cx - 5, cy - 1, cx - 5, cy + 4, cx, cy + 5)
      .bezierCurveTo(cx + 5, cy + 4, cx + 5, cy - 1, cx, cy - 7).fillAndStroke();
  } else if (type === 'sun') {
    doc.circle(cx, cy, 3).fillAndStroke();
    for (let i = 0; i < 8; i += 1) {
      const angle = (Math.PI * 2 * i) / 8;
      doc.moveTo(cx + Math.cos(angle) * 5, cy + Math.sin(angle) * 5)
        .lineTo(cx + Math.cos(angle) * 7, cy + Math.sin(angle) * 7).stroke();
    }
  } else if (type === 'arrows') {
    doc.moveTo(cx - 7, cy).lineTo(cx + 7, cy)
      .moveTo(cx - 7, cy).lineTo(cx - 3, cy - 3)
      .moveTo(cx - 7, cy).lineTo(cx - 3, cy + 3)
      .moveTo(cx + 7, cy).lineTo(cx + 3, cy - 3)
      .moveTo(cx + 7, cy).lineTo(cx + 3, cy + 3).stroke();
    doc.rect(cx - 3, cy - 3, 6, 6).stroke();
  } else {
    doc.moveTo(cx - 3, cy - 6).lineTo(cx + 3, cy - 6).lineTo(cx + 2, cy - 1)
      .lineTo(cx - 2, cy + 1).lineTo(cx - 3, cy + 6).lineTo(cx + 3, cy + 6)
      .moveTo(cx - 4, cy - 7).lineTo(cx + 4, cy - 7)
      .moveTo(cx - 4, cy + 7).lineTo(cx + 4, cy + 7).stroke();
  }
  doc.restore();
}

function drawPhotoPlaceholder(doc, x, y, width, height, color) {
  doc.save().rect(x + 1, y + 1, width - 2, height - 2)
    .fillColor('#eef2f7').fill().restore();
  doc.font('Helvetica-Bold').fontSize(5.5).fillColor(color)
    .text('PHOTO', x, y + height / 2 - 3, {
      width, align: 'center', lineBreak: false,
    });
}

function fitSingleLine(doc, value, maxWidth, font, fontSize) {
  const original = safe(value, '—');
  doc.font(font).fontSize(fontSize);
  // A 1pt safety margin: pdfkit's `lineBreak: false` render can still wrap
  // a line whose measured widthOfString sits a hair under the exact box
  // width (rounding differences between measurement and layout), so fit
  // slightly tighter than the box to guarantee a single rendered line.
  const safeWidth = maxWidth - 1;
  if (doc.widthOfString(original) <= safeWidth) return original;

  let shortened = original;
  while (shortened.length > 1 && doc.widthOfString(`${shortened}...`) > safeWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}...`;
}

function splitSchoolName(doc, value, maxWidth, font, fontSize) {
  const original = safe(value, 'SCHOOL NAME');
  doc.font(font).fontSize(fontSize);
  if (doc.widthOfString(original) <= maxWidth) return [original];

  const words = original.split(/\s+/).filter(Boolean);
  if (words.length < 2) return [fitSingleLine(doc, original, maxWidth, font, fontSize)];

  let best = null;
  for (let split = 1; split < words.length; split += 1) {
    const first = words.slice(0, split).join(' ');
    const second = words.slice(split).join(' ');
    const score = Math.max(doc.widthOfString(first), doc.widthOfString(second));
    if (!best || score < best.score) best = { first, second, score };
  }
  return [
    fitSingleLine(doc, best.first, maxWidth, font, fontSize),
    fitSingleLine(doc, best.second, maxWidth, font, fontSize),
  ];
}

function drawLegacyFront(doc, { W, H, MARGIN, headerColor, accentColor, school, student, certificate, photoPath, logoPath, signaturePath, stampPath, qrBuffer, bgBuf, GOLD, ORANGE, NAVY, GREY, TEXT, WHITE }) {
  const HDR_H    = 38;
  const FTR_H    = 18;
  const BODY_Y   = HDR_H + 1;
  const BODY_BOT = H - FTR_H - 1;
  const BODY_H   = BODY_BOT - BODY_Y;

  // Card base
  doc.rect(0, 0, W, H).fillColor(WHITE).fill();

  // Background watermark
  if (bgBuf) {
    try { doc.image(bgBuf, MARGIN, BODY_Y, { width: W - MARGIN * 2, height: BODY_H }); } catch (e) {}
  }

  // ── HEADER ───────────────────────────────────────────────────────────────
  doc.save().rect(0, 0, W, HDR_H).fillColor(headerColor).fill().restore();

  // (top-right "STUDENT ID" corner badge removed per requirement)
  const BADGE_W = 0;

  // Logo
  const LG_SZ = 28, LG_X = 6, LG_Y = (HDR_H - LG_SZ) / 2;
  if (canDraw(logoPath) && !Buffer.isBuffer(logoPath)) {
    try { doc.image(logoPath, LG_X, LG_Y, { width: LG_SZ, height: LG_SZ }); } catch (e) {}
  }

  // School name + subtitle + contact
  const TX = LG_X + LG_SZ + 5;
  const TW = W - TX - BADGE_W - 2;
  const schName = safe(school.id_card_school_name || school.name).toUpperCase();
  let fs = 9.5;
  doc.font('Helvetica-Bold');
  while (fs > 7 && doc.fontSize(fs).widthOfString(schName) > TW) fs -= 0.4;
  doc.fillColor(WHITE).fontSize(fs).text(schName, TX, 5, { width: TW, lineBreak: false, ellipsis: true });

  const sub1 = safe(school.id_card_subtitle || (school.recog_no ? `Affiliation No. ${school.recog_no}` : ''));
  if (sub1) {
    doc.font('Helvetica').fontSize(5.5).fillColor('#cbd5e1').text(sub1, TX, 5 + fs + 2, { width: TW, lineBreak: false, ellipsis: true });
  }
  const contact = [school.phone, school.email].filter(Boolean).join('  |  ');
  if (contact) {
    doc.font('Helvetica').fontSize(5).fillColor('#94a3b8').text(contact, TX, 5 + fs + (sub1 ? 9 : 2), { width: TW, lineBreak: false, ellipsis: true });
  }

  // Gold separator lines
  doc.save()
    .moveTo(0, HDR_H).lineTo(W, HDR_H).lineWidth(1.5).strokeColor(GOLD).stroke()
    .moveTo(0, BODY_BOT).lineTo(W, BODY_BOT).lineWidth(1).strokeColor(GOLD).stroke()
    .restore();

  // ── BODY ─────────────────────────────────────────────────────────────────
  // Photo: left side
  const PH_X = 7, PH_Y = BODY_Y + 5, PH_W = 50, PH_H = 64;

  doc.save().roundedRect(PH_X, PH_Y, PH_W, PH_H, 2).lineWidth(1.2).strokeColor(GOLD).stroke().restore();
  if (canDraw(photoPath) && !Buffer.isBuffer(photoPath)) {
    try { doc.image(photoPath, PH_X + 1, PH_Y + 1, { width: PH_W - 2, height: PH_H - 2 }); }
    catch (e) {
      doc.save().rect(PH_X + 1, PH_Y + 1, PH_W - 2, PH_H - 2).fillColor('#f1f5f9').fill().restore();
      doc.font('Helvetica').fontSize(6.5).fillColor(GREY).text('PHOTO', PH_X, PH_Y + PH_H / 2 - 4, { width: PH_W, align: 'center' });
    }
  } else {
    doc.save().rect(PH_X + 1, PH_Y + 1, PH_W - 2, PH_H - 2).fillColor('#f1f5f9').fill().restore();
    doc.font('Helvetica').fontSize(6.5).fillColor(GREY).text('PHOTO', PH_X, PH_Y + PH_H / 2 - 4, { width: PH_W, align: 'center' });
  }

  // QR code: right side (opposite photo)
  const QR_SZ = 34;
  const QR_X  = W - 7 - QR_SZ;
  const QR_Y  = BODY_Y + 5;
  if (qrBuffer) {
    try { doc.image(qrBuffer, QR_X, QR_Y, { width: QR_SZ, height: QR_SZ }); } catch (e) {}
    doc.font('Helvetica').fontSize(4).fillColor(GREY)
      .text('Scan to verify', QR_X, QR_Y + QR_SZ + 1, { width: QR_SZ, align: 'center' });
  }

  // ── Fields column — between photo and QR ─────────────────────────────────
  const FX  = PH_X + PH_W + 5;
  const FW  = QR_X - FX - 4;   // stop before QR area
  const MAX_FY = BODY_BOT - 20; // leave room for Head Master line at bottom
  let fy = BODY_Y + 4;

  // Student name
  const nameStr = safe(student.full_name).toUpperCase();
  doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY)
    .text(nameStr, FX, fy, { width: FW, lineBreak: false, ellipsis: true });
  fy += 11;

  // Gold underline
  doc.save().moveTo(FX, fy).lineTo(FX + FW, fy).lineWidth(0.6).strokeColor(GOLD).stroke().restore();
  fy += 4;

  const LBL_W = 38;
  const ROW_H = 9;

  // Rows: Class and Valid Till removed per requirement
  const rows = [
    ['GR No.',    safe(student.gr_number || student.register_number)],
    ['D.O.B.',    fmtDate(student.dob)],
    ['Blood Grp', safe(student.blood_group) || '—'],
    ['Father',    safe(student.father_name)],
  ];

  if (school.id_card_show_emergency_contact && student.parent_mobile)
    rows.push(['Mobile', safe(student.parent_mobile)]);
  if (school.id_card_show_address && student.address)
    rows.push(['Address', safe(student.address)]);

  rows.forEach(([label, val]) => {
    if (fy + ROW_H > MAX_FY) return;
    doc.font('Helvetica').fontSize(5.5).fillColor(GREY)
      .text(`${label}:`, FX, fy, { width: LBL_W, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(5.5).fillColor(TEXT)
      .text(val || '—', FX + LBL_W, fy, { width: FW - LBL_W, lineBreak: false, ellipsis: true });
    fy += ROW_H;
  });

  // ── Head Master block — right side, below the QR code ────────────────────
  // Stacked order: seal (stamp) → signature → line → "Head Master"
  const SIG_W = 56;
  const SIG_X = W - 7 - SIG_W;               // right-aligned, same edge as QR
  const SIG_LINE_Y = BODY_BOT - 10;
  if (canDraw(stampPath) && !Buffer.isBuffer(stampPath)) {
    try { doc.image(stampPath, SIG_X + SIG_W / 2 - 12, SIG_LINE_Y - 36, { width: 24, height: 24, fit: [24, 24] }); } catch (e) {}
  }
  if (canDraw(signaturePath) && !Buffer.isBuffer(signaturePath)) {
    try { doc.image(signaturePath, SIG_X, SIG_LINE_Y - 12, { width: SIG_W, height: 11, fit: [SIG_W, 11] }); } catch (e) {}
  }
  doc.save().moveTo(SIG_X, SIG_LINE_Y).lineTo(SIG_X + SIG_W, SIG_LINE_Y)
    .lineWidth(0.4).strokeColor('#9ca3af').stroke().restore();
  if (school.principal_name) {
    doc.font('Helvetica-Bold').fontSize(3.8).fillColor(TEXT)
      .text(String(school.principal_name).toUpperCase(), SIG_X, SIG_LINE_Y + 1.5, {
        width: SIG_W, align: 'center', lineBreak: false, ellipsis: true,
      });
  }
  doc.font('Helvetica').fontSize(4.5).fillColor(GREY)
    .text('Head Master', SIG_X, SIG_LINE_Y + (school.principal_name ? 7 : 2), {
      width: SIG_W, align: 'center', lineBreak: false,
    });

  // ── FOOTER BAND ───────────────────────────────────────────────────────────
  doc.save().rect(0, BODY_BOT + 1, W, FTR_H).fillColor(accentColor).fill().restore();

  // Student UID
  const uid = safe(student.serial_id || certificate.serial_number || '');
  if (uid) {
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(GOLD)
      .text('Student UID : ', 6, BODY_BOT + 5, { continued: true })
      .font('Helvetica-Bold').fillColor(WHITE)
      .text(uid, { lineBreak: false });
  }
  doc.font('Helvetica').fontSize(5).fillColor('#94a3b8')
    .text(safe(school.id_card_footer_text, 'If found, please return to school.'), 6, BODY_BOT + 12, { width: W - 12, lineBreak: false, ellipsis: true });

  // ── Border ────────────────────────────────────────────────────────────────
  doc.save()
    .rect(1, 1, W - 2, H - 2).lineWidth(1.5).strokeColor(WHITE).stroke()
    .rect(MARGIN, MARGIN, W - MARGIN * 2, H - MARGIN * 2).lineWidth(0.8).strokeColor(GOLD).stroke()
    .restore();
}

// ── BACK ─────────────────────────────────────────────────────────────────────
function drawBack(doc, { W, H, MARGIN, headerColor, accentColor, school, stdGrid, BOX_COLORS, GOLD, NAVY, WHITE }) {
  doc.rect(0, 0, W, H).fillColor(WHITE).fill();

  const HDR_H = 22;
  doc.save().rect(0, 0, W, HDR_H).fillColor(headerColor).fill().restore();

  doc.font('Helvetica-Bold').fontSize(8).fillColor(WHITE)
    .text('ACADEMIC YEAR & ROLL NUMBER UPDATE', 0, 4, { width: W, align: 'center', lineBreak: false });
  doc.font('Helvetica').fontSize(5.5).fillColor('#93c5fd')
    .text('(Sticker Zone — Fill or paste sticker each year)', 0, 14, { width: W, align: 'center', lineBreak: false });

  doc.save().moveTo(0, HDR_H).lineTo(W, HDR_H).lineWidth(1.2).strokeColor(GOLD).stroke().restore();

  const COLS       = 5;
  const ROWS_COUNT = 2;
  const PAD        = 2;
  const GRID_Y     = HDR_H + PAD + 1;
  const GRID_H     = H - GRID_Y - 14;
  const BOX_W      = (W - PAD * 2 - (COLS - 1) * PAD) / COLS;
  const BOX_H      = (GRID_H - (ROWS_COUNT - 1) * PAD) / ROWS_COUNT;
  const TAG_H      = 12;

  stdGrid.forEach(({ std, year, isCurrent }, idx) => {
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    const bx  = PAD + col * (BOX_W + PAD);
    const by  = GRID_Y + row * (BOX_H + PAD);
    const color = BOX_COLORS[idx % BOX_COLORS.length];

    doc.save().rect(bx, by, BOX_W, BOX_H)
      .lineWidth(isCurrent ? 1.2 : 0.4)
      .strokeColor(isCurrent ? GOLD : '#cbd5e1')
      .stroke().restore();

    doc.save().rect(bx, by, BOX_W, TAG_H).fillColor(color).fill().restore();

    doc.font('Helvetica-Bold').fontSize(5).fillColor(WHITE)
      .text(year, bx + 1, by + 2, { width: BOX_W - 2, align: 'center', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(WHITE)
      .text(`STD ${std}`, bx + 1, by + 7, { width: BOX_W - 2, align: 'center', lineBreak: false });

    const FY = by + TAG_H + 2;
    const FW = BOX_W - 4;
    const FX = bx + 2;
    const fields = ['Class :', 'Div.  :', 'Roll No.:'];
    fields.forEach((label, fi) => {
      const ly = FY + fi * 7;
      doc.font('Helvetica').fontSize(4.2).fillColor('#374151')
        .text(label, FX, ly, { width: FW, lineBreak: false });
      doc.save().moveTo(FX + 18, ly + 5).lineTo(FX + FW, ly + 5)
        .lineWidth(0.3).strokeColor('#9ca3af').stroke().restore();
    });

    const SC_Y  = FY + fields.length * 7 + 1;
    const SC_R  = 3.5;
    const SC_CX = bx + BOX_W / 2;
    doc.save().circle(SC_CX, SC_Y + SC_R, SC_R)
      .lineWidth(0.4).dash(1, { space: 1 }).strokeColor('#9ca3af').stroke().restore();
    doc.font('Helvetica').fontSize(3.5).fillColor('#9ca3af')
      .text('Sticker', SC_CX - 5, SC_Y + SC_R * 2 + 1, { width: 14, align: 'center', lineBreak: false });

    const SL_Y = by + BOX_H - 8;
    doc.save().moveTo(bx + 3, SL_Y + 4).lineTo(bx + BOX_W - 3, SL_Y + 4)
      .lineWidth(0.3).strokeColor('#9ca3af').stroke().restore();
    doc.font('Helvetica').fontSize(3.5).fillColor(GREY)
      .text('Head Master Sign.', bx, SL_Y + 5, { width: BOX_W, align: 'center', lineBreak: false });
  });

  const INST_Y = H - 12;
  doc.save().rect(0, INST_Y, W, 12).fillColor(accentColor).fill().restore();
  doc.font('Helvetica').fontSize(4.5).fillColor('#e2e8f0')
    .text('This card is school property. If found, please return it to the school office.', 4, INST_Y + 4, { width: W - 8, align: 'center', lineBreak: false });

  doc.save()
    .rect(1, 1, W - 2, H - 2).lineWidth(1.5).strokeColor(WHITE).stroke()
    .rect(MARGIN, MARGIN, W - MARGIN * 2, H - MARGIN * 2).lineWidth(0.8).strokeColor(GOLD).stroke()
    .restore();
}

module.exports = { generateIdCardPdf };
