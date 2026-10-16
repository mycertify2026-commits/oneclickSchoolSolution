/**
 * idCardPdf.js — Reference-format single-side student ID card.
 *
 * The card is intentionally generated as one page only. Its aspect ratio and
 * footer feature strip follow the supplied reference image.
 *
 * The active front layout follows the supplied reference labels and keeps
 * every dynamic value inside a bounded region. The last field is labeled
 * "Standard" (current standard, falling back to admission standard) — it
 * used to be labeled "Valid Till" while already showing the standard value,
 * which was just a mislabel, not a real expiry date.
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

// School address line for the ID card header — composed the same way every
// certificate PDF already builds one (city/village, taluka, district), since
// schools has no single `address` column. No phone/mobile number in here;
// that's handled separately (see the "remove phone" change at the contact line).
function buildSchoolAddress(school) {
  return [school.city || school.village, school.taluka, school.district].filter(Boolean).join(', ');
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

// Circular logo badge — a white backdrop disc (so a transparent-PNG logo
// never shows the page/colored-band behind it, and so an unbranded school
// still gets a clean placeholder circle) with the logo image clipped to the
// circle. No added ring/border stroke — most uploaded school logos/seals
// already carry their own border artwork, so drawing another ring around
// them read as a redundant, unwanted halo.
function drawCircularLogo(doc, logoPath, cx, cy, r) {
  doc.save().circle(cx, cy, r).fillColor(WHITE).fill().restore();
  if (canDraw(logoPath)) {
    doc.save();
    doc.circle(cx, cy, r).clip();
    try { doc.image(logoPath, cx - r, cy - r, { width: r * 2, height: r * 2 }); } catch (e) {}
    doc.restore();
  }
}

// ── FRONT ────────────────────────────────────────────────────────────────────
function drawFront(doc, { W, H, MARGIN, headerColor, accentColor, school, student, certificate, photoPath, logoPath, signaturePath, stampPath, qrBuffer, bgBuf, bgOpacity, borderColor, showFeatureStrip, featureIcons, watermarkBuf, watermarkOpacity, GOLD, ORANGE, NAVY, GREY, TEXT, WHITE }) {
  // The feature-strip footer grows by schoolAddressRowH only when there's
  // an actual school address to show in it (a school with no
  // city/taluka/district filled in renders exactly as before this existed).
  const schoolAddressRowH = buildSchoolAddress(school) ? 11 : 0;
  const FTR_H = 24 + schoolAddressRowH;
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

  // School logo — large and prominent (per the school's reference design),
  // deliberately bigger than the QR code rather than matched to it, as a
  // plain circular-clipped image with no added ring/border.
  const logoX = 13, logoY = 8, logoSize = 40;
  drawCircularLogo(doc, logoPath, logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2);
  // Sanstha name (optional, School Settings > Certificate Header) is a tiny
  // line above the school name — shifts everything below it down by a fixed
  // amount only when set, so a school that never uses it sees no layout
  // change at all.
  const nameX = logoX + logoSize + 8, nameW = RIGHT_X - 5 - nameX;
  const idSanshaOffset = school.sanstha_name ? 7 : 0;
  if (school.sanstha_name) {
    const sanstha = fitSingleLine(doc, safe(school.sanstha_name).toUpperCase(), nameW, 'Helvetica-Bold', 5);
    doc.font('Helvetica-Bold').fontSize(5).fillColor(GREY)
      .text(sanstha, nameX, 10, { width: nameW, lineBreak: false });
  }
  const schoolName = safe(school.id_card_school_name || school.name, 'School name');
  // School Admin can pin a starting font size (School Settings > ID Card
  // Designer); blank/unset keeps the original 9.2pt default. Either way the
  // shrink-to-fit loop below still applies on top, so a chosen size that's
  // too big for a particular long name degrades gracefully instead of
  // overflowing or getting silently ignored. Minimum lowered from 5.5 to 4.6
  // so a genuinely long name keeps shrinking and wrapping instead of ever
  // reaching fitSingleLine's last-resort "..." truncation.
  const requestedNameSize = Number(school.id_card_school_name_font_size);
  const startNameSize = Number.isFinite(requestedNameSize) && requestedNameSize > 0 ? requestedNameSize : 9.2;
  const { lines: schoolNameLines, fontSize: schoolNameSize } = splitSchoolName(doc, schoolName.toUpperCase(), nameW, 'Helvetica-Bold', startNameSize, 4.6);
  schoolNameLines.forEach((line, index) => {
    doc.font('Helvetica-Bold').fontSize(schoolNameSize).fillColor(headerColor)
      .text(line, nameX, 10 + idSanshaOffset + index * schoolNameSize, { width: nameW, lineBreak: false });
  });

  // Subtitle and the new school-address line are positioned relative to
  // where the (possibly 1- or 2-line) name actually ended, not a hardcoded
  // offset — a long 2-line name used to risk running into a subtitle fixed
  // at y=39, which is exactly the "name looks cut off" symptom being fixed.
  let afterNameY = 10 + idSanshaOffset + schoolNameLines.length * schoolNameSize + 2;
  const defaultSubtitle = school.recog_no ? `CBSE Affiliation No.: ${school.recog_no}` : '';
  const configuredSubtitle = safe(school.id_card_subtitle);
  const subtitleValue = !configuredSubtitle || configuredSubtitle === 'Student ID Card'
    ? defaultSubtitle
    : configuredSubtitle;
  if (subtitleValue) {
    // Plain two-tone caption (grey label, bold dark value) rather than a
    // badge — matches the school's reference design, which shows this as
    // ordinary text, not a pill.
    const [subLabel, subValRaw] = subtitleValue.includes(':')
      ? [subtitleValue.slice(0, subtitleValue.indexOf(':') + 1), subtitleValue.slice(subtitleValue.indexOf(':') + 1).trim()]
      : [subtitleValue, ''];
    doc.font('Helvetica').fontSize(5.2).fillColor(GREY).text(subLabel, nameX, afterNameY, { width: nameW, lineBreak: false });
    if (subValRaw) {
      const labelW = doc.widthOfString(subLabel + ' ');
      const subVal = fitSingleLine(doc, subValRaw, Math.max(10, nameW - labelW), 'Helvetica-Bold', 5.2);
      doc.font('Helvetica-Bold').fontSize(5.2).fillColor(TEXT)
        .text(subVal, nameX + labelW, afterNameY, { width: nameW - labelW, lineBreak: false });
    }
  }
  // School address lives in the card's footer now (see featureY below),
  // not here — no phone/mobile number is shown anywhere on the card either
  // way; Father's Mobile below is a different field (the student's own
  // contact, not the school's).

  // Separator between the school-identity block above and the student
  // information block below — both sit on the plain white left side with
  // no other visual boundary between them. Moved up from the photo's edge
  // (was 1.5pt below it, reading as glued-on) so there's real padding on
  // both sides of the line instead of nearly all of it stacked above it.
  doc.save().moveTo(13, 53).lineTo(160, 53).lineWidth(0.6).strokeColor('#d0d5dd').stroke().restore();

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

  // Fields flow as inline "Label: Value" pairs — the value starts right
  // after its own label's measured width, not a fixed shared column — per
  // the school's reference design, which reads as prose rather than a
  // form grid. Student Name still gets the wrap-then-shrink treatment (up
  // to 4 lines, shrinking font before ever truncating), since a long
  // student name is as common as a long school name and was hitting the
  // same "..." truncation. Every other value shrinks to fit one line
  // before ever truncating (fitValueShrink); Father's Name gets the same
  // 2-line wrap as Student Name since a compound name can outrun even the
  // minimum single-line font size.
  const FX = 68, LABEL_GAP = 3;
  const ROW_H = 9;

  // The decorative panel's left edge isn't a straight vertical line — it's
  // diagonal from (RIGHT_X, CARD_TOP) down to a notch at (166, 88), only
  // becoming the flat RIGHT_X boundary below y=88 (see the panel polygon
  // above). A value sitting in that diagonal zone can run under the panel
  // at the flat-boundary width, so it's capped to the panel's actual edge
  // at that field's lowest point instead.
  const panelLeftEdgeAt = (y) => (y >= 88 ? RIGHT_X : RIGHT_X + (166 - RIGHT_X) * ((y - CARD_TOP) / (88 - CARD_TOP)));

  doc.font('Helvetica').fontSize(5.6);
  const studentNameLabel = 'Student Name:';
  const studentNameValueX = FX + doc.widthOfString(studentNameLabel) + LABEL_GAP;
  const nameFieldWidth = Math.min(RIGHT_X - studentNameValueX - 3, panelLeftEdgeAt(80) - studentNameValueX - 3);

  const nameValue = safe(student.full_name, '—');
  const { lines: studentNameLines, fontSize: studentNameSize } = splitSchoolName(doc, nameValue, nameFieldWidth, 'Helvetica-Bold', 5.6, 4.2, 4);
  const studentNamePitch = studentNameSize + 1.2;

  doc.font('Helvetica').fontSize(5.6).fillColor(GREY)
    .text(studentNameLabel, FX, 65, { lineBreak: false });
  studentNameLines.forEach((line, i) => {
    doc.font('Helvetica-Bold').fontSize(studentNameSize).fillColor(TEXT)
      .text(line, studentNameValueX, 65 + i * studentNamePitch, { width: nameFieldWidth, lineBreak: false });
  });

  const restFields = [
    ['GR No.', safe(student.gr_number || student.register_number), false],
    ['Date of Birth', fmtDate(student.dob), false],
    ["Father's Mobile", safe(student.parent_mobile), false],
    ["Father's Name", safe(student.father_name), true],
    ['Standard', formatStandardLabel(student.current_standard || student.admission_standard), false],
  ];
  // Student's own address (opt-in per school) renders as just another
  // inline row now — it used to be a differently-formatted free-text line
  // ("Address: ...") that didn't match the rest of the card.
  if (school.id_card_show_address && student.address) {
    restFields.push(['Address', safe(student.address), false]);
  }
  let cursorY = 65 + Math.max(ROW_H, studentNameLines.length * studentNamePitch);
  restFields.forEach(([label, value, wrap]) => {
    const labelText = `${label}:`;
    doc.font('Helvetica').fontSize(5.6);
    const valueX = FX + doc.widthOfString(labelText) + LABEL_GAP;
    const availWidth = RIGHT_X - valueX - 3;
    doc.fillColor(GREY).text(labelText, FX, cursorY, { lineBreak: false });
    if (wrap) {
      const { lines, fontSize: valueSize } = splitSchoolName(doc, value || '—', availWidth, 'Helvetica-Bold', 5.6, 4.2, 2);
      const pitch = valueSize + 1.2;
      lines.forEach((line, i) => {
        doc.font('Helvetica-Bold').fontSize(valueSize).fillColor(TEXT)
          .text(line, valueX, cursorY + i * pitch, { width: availWidth, lineBreak: false });
      });
      cursorY += Math.max(ROW_H, lines.length * pitch);
    } else {
      const { text: valueText, fontSize: valueSize } = fitValueShrink(doc, value || '—', availWidth, 'Helvetica-Bold', 5.6, 4.2);
      doc.font('Helvetica-Bold').fontSize(valueSize).fillColor(TEXT)
        .text(valueText, valueX, cursorY, { width: availWidth, lineBreak: false });
      cursorY += ROW_H;
    }
  });

  // ── Principal Signature — the space freed by dropping the old text-only
  // "Authorized by" row and the Student UID strip. A real signature image
  // now sits above the designation label instead of plain text standing in
  // for it. (Address, when shown, is now just another row above, in
  // restFields.)
  const sigBandY = cursorY + 2;
  const sigW = 42, sigH = 11, sigX = FX + 74;
  const sigLineY = sigBandY + sigH;
  if (canDraw(signaturePath)) {
    // align/valign so a signature image whose own aspect ratio isn't
    // exactly sigW:sigH sits centered over the underline below it, not
    // flush against its left edge (pdfkit's default for `fit`).
    try { doc.image(signaturePath, sigX, sigBandY, { width: sigW, height: sigH, fit: [sigW, sigH], align: 'center', valign: 'bottom' }); } catch (e) {}
  }
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
  //
  // The school's own address sits as its own line across the top of this
  // band (FTR_H was grown by schoolAddressRowH to make room for it) — this
  // is the actual card "footer", distinct from the student's own address
  // shown as a field above.
  const featureY = CONTENT_BOTTOM;
  doc.rect(0, featureY, W, FTR_H).fillColor(WHITE).fill();
  const schoolAddressFooter = buildSchoolAddress(school);
  let iconRowY = featureY;
  if (schoolAddressFooter) {
    // Solid header-color band (not a white strip with a divider line) —
    // matches the school's reference design, where the whole footer reads
    // as one colored block rather than a separate white caption line.
    doc.save().rect(0, featureY, W, schoolAddressRowH).fillColor(headerColor).fill().restore();
    const addrLabel = 'Address:';
    doc.font('Helvetica').fontSize(5).fillColor(WHITE);
    const labelW = doc.widthOfString(addrLabel + ' ');
    const addrValue = fitSingleLine(doc, schoolAddressFooter, W - 10 - labelW, 'Helvetica-Bold', 5);
    doc.font('Helvetica-Bold').fontSize(5);
    const valueW = doc.widthOfString(addrValue);
    const groupX = (W - (labelW + valueW)) / 2;
    const addrY = featureY + (schoolAddressRowH - 5) / 2;
    doc.font('Helvetica').fontSize(5).fillColor(WHITE).text(addrLabel, groupX, addrY, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(5).fillColor(WHITE).text(addrValue, groupX + labelW, addrY, { width: valueW + 1, lineBreak: false });
    iconRowY += schoolAddressRowH;
  }
  const features = showFeatureStrip ? featureIcons.filter(f => f.visible !== false) : [];
  const featureW = W / (features.length || 1);
  features.forEach((feature, index) => {
    const x = index * featureW;
    if (index > 0) {
      doc.save().moveTo(x, iconRowY + 4).lineTo(x, H - 4)
        .lineWidth(0.3).strokeColor('#e5e7eb').stroke().restore();
    }
    drawFeatureIcon(doc, feature.key, x + featureW / 2, iconRowY + 7, headerColor);
    if (feature.caption1) {
      doc.font('Helvetica-Bold').fontSize(3.4).fillColor(TEXT)
        .text(feature.caption1, x + 1, iconRowY + 13, { width: featureW - 2, align: 'center', lineBreak: false });
    }
    if (feature.caption2) {
      doc.font('Helvetica-Bold').fontSize(3.1).fillColor(TEXT)
        .text(feature.caption2, x + 1, iconRowY + 17, { width: featureW - 2, align: 'center', lineBreak: false });
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
function drawFrontVertical(doc, { W, H, MARGIN, headerColor, accentColor, school, student, certificate, photoPath, logoPath, signaturePath, stampPath, qrBuffer, bgBuf, bgOpacity, borderColor, showFeatureStrip, featureIcons, watermarkBuf, watermarkOpacity, GOLD, GREY, TEXT, WHITE }) {
  const schoolAddressRowH = buildSchoolAddress(school) ? 11 : 0;
  const FTR_H = 24 + schoolAddressRowH;
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

  // ── Header band: logo | school name (wraps up to 3 lines) ─────────────────
  // The QR code used to share this header with the school name, which meant
  // a long school name either overlapped it or got truncated/hidden. The QR
  // now lives lower on the card (left of the signature, see below) so the
  // full header width is always available to the name.
  doc.save().rect(0, CARD_TOP, W, HDR_H).fillColor(headerColor).fill().restore();

  // Large plain circular logo (no added ring), same reasoning as the
  // horizontal layout — most uploaded logos already carry their own border.
  const logoSz = 42;
  drawCircularLogo(doc, logoPath, 10 + logoSz / 2, CARD_TOP + HDR_H / 2, logoSz / 2);

  const nameX = 10 + logoSz + 7;
  const nameW = W - 8 - nameX;
  const schoolName = safe(school.id_card_school_name || school.name, 'School name').toUpperCase();
  // Same School Settings override as the horizontal layout, scaled from its
  // 9.2pt baseline down to this layout's 7.2pt baseline so one chosen value
  // means the same relative size on either orientation.
  const requestedVertNameSize = Number(school.id_card_school_name_font_size);
  const startVertNameSize = Number.isFinite(requestedVertNameSize) && requestedVertNameSize > 0 ? requestedVertNameSize * (7.2 / 9.2) : 7.2;
  const { lines: nameLines, fontSize: nameSize } = splitSchoolName(doc, schoolName, nameW, 'Helvetica-Bold', startVertNameSize, 4.6);
  const namePitch = nameSize * (8.4 / 7.2);
  // Left-aligned next to the logo (not centered under it) — per the
  // school's reference design.
  nameLines.forEach((line, index) => {
    doc.font('Helvetica-Bold').fontSize(nameSize).fillColor(WHITE)
      .text(line, nameX, CARD_TOP + 10 + index * namePitch, { width: nameW, lineBreak: false });
  });
  // Subtitle positioned relative to where the name actually ended (1, 2, or
  // 3 lines), same reasoning as the horizontal layout. School address lives
  // in the card's footer now (see featureY below), not here.
  const afterVertNameY = CARD_TOP + 10 + nameLines.length * namePitch + 2;
  const subtitleValue = safe(school.id_card_subtitle) || (school.recog_no ? `Recog. No.: ${school.recog_no}` : '');
  if (subtitleValue) {
    // Plain two-tone caption (translucent white label, solid white bold
    // value), left-aligned — matches the school's reference design, which
    // shows this as ordinary text rather than a badge.
    const [subLabelV, subValRawV] = subtitleValue.includes(':')
      ? [subtitleValue.slice(0, subtitleValue.indexOf(':') + 1), subtitleValue.slice(subtitleValue.indexOf(':') + 1).trim()]
      : [subtitleValue, ''];
    doc.font('Helvetica').fontSize(5.4).fillColor(WHITE).fillOpacity(0.78)
      .text(subLabelV, nameX, afterVertNameY, { width: nameW, lineBreak: false });
    if (subValRawV) {
      doc.font('Helvetica').fontSize(5.4);
      const labelWV = doc.widthOfString(subLabelV + ' ');
      const subValV = fitSingleLine(doc, subValRawV, Math.max(10, nameW - labelWV), 'Helvetica-Bold', 5.4);
      doc.font('Helvetica-Bold').fontSize(5.4).fillColor(WHITE).fillOpacity(1)
        .text(subValV, nameX + labelWV, afterVertNameY, { width: nameW - labelWV, lineBreak: false });
    }
    doc.fillOpacity(1);
  }

  // Separator between the school-identity header band and the student
  // information below it — the header already has its own fill color, but
  // a thin line in the white gap makes the boundary explicit too.
  doc.save().moveTo(10, CARD_TOP + HDR_H + 5).lineTo(W - 10, CARD_TOP + HDR_H + 5).lineWidth(0.6).strokeColor('#d0d5dd').stroke().restore();

  // ── Student photo, centered ───────────────────────────────────────────────
  // Slightly smaller than the original reference to make room for a real
  // Principal Signature image lower on the card.
  const PH_W = 54, PH_H = 58, PH_X = (W - PH_W) / 2, PH_Y = CARD_TOP + HDR_H + 10;
  doc.save().roundedRect(PH_X, PH_Y, PH_W, PH_H, 2).lineWidth(0.8).strokeColor(headerColor).stroke().restore();
  if (canDraw(photoPath)) {
    try { doc.image(photoPath, PH_X + 1, PH_Y + 1, { width: PH_W - 2, height: PH_H - 2 }); }
    catch (e) { drawPhotoPlaceholder(doc, PH_X, PH_Y, PH_W, PH_H, GREY); }
  } else {
    drawPhotoPlaceholder(doc, PH_X, PH_Y, PH_W, PH_H, GREY);
  }

  // ── Inline "Label: Value" rows ────────────────────────────────────────────
  // Value starts right after its own label's measured width, not a fixed
  // shared column — same reasoning as the horizontal layout. Same Student
  // Name wrap-then-shrink treatment too.
  const FX = 12;
  const ROW_H = 9;
  const rowY0 = PH_Y + PH_H + 8;

  doc.font('Helvetica').fontSize(6.4);
  const studentNameLabelV = 'Student Name:';
  const studentNameValueXV = FX + doc.widthOfString(studentNameLabelV) + 3;

  const nameValueV = safe(student.full_name, '—');
  const { lines: studentNameLinesV, fontSize: studentNameSizeV } = splitSchoolName(doc, nameValueV, W - studentNameValueXV - 10, 'Helvetica-Bold', 6.4, 4.8, 2);
  const studentNamePitchV = studentNameSizeV + 1.2;

  doc.font('Helvetica').fontSize(6.4).fillColor(GREY)
    .text(studentNameLabelV, FX, rowY0, { lineBreak: false });
  studentNameLinesV.forEach((line, i) => {
    doc.font('Helvetica-Bold').fontSize(studentNameSizeV).fillColor(TEXT)
      .text(line, studentNameValueXV, rowY0 + i * studentNamePitchV, { width: W - studentNameValueXV - 10, lineBreak: false });
  });

  // Father's Name gets the same 2-line wrap treatment as Student Name — see
  // the matching comment in drawFront for why.
  const restFieldsV = [
    ['GR No.', safe(student.gr_number || student.register_number), false],
    ['Date of Birth', fmtDate(student.dob), false],
    ["Father's Mobile", safe(student.parent_mobile), false],
    ["Father's Name", safe(student.father_name), true],
    ['Standard', formatStandardLabel(student.current_standard || student.admission_standard), false],
  ];
  if (school.id_card_show_address && student.address) {
    restFieldsV.push(['Address', safe(student.address), false]);
  }
  let cursorYV = rowY0 + Math.max(ROW_H, studentNameLinesV.length * studentNamePitchV);
  restFieldsV.forEach(([label, value, wrap]) => {
    const labelTextV = `${label}:`;
    doc.font('Helvetica').fontSize(6.4);
    const valueXV = FX + doc.widthOfString(labelTextV) + 3;
    const availWidthV = W - valueXV - 10;
    doc.fillColor(GREY).text(labelTextV, FX, cursorYV, { lineBreak: false });
    if (wrap) {
      const { lines, fontSize: valueSize } = splitSchoolName(doc, value || '—', availWidthV, 'Helvetica-Bold', 6.4, 4.8, 2);
      const pitch = valueSize + 1.2;
      lines.forEach((line, i) => {
        doc.font('Helvetica-Bold').fontSize(valueSize).fillColor(TEXT)
          .text(line, valueXV, cursorYV + i * pitch, { width: availWidthV, lineBreak: false });
      });
      cursorYV += Math.max(ROW_H, lines.length * pitch);
    } else {
      const { text: valueText, fontSize: valueSize } = fitValueShrink(doc, value || '—', availWidthV, 'Helvetica-Bold', 6.4, 4.8);
      doc.font('Helvetica-Bold').fontSize(valueSize).fillColor(TEXT)
        .text(valueText, valueXV, cursorYV, { width: availWidthV, lineBreak: false });
      cursorYV += ROW_H;
    }
  });

  // ── QR (left) + Principal Signature (right) ────────────────────────────────
  // QR moved down from the header (see above) to sit at the left instead of
  // the top, and the signature moved from centered to the right, so neither
  // ever collides with a long school name or with each other. (Address, when
  // shown, is now just another row above, in restFieldsV.)
  const bandY = cursorYV + 2;

  const qrSz = Math.max(20, Math.min(32, CONTENT_BOTTOM - bandY - 2));
  const qrX = FX, qrY = bandY;
  if (qrBuffer) {
    try { doc.image(qrBuffer, qrX, qrY, { width: qrSz, height: qrSz }); } catch (e) {}
  }

  const sigW = 46, sigH = 11;
  const sigX = W - FX - sigW;
  const sigY = bandY + Math.max(0, (qrSz - sigH) / 2);
  const sigLineY = sigY + sigH;
  if (canDraw(signaturePath)) {
    // Same centering fix as the horizontal layout — otherwise a signature
    // image narrower than sigW sits flush left instead of over the line.
    try { doc.image(signaturePath, sigX, sigY, { width: sigW, height: sigH, fit: [sigW, sigH], align: 'center', valign: 'bottom' }); } catch (e) {}
  }
  doc.font('Helvetica').fontSize(4.8).fillColor(GREY)
    .text(safe(school.idcard_signature_label, 'Principal'), sigX, sigLineY + 1, { width: sigW, align: 'center', lineBreak: false });

  // ── Feature strip ──────────────────────────────────────────────────────────
  // School's own address runs across the top of this band when set — the
  // card's actual footer (distinct from the student's own address field
  // above). See the matching comment in drawFront.
  const featureY = CONTENT_BOTTOM;
  doc.rect(0, featureY, W, FTR_H).fillColor(WHITE).fill();
  const schoolAddressFooterV = buildSchoolAddress(school);
  let iconRowYV = featureY;
  if (schoolAddressFooterV) {
    // Solid header-color band, same as the horizontal layout — see the
    // matching comment in drawFront.
    doc.save().rect(0, featureY, W, schoolAddressRowH).fillColor(headerColor).fill().restore();
    const addrLabelV = 'Address:';
    doc.font('Helvetica').fontSize(5.2).fillColor(WHITE);
    const labelWV = doc.widthOfString(addrLabelV + ' ');
    const addrValueV = fitSingleLine(doc, schoolAddressFooterV, W - 10 - labelWV, 'Helvetica-Bold', 5.2);
    doc.font('Helvetica-Bold').fontSize(5.2);
    const valueWV = doc.widthOfString(addrValueV);
    const groupXV = (W - (labelWV + valueWV)) / 2;
    const addrYV = featureY + (schoolAddressRowH - 5.2) / 2;
    doc.font('Helvetica').fontSize(5.2).fillColor(WHITE).text(addrLabelV, groupXV, addrYV, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(5.2).fillColor(WHITE).text(addrValueV, groupXV + labelWV, addrYV, { width: valueWV + 1, lineBreak: false });
    iconRowYV += schoolAddressRowH;
  }
  const features = showFeatureStrip ? featureIcons.filter(f => f.visible !== false) : [];
  const featureW = W / (features.length || 1);
  features.forEach((feature, index) => {
    const x = index * featureW;
    if (index > 0) {
      doc.save().moveTo(x, iconRowYV + 4).lineTo(x, H - 4).lineWidth(0.3).strokeColor('#e5e7eb').stroke().restore();
    }
    drawFeatureIcon(doc, feature.key, x + featureW / 2, iconRowYV + 7, headerColor);
    if (feature.caption1) {
      doc.font('Helvetica-Bold').fontSize(3.2).fillColor(TEXT)
        .text(feature.caption1, x + 1, iconRowYV + 13, { width: featureW - 2, align: 'center', lineBreak: false });
    }
    if (feature.caption2) {
      doc.font('Helvetica-Bold').fontSize(2.9).fillColor(TEXT)
        .text(feature.caption2, x + 1, iconRowYV + 17, { width: featureW - 2, align: 'center', lineBreak: false });
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

// Shrinks a single-line field value's font size until it fits, only
// falling back to fitSingleLine's "..." truncation if it still doesn't fit
// even at the minimum size (an unrealistically long value with no spaces
// to break on) — same shrink-before-truncate principle as the school/
// student name, just kept to one line since these fields sit in a uniform
// label:value row grid. Returns { text, fontSize } — draw at the returned
// size, not the one passed in.
function fitValueShrink(doc, value, maxWidth, font, fontSize, minFontSize) {
  const original = safe(value, '—');
  doc.font(font);
  const safeWidth = maxWidth - 1;
  let size = fontSize;
  while (size > minFontSize && doc.fontSize(size).widthOfString(original) > safeWidth) {
    size -= 0.2;
  }
  if (doc.fontSize(size).widthOfString(original) <= safeWidth) {
    return { text: original, fontSize: size };
  }
  return { text: fitSingleLine(doc, original, maxWidth, font, size), fontSize: size };
}

// Splits a school name across up to `maxLines` lines at the best word
// boundaries, shrinking the font size (like every shrink-to-fit block in
// certificatePdf.js) until the lines actually fit at that size — a long name
// used to keep the caller's fixed font size and only ever try a 2-line split
// before falling straight to per-line ellipsis truncation (e.g. "JAY GURUDEV
// MADHYA..."), which is exactly the "shows half and ..." complaint this
// fixes: try 3 lines too, at a shrinking size, before ever truncating.
// Returns { lines, fontSize } since the size may have shrunk from what was
// requested — the caller must draw at the returned size, not the one it
// passed in, or the wrapping this computed would no longer be valid.
function splitSchoolName(doc, value, maxWidth, font, fontSize, minFontSize = 6, maxLines = 3) {
  const original = safe(value, 'SCHOOL NAME');
  doc.font(font);

  // Best way to break `words` into exactly `parts` contiguous, non-empty
  // lines, minimizing the widest resulting line. Recursive brute force over
  // every valid position for the first line's break, then the best split of
  // the remainder into the other `parts - 1` lines — school/student names
  // rarely have more than a dozen words, so this stays cheap at any
  // realistic `parts` count (unlike an earlier version of this function
  // that only special-cased parts 1/2/3 and silently fell through to a
  // 3-way split for anything higher, so a 4th line was never actually used).
  const bestSplitInto = (words, parts) => {
    if (parts <= 1) return [words.join(' ')];
    if (words.length < parts) return null;
    let best = null;
    for (let i = 1; i <= words.length - (parts - 1); i += 1) {
      const firstLine = words.slice(0, i).join(' ');
      const restLines = bestSplitInto(words.slice(i), parts - 1);
      if (!restLines) continue;
      const lines = [firstLine, ...restLines];
      const score = Math.max(...lines.map((l) => doc.widthOfString(l)));
      if (!best || score < best.score) best = { lines, score };
    }
    return best ? best.lines : null;
  };

  const words = original.split(/\s+/).filter(Boolean);

  if (words.length < 2) {
    let size = fontSize;
    while (size > minFontSize && doc.fontSize(size).widthOfString(original) > maxWidth) size -= 0.5;
    return { lines: [fitSingleLine(doc, original, maxWidth, font, size)], fontSize: size };
  }

  let size = fontSize;
  while (size > minFontSize) {
    doc.fontSize(size);
    if (doc.widthOfString(original) <= maxWidth) return { lines: [original], fontSize: size };
    for (let parts = 2; parts <= Math.min(maxLines, words.length); parts += 1) {
      const lines = bestSplitInto(words, parts);
      if (lines && lines.every((l) => doc.widthOfString(l) <= maxWidth)) {
        return { lines, fontSize: size };
      }
    }
    size -= 0.5;
  }

  // Even at the minimum size no split into up to `maxLines` lines fits (an
  // unrealistically long single word with no spaces, or a name with more
  // words than `maxLines` can hold even shrunk all the way down) — fall
  // back to per-line ellipsis truncation as a last resort, at the minimum
  // size, on the most-balanced split available.
  doc.fontSize(size);
  const lines = bestSplitInto(words, Math.min(maxLines, words.length)) || [original];
  return {
    lines: lines.map((l) => fitSingleLine(doc, l, maxWidth, font, size)),
    fontSize: size,
  };
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
