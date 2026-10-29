// Supported formats, keyed by the parser that handles them.
export const FORMATS = {
  pdf: { label: 'PDF', extensions: ['pdf'], mimes: ['application/pdf'], icon: 'file' },
  image: { label: 'Image', extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'], mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'], icon: 'image' },
  spreadsheet: {
    label: 'Spreadsheet',
    extensions: ['xlsx', 'xls', 'csv'],
    mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv', 'application/csv'],
    icon: 'table',
  },
  docx: { label: 'Word', extensions: ['docx'], mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], icon: 'file' },
  json: { label: 'JSON', extensions: ['json'], mimes: ['application/json'], icon: 'code' },
  xml: { label: 'XML / e-invoice', extensions: ['xml'], mimes: ['application/xml', 'text/xml'], icon: 'code' },
};

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_FILES = 25;
export const ACCEPT = Object.values(FORMATS).flatMap((f) => f.extensions.map((e) => `.${e}`)).join(',');

export function extensionOf(name = '') {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

export function detectFormat(file) {
  const ext = extensionOf(file.name);
  for (const [key, f] of Object.entries(FORMATS)) if (f.extensions.includes(ext)) return key;
  for (const [key, f] of Object.entries(FORMATS)) if (file.type && f.mimes.includes(file.type)) return key;
  return null;
}

// Returns { format } or { error } with a friendly message.
export function validateFile(file) {
  const format = detectFormat(file);
  if (!format) {
    const ext = extensionOf(file.name);
    return { error: `${ext ? `.${ext} files aren’t` : 'This file type isn’t'} supported. Use PDF, JPG, PNG, WEBP, HEIC, XLSX, XLS, CSV, DOCX, JSON or XML.` };
  }
  if (file.size === 0) return { error: 'This file is empty.' };
  if (file.size > MAX_FILE_BYTES) return { error: `This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_FILE_BYTES / 1024 / 1024} MB.` };
  return { format };
}

// Checks the first bytes so a renamed or truncated file fails with a clear message.
export async function sniffMismatch(file, format) {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const starts = (...bytes) => bytes.every((b, i) => head[i] === b);
  const ext = extensionOf(file.name);
  if (format === 'pdf' && !starts(0x25, 0x50, 0x44, 0x46)) return 'This doesn’t look like a valid PDF. It may be damaged or renamed.';
  if ((format === 'docx' || ext === 'xlsx') && !starts(0x50, 0x4b)) return `This doesn’t look like a valid .${ext} file. It may be damaged or renamed.`;
  if (format === 'image' && ext === 'png' && !starts(0x89, 0x50, 0x4e, 0x47)) return 'This doesn’t look like a valid PNG image.';
  if (format === 'image' && ['jpg', 'jpeg'].includes(ext) && !starts(0xff, 0xd8)) return 'This doesn’t look like a valid JPEG image.';
  return null;
}
