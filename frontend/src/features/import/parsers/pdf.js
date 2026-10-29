import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { extractInvoiceFromText } from '../extract/textExtractor.js';
import { recognize } from './ocr.js';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_OCR_PAGES = 10;

// Rebuilds reading-order lines from positioned text items (same baseline => same line).
export function itemsToLines(items) {
  const rows = [];
  for (const it of items) {
    if (!it.str?.trim()) continue;
    const [x, y] = [it.transform[4], it.transform[5]];
    let row = rows.find((r) => Math.abs(r.y - y) <= Math.max(2, (it.height || 10) * 0.4));
    if (!row) rows.push((row = { y, parts: [] }));
    row.parts.push({ x, str: it.str, w: it.width || 0 });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) => {
      r.parts.sort((a, b) => a.x - b.x);
      let line = '';
      let end = null;
      for (const p of r.parts) {
        // A wide horizontal gap means a new column: keep it visible as double space
        if (end !== null) line += p.x - end > 12 ? '   ' : p.x - end > 1 ? ' ' : '';
        line += p.str;
        end = p.x + p.w;
      }
      return line.trim();
    })
    .join('\n');
}

function friendlyPdfError(err) {
  if (err?.name === 'PasswordException') return new Error('This PDF is password-protected. Remove the password and try again.');
  if (err?.name === 'InvalidPDFException') return new Error('This PDF is damaged or not a valid PDF file.');
  return err;
}

export async function parse(file, { onProgress = () => {} } = {}) {
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    await task.destroy();
    throw friendlyPdfError(err);
  }

  try {
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      pages.push(itemsToLines((await page.getTextContent()).items));
      onProgress({ stage: 'Reading text', progress: (i / doc.numPages) * 0.3 });
    }

    const text = pages.join('\n');
    // Scanned PDFs have (almost) no text layer: render pages and OCR them
    if (text.replace(/\s/g, '').length >= 40 * Math.min(doc.numPages, 3)) {
      return [{ fields: extractInvoiceFromText(text), method: 'text' }];
    }

    const count = Math.min(doc.numPages, MAX_OCR_PAGES);
    const ocrText = [];
    for (let i = 1; i <= count; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
      ocrText.push(await recognize(canvas, (p) => onProgress({ stage: `Recognizing text (page ${i} of ${count})`, progress: 0.3 + ((i - 1 + p) / count) * 0.7 })));
      page.cleanup();
    }
    const fields = extractInvoiceFromText(ocrText.join('\n'));
    if (doc.numPages > MAX_OCR_PAGES) fields.warnings.push(`Only the first ${MAX_OCR_PAGES} pages were scanned.`);
    fields.warnings.push('Read from a scanned document using OCR. Please double-check the values.');
    return [{ fields, method: 'ocr' }];
  } finally {
    await task.destroy();
  }
}
