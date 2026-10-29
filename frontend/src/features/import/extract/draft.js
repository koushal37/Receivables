import { parseAmount, parseDate, normalizePhone, normalizeCurrency } from '@shared/parsing.js';

let seq = 0;
const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
const money = (v) => (v === '' || v === null || v === undefined ? '' : (v === 0 || v === '0' ? 0 : parseAmount(v) ?? ''));

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => ({
      description: text(it.description ?? it.name ?? it.item ?? it.particulars),
      quantity: it.quantity === undefined || it.quantity === '' ? '' : Number(String(it.quantity).replace(/,/g, '')) || '',
      unit_price: money(it.unit_price ?? it.rate ?? it.price),
      amount: money(it.amount ?? it.total ?? it.line_total),
    }))
    .filter((it) => it.description || it.amount !== '');
}

// Normalizes raw extracted fields into an editable draft and records warnings.
export function makeDraft(raw, source) {
  const warnings = [...(raw.warnings || [])];
  const draft = {
    key: `d${++seq}`,
    include: true,
    source,
    invoice_number: text(raw.invoice_number),
    invoice_date: parseDate(raw.invoice_date) || '',
    due_date: parseDate(raw.due_date) || '',
    customer_name: text(raw.customer_name),
    phone: text(raw.phone),
    email: text(raw.email),
    vendor_name: text(raw.vendor_name),
    currency: normalizeCurrency(raw.currency),
    subtotal: money(raw.subtotal),
    tax: money(raw.tax),
    amount: money(raw.amount),
    line_items: normalizeItems(raw.line_items),
    paid_amount: money(raw.paid_amount),
    promise_date: parseDate(raw.promise_date) || '',
    warnings,
    serverError: null,
  };

  if (draft.amount === '' && draft.subtotal !== '') {
    draft.amount = Math.round(((draft.subtotal || 0) + (draft.tax || 0)) * 100) / 100;
    warnings.push('Total not found; calculated from subtotal + tax.');
  }
  if (draft.amount === '' && draft.line_items.length) {
    const sum = draft.line_items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
    if (sum > 0) {
      draft.amount = Math.round(sum * 100) / 100;
      warnings.push('Total not found; calculated from line items.');
    }
  }
  if (!draft.due_date && raw.terms_days && draft.invoice_date) {
    draft.due_date = addDays(draft.invoice_date, raw.terms_days);
    warnings.push(`Due date calculated from payment terms (Net ${raw.terms_days}).`);
  }
  const unreadableDue = !draft.due_date && text(raw.due_date);
  if (unreadableDue) warnings.push(`Couldn’t read the due date “${unreadableDue}”. Please enter it.`);
  if (!draft.due_date && draft.invoice_date && !unreadableDue) {
    draft.due_date = draft.invoice_date;
    warnings.push('No due date found; set to the invoice date. Please check.');
  }
  const roundOff = Number(raw.round_off) || 0;
  if (draft.subtotal !== '' && draft.tax !== '' && draft.amount !== '' && Math.abs(draft.subtotal + draft.tax + roundOff - draft.amount) > 1) {
    warnings.push('Subtotal + tax doesn’t equal the total. Please check the amounts.');
  }
  draft.confidence = confidenceOf(draft);
  return draft;
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

function confidenceOf(d) {
  const keys = ['invoice_number', 'customer_name', 'amount', 'due_date', 'invoice_date'];
  return keys.filter((k) => d[k] !== '' && d[k] !== null).length / keys.length;
}

// A blank draft for typing an invoice in by hand.
export function emptyDraft() {
  return makeDraft({}, { fileName: 'Manual entry', format: 'manual', method: 'manual' });
}

// Draft for editing a saved invoice (GET /api/invoices/:id).
export function invoiceToDraft(inv) {
  const d = makeDraft({
    invoice_number: inv.invoice_number,
    invoice_date: inv.invoice_date,
    due_date: inv.due_date,
    customer_name: inv.customers?.name ?? inv.customer_name,
    phone: inv.customers?.phone ?? inv.customer_phone,
    email: inv.customers?.email ?? inv.customer_email,
    vendor_name: inv.vendor_name,
    currency: inv.currency_code,
    subtotal: inv.subtotal ?? '',
    tax: inv.tax_amount ?? '',
    amount: inv.original_amount ?? inv.amount,
    line_items: inv.line_items,
  }, { fileName: 'Saved invoice', format: 'saved', method: 'saved' });
  d.warnings = []; // the record already exists; extraction warnings don't apply
  d.id = inv.id;
  d.total_paid = Number(inv.total_paid) || 0;
  return d;
}

// Numeric value of an amount field that may hold user-typed text like "1,50,000".
export const amountOf = (v) => (typeof v === 'number' ? v : parseAmount(v) ?? 0);

// Inline validation mirrored from the server rules. Returns { field: message }.
export function validateDraft(d) {
  const errors = {};
  if (!text(d.invoice_number)) errors.invoice_number = 'Required';
  if (!text(d.customer_name)) errors.customer_name = 'Required';
  if (!(amountOf(d.amount) > 0)) errors.amount = 'Enter a total above 0';
  if (!d.due_date) errors.due_date = 'Required';
  if (d.invoice_date && d.due_date && d.invoice_date > d.due_date) errors.due_date = 'Before invoice date';
  if (text(d.phone) && !normalizePhone(d.phone)) errors.phone = '10 digits or +countrycode';
  if (text(d.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(d.email))) errors.email = 'Invalid email';
  if (text(d.paid_amount) && text(d.paid_amount) !== '0' && parseAmount(d.paid_amount) === null) errors.paid_amount = 'Enter a valid amount';
  else if (amountOf(d.paid_amount) > amountOf(d.amount)) errors.paid_amount = 'More than the total';
  if (d.promise_date && d.invoice_date && d.promise_date < d.invoice_date) errors.promise_date = 'Before invoice date';
  if (d.total_paid && amountOf(d.amount) < d.total_paid) errors.amount = `Can’t be below the ${d.total_paid} already paid`;
  return errors;
}

// Shape sent to /api/import/*
export function draftToRow(d, row) {
  return {
    row,
    invoice_number: text(d.invoice_number),
    customer_name: text(d.customer_name),
    phone: text(d.phone),
    email: text(d.email),
    amount: d.amount,
    subtotal: d.subtotal,
    tax: d.tax,
    invoice_date: d.invoice_date,
    due_date: d.due_date,
    currency: d.currency,
    vendor_name: text(d.vendor_name),
    line_items: d.line_items.filter((it) => it.description || it.amount !== ''),
    paid_amount: d.paid_amount,
    promise_date: d.promise_date,
  };
}

// Shape sent to PATCH /api/invoices/:id
export function draftToPatch(d) {
  const body = draftToRow(d, 0);
  for (const key of ['row', 'paid_amount', 'promise_date']) delete body[key];
  return body;
}
