import { PARSERS } from './parsers/index.js';
import { validateFile, sniffMismatch } from './fileTypes.js';
import { makeDraft } from './extract/draft.js';

// Turns one File into invoice drafts. onProgress({ stage, progress }) with progress in 0..1.
export async function processFile(file, onProgress = () => {}) {
  const { format, error } = validateFile(file);
  if (error) throw new Error(error);
  const mismatch = await sniffMismatch(file, format);
  if (mismatch) throw new Error(mismatch);

  onProgress({ stage: 'Loading reader', progress: 0.02 });
  const parser = await PARSERS[format]();
  const results = await parser.parse(file, { onProgress });

  const drafts = results
    .map(({ fields, method }, i) => makeDraft(fields, { fileName: file.name, format, method, index: results.length > 1 ? i + 1 : null }))
    .filter((d) => d.invoice_number || d.customer_name || d.amount !== '');

  if (!drafts.length) throw new Error('We couldn’t find any invoice details in this file.');
  onProgress({ stage: 'Done', progress: 1 });
  return drafts;
}
