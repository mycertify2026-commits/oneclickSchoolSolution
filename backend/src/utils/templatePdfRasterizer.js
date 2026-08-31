// Rasterizes page 1 of an uploaded PDF template into a PNG buffer, so it can
// be (a) OCR'd by Tesseract.js and (b) drawn by pdfkit as a page background,
// exactly like a directly-uploaded PNG/JPEG template would be. Validated via
// a standalone spike before this was wired into the feature — pdfjs-dist's
// Node "legacy" build needs an explicit canvasFactory (its default tries to
// require the native `canvas` package, which isn't installed) and an
// explicit standardFontDataUrl (without it every glyph silently fails to
// render, producing a blank page with only images/borders).
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');

class NapiCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }
  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

const STANDARD_FONT_DATA_URL = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + path.sep;

// DPI target for the rasterized background — high enough for OCR accuracy
// and a crisp printed certificate, matching pdfkit's 72pt/inch page space.
const TARGET_DPI = 200;

/**
 * @param {Buffer} pdfBuffer
 * @returns {Promise<{ pngBuffer: Buffer, pageWidthPt: number, pageHeightPt: number, pageCount: number }>}
 */
async function rasterizePdfFirstPage(pdfBuffer) {
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  const canvasFactory = new NapiCanvasFactory();

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    canvasFactory,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    disableFontFace: true,
  });
  const pdfDoc = await loadingTask.promise;
  const page = await pdfDoc.getPage(1);

  const basePt = page.getViewport({ scale: 1 }); // page size in pdfkit's own point space
  const scale = TARGET_DPI / 72;
  const viewport = page.getViewport({ scale });

  const { canvas, context } = canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvasContext: context, viewport, canvasFactory }).promise;

  return {
    pngBuffer: canvas.toBuffer('image/png'),
    pageWidthPt: basePt.width,
    pageHeightPt: basePt.height,
    pageCount: pdfDoc.numPages,
  };
}

module.exports = { rasterizePdfFirstPage };
