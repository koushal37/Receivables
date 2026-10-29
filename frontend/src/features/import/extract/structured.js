import { fieldForHeader, headerKey } from '@shared/fieldAliases.js';

const LINE_ITEM_KEYS = ['line_items', 'lineitems', 'items', 'lines', 'invoice_lines', 'invoicelines', 'products', 'details'];
const NESTED_PARTY = {
  customer: 'customer_name', buyer: 'customer_name', bill_to: 'customer_name', billto: 'customer_name', client: 'customer_name',
  vendor: 'vendor_name', seller: 'vendor_name', supplier: 'vendor_name', from: 'vendor_name',
};

// Maps one record (spreadsheet row or JSON object) onto invoice fields.
export function mapRecord(record) {
  const out = {};
  for (const [key, value] of Object.entries(record || {})) {
    if (value === null || value === undefined || value === '') continue;
    const hk = headerKey(key);

    if (LINE_ITEM_KEYS.includes(hk) && Array.isArray(value)) {
      out.line_items = value;
      continue;
    }
    if (NESTED_PARTY[hk] && typeof value === 'object' && !Array.isArray(value)) {
      const target = NESTED_PARTY[hk];
      out[target] ??= value.name ?? value.company ?? value.legal_name ?? value.registration_name;
      if (target === 'customer_name') {
        out.phone ??= value.phone ?? value.mobile ?? value.telephone;
        out.email ??= value.email;
      }
      continue;
    }
    if (NESTED_PARTY[hk] && typeof value === 'string') {
      out[NESTED_PARTY[hk]] ??= value;
      continue;
    }
    if (typeof value === 'object' && !(value instanceof Date)) {
      // e.g. { totals: { grand_total, tax } }
      if (!Array.isArray(value)) Object.assign(out, Object.fromEntries(Object.entries(mapRecord(value)).filter(([k]) => out[k] === undefined)));
      continue;
    }
    const field = fieldForHeader(key);
    if (field && out[field] === undefined) out[field] = value;
  }
  return out;
}

// True when a set of headers looks like a one-invoice-per-row export.
export function looksTabular(headers) {
  const fields = new Set(headers.map(fieldForHeader).filter(Boolean));
  const core = ['invoice_number', 'customer_name', 'amount', 'due_date', 'invoice_date'].filter((f) => fields.has(f));
  return core.length >= 2 && (fields.has('invoice_number') || fields.has('amount'));
}

// JSON can be an array, { invoices: [...] }, { data: [...] } or a single invoice object.
export function recordsFromJson(data) {
  if (Array.isArray(data)) return data.filter((r) => r && typeof r === 'object');
  if (data && typeof data === 'object') {
    // An object that is itself an invoice keeps its `items` as line items
    const self = mapRecord(data);
    if (self.invoice_number && (self.customer_name || self.amount)) return [data];
    for (const key of ['invoices', 'data', 'records', 'results', 'items']) {
      const list = data[key];
      if (Array.isArray(list) && list.length && list.every((r) => r && typeof r === 'object' && !Array.isArray(r))) {
        const sample = mapRecord(list[0]);
        if (sample.invoice_number || (sample.customer_name && sample.amount)) return list;
      }
    }
    return [data];
  }
  return [];
}
