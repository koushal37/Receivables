import * as XLSX from 'xlsx';
import { mapRecord, looksTabular } from '../extract/structured.js';
import { extractInvoiceFromText } from '../extract/textExtractor.js';

export const MAX_ROWS = 5000;

// Plain-text rendering of a sheet: cells joined by wide gaps, one row per line.
function sheetToText(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: false })
    .map((cells) => cells.map((c) => String(c).trim()).filter(Boolean).join('   '))
    .filter(Boolean)
    .join('\n');
}

// Accepts an ArrayBuffer so it can be unit-tested without a File.
// CSV cells are kept as raw strings: SheetJS would otherwise read 01/04/2026 as US month-first.
export function parseWorkbook(buffer, { csv = false } = {}) {
  let wb;
  try {
    wb = XLSX.read(buffer, { type: 'array', cellDates: true, dense: true, raw: csv });
  } catch {
    throw new Error('This spreadsheet is damaged or password-protected and can’t be read.');
  }

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
    if (!rows.length) continue;

    if (looksTabular(Object.keys(rows[0]))) {
      if (rows.length > MAX_ROWS) throw new Error(`This sheet has ${rows.length} rows. Import at most ${MAX_ROWS} at a time.`);
      return rows
        .filter((r) => Object.values(r).some((v) => v !== '' && v !== null))
        .map((r) => ({ fields: mapRecord(r), method: 'structured' }));
    }

    // A single invoice laid out as a document inside a sheet
    return [{ fields: extractInvoiceFromText(sheetToText(sheet)), method: 'text' }];
  }
  throw new Error('This spreadsheet has no data.');
}

export async function parse(file, { onProgress = () => {} } = {}) {
  onProgress({ stage: 'Reading spreadsheet', progress: 0.3 });
  return parseWorkbook(await file.arrayBuffer(), { csv: /\.csv$/i.test(file.name) || file.type.includes('csv') });
}
