import { describe, it, expect } from 'vitest';
import { validateImportRows, normalizeRowKeys } from '../src/lib/importValidation.js';

const good = (n, extra = {}) => ({ invoice_number: `INV-${n}`, customer_name: 'Acme', amount: '1,000', due_date: '15/10/2026', ...extra });

describe('normalizeRowKeys', () => {
  it('maps common export headers to canonical fields', () => {
    const r = normalizeRowKeys({ 'Invoice No.': 'A1', 'Party Name': 'Acme', 'Grand Total': '500', 'Due Date': '01/01/2027', Mobile: '9876543210' });
    expect(r).toMatchObject({ invoice_number: 'A1', customer_name: 'Acme', amount: '500', due_date: '01/01/2027', phone: '9876543210' });
  });
});

describe('validateImportRows', () => {
  it('reports exactly the 10 bad rows in a 200-row file', () => {
    const rows = Array.from({ length: 200 }, (_, i) => good(i));
    const badIdx = [3, 17, 40, 41, 77, 100, 123, 150, 180, 199];
    badIdx.forEach((i, k) => {
      rows[i] = k % 2 ? good(i, { amount: 'abc' }) : good(i, { due_date: '31/02/2026' });
    });
    const { valid, errors, duplicates } = validateImportRows(rows);
    expect(errors.map((e) => e.row)).toEqual(badIdx.map((i) => i + 1));
    expect(valid).toHaveLength(190);
    expect(duplicates).toHaveLength(0);
  });

  it('flags duplicates within the file and against existing invoices', () => {
    const { valid, duplicates } = validateImportRows([good(1), good(1), good(2)], new Set(['inv-2']));
    expect(valid).toHaveLength(1);
    expect(duplicates.map((d) => d.reason)).toEqual(['Duplicate invoice number within file', 'Invoice number already exists']);
  });

  it('parses Indian amounts and day-first dates into canonical output', () => {
    const { valid } = validateImportRows([good(1, { amount: '₹1,50,000', invoice_date: '01/10/2026', phone: '9876543210', currency: '₹' })]);
    expect(valid[0]).toMatchObject({ amount: 150000, due_date: '2026-10-15', invoice_date: '2026-10-01', phone: '+919876543210', currency: 'INR' });
  });

  it('rejects missing fields, bad phones and due dates before the invoice date', () => {
    const { errors } = validateImportRows([
      { customer_name: 'A', amount: 1, due_date: '01/01/2027' },
      { invoice_number: 'X', amount: 1, due_date: '01/01/2027' },
      good(3, { phone: '123' }),
      good(4, { invoice_date: '20/10/2026' }),
    ]);
    expect(errors.map((e) => e.reason)).toEqual([
      'Missing invoice number',
      'Missing customer name',
      'Invalid phone: "123". Use 10 digits or +countrycode',
      'Due date is before the invoice date',
    ]);
  });

  it('keeps line items and tax fields', () => {
    const items = [{ description: 'Widget', quantity: 2, unit_price: 500, amount: 1000 }];
    const { valid } = validateImportRows([good(1, { subtotal: '1000', tax: '180', amount: '1180', line_items: items })]);
    expect(valid[0]).toMatchObject({ subtotal: 1000, tax: 180, amount: 1180, line_items: items });
  });
});
