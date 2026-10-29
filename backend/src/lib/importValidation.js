import { parseAmount, parseDate, normalizePhone, normalizeCurrency } from '../../../shared/parsing.js';
import { FIELD_ALIASES, headerKey } from '../../../shared/fieldAliases.js';

export function normalizeRowKeys(row) {
  const byKey = {};
  for (const [k, v] of Object.entries(row || {})) byKey[headerKey(k)] = v;
  const out = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const hit = aliases.find((a) => byKey[a] !== undefined && byKey[a] !== '');
    out[field] = hit ? byKey[hit] : undefined;
  }
  if (Array.isArray(row?.line_items)) out.line_items = row.line_items;
  return out;
}

const text = (v) => (v === null || v === undefined ? '' : String(v).trim());

// Validates raw rows and splits them into valid / duplicates / errors.
// `existingNumbers` is a Set of lower-cased invoice numbers already in the business.
export function validateImportRows(rows, existingNumbers = new Set(), { today } = {}) {
  const valid = [];
  const duplicates = [];
  const errors = [];
  const seenInFile = new Set();

  rows.forEach((raw, idx) => {
    const rowNum = Number.isInteger(raw?.row) ? raw.row : idx + 1;
    const r = normalizeRowKeys(raw);
    const invoiceNumber = text(r.invoice_number);
    const customerName = text(r.customer_name);
    const amount = parseAmount(r.amount);
    const dueDate = parseDate(r.due_date);
    const invoiceDate = r.invoice_date ? parseDate(r.invoice_date) : today || dueDate;
    const phoneRaw = text(r.phone);
    const phone = phoneRaw ? normalizePhone(phoneRaw) : null;

    const fail = (reason) => errors.push({ row: rowNum, reason, data: raw });

    if (!invoiceNumber) return fail('Missing invoice number');
    if (!customerName) return fail('Missing customer name');
    if (amount === null) return fail(`Invalid amount: "${text(r.amount)}"`);
    if (dueDate === null) return fail(`Invalid or missing due date: "${text(r.due_date)}". Use DD/MM/YYYY`);
    if (r.invoice_date && invoiceDate === null) return fail(`Invalid invoice date: "${text(r.invoice_date)}"`);
    if (invoiceDate && invoiceDate > dueDate) return fail('Due date is before the invoice date');
    if (phoneRaw && !phone) return fail(`Invalid phone: "${phoneRaw}". Use 10 digits or +countrycode`);

    // Optional: amount already received and a promised payment date
    const paidRaw = text(r.paid_amount);
    const isZero = /^(?:₹|rs\.?|inr|\$)?\s*0+(?:\.0+)?$/i.test(paidRaw);
    const paid = paidRaw && !isZero ? parseAmount(paidRaw) : 0;
    if (paid === null) return fail(`Invalid paid amount: "${paidRaw}"`);
    if (paid > amount) return fail('Amount paid is more than the invoice total');
    const promiseRaw = text(r.promise_date);
    const promiseDate = promiseRaw ? parseDate(promiseRaw) : null;
    if (promiseRaw && !promiseDate) return fail(`Invalid promise date: "${promiseRaw}"`);
    if (promiseDate && invoiceDate && promiseDate < invoiceDate) return fail('Promise date is before the invoice date');

    const lower = invoiceNumber.toLowerCase();
    if (seenInFile.has(lower)) {
      duplicates.push({ row: rowNum, reason: 'Duplicate invoice number within file', data: raw });
      return;
    }
    seenInFile.add(lower);
    if (existingNumbers.has(lower)) {
      duplicates.push({ row: rowNum, reason: 'Invoice number already exists', data: raw });
      return;
    }

    valid.push({
      row: rowNum,
      name: customerName,
      phone,
      email: text(r.email) || null,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      due_date: dueDate,
      amount,
      subtotal: parseAmount(r.subtotal),
      tax: r.tax === 0 || r.tax === '0' ? 0 : parseAmount(r.tax),
      currency: normalizeCurrency(r.currency),
      vendor_name: text(r.vendor_name) || null,
      line_items: Array.isArray(r.line_items) ? r.line_items.slice(0, 500) : [],
      paid_amount: paid,
      // A promise only makes sense while something is still owed
      promise_date: paid < amount ? promiseDate : null,
    });
  });

  return { valid, duplicates, errors };
}
