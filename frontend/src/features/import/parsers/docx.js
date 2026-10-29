import { extractInvoiceFromText } from '../extract/textExtractor.js';

export async function parse(file, { onProgress = () => {} } = {}) {
  onProgress({ stage: 'Reading document', progress: 0.3 });
  const mammoth = await import('mammoth');
  let value;
  try {
    ({ value } = await (mammoth.extractRawText || mammoth.default.extractRawText)({ arrayBuffer: await file.arrayBuffer() }));
  } catch {
    throw new Error('This Word document is damaged or not a .docx file.');
  }
  return [{ fields: extractInvoiceFromText(value), method: 'text' }];
}
