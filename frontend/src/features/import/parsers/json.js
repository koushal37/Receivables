import { mapRecord, recordsFromJson } from '../extract/structured.js';

export function parseJsonText(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This JSON file isn’t valid JSON.');
  }
  const records = recordsFromJson(data);
  if (!records.length) throw new Error('No invoices were found in this JSON file.');
  return records.map((r) => ({ fields: mapRecord(r), method: 'structured' }));
}

export async function parse(file) {
  return parseJsonText(await file.text());
}
