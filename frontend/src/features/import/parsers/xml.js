import { parseInvoiceXml } from '../extract/einvoice.js';

export function parseXmlText(text) {
  const { kind, records } = parseInvoiceXml(text);
  return records.map((fields) => ({ fields: { ...fields, warnings: kind === 'generic' ? ['Unknown XML layout; fields were matched by tag name.'] : [] }, method: 'structured' }));
}

export async function parse(file) {
  return parseXmlText(await file.text());
}
