import { describe, it, expect } from 'vitest';
import { extractInvoiceFromText, findAmounts, findDate } from '../extract/textExtractor.js';
import { makeDraft, validateDraft } from '../extract/draft.js';

const GST_INVOICE = `
Sharma Textiles Pvt Ltd
12, MG Road, Bengaluru 560001
GSTIN: 29ABCDE1234F1Z5

TAX INVOICE
Invoice No: ST/2026/0457          Invoice Date: 03/04/2026
Due Date: 03/05/2026

Bill To:
M/s Kumar Traders
45 Market Street, Chennai
Phone: 98765 43210
Email: accounts@kumartraders.in

Sr  Description              Qty   Rate       Amount
1   Cotton fabric (roll)     10    4,500.00   45,000.00
2   Silk thread box          5     1,200.00   6,000.00

Sub Total                                     51,000.00
CGST @ 9%                                      4,590.00
SGST @ 9%                                      4,590.00
Grand Total                               ₹ 60,180.00
`;

const US_INVOICE = `
Acme Design Studio LLC
INVOICE
Invoice #: INV-1042
Date: Oct 15, 2026
Payment terms: Net 30

Billed To: Globex Corporation
billing@globex.com

Description                     Hours    Rate      Amount
Website redesign                  40     $120.00   $4,800.00
Hosting setup                      1     $250.00     $250.00

Subtotal                                          $5,050.00
Sales Tax (8%)                                      $404.00
Amount Due                                        $5,454.00
`;

describe('findDate / findAmounts', () => {
  it('finds day-first and month-name dates', () => {
    expect(findDate('Invoice Date: 03/04/2026')).toBe('2026-04-03');
    expect(findDate('Dated 15th Oct 2026')).toBe('2026-10-15');
    expect(findDate('Oct 15, 2026')).toBe('2026-10-15');
  });

  it('ignores percentages and dates when finding amounts', () => {
    expect(findAmounts('CGST @ 9%   4,590.00')).toEqual([4590]);
    expect(findAmounts('Total on 03/04/2026  ₹ 1,50,000.00')).toEqual([150000]);
  });
});

describe('extractInvoiceFromText: Indian GST invoice', () => {
  const f = extractInvoiceFromText(GST_INVOICE);

  it('extracts identity, parties and dates', () => {
    expect(f.invoice_number).toBe('ST/2026/0457');
    expect(f.invoice_date).toBe('2026-04-03');
    expect(f.due_date).toBe('2026-05-03');
    expect(f.customer_name).toBe('Kumar Traders');
    expect(f.vendor_name).toBe('Sharma Textiles Pvt Ltd');
    expect(f.phone).toBe('+919876543210');
    expect(f.email).toBe('accounts@kumartraders.in');
  });

  it('extracts totals, sums CGST + SGST, and detects INR', () => {
    expect(f.subtotal).toBe(51000);
    expect(f.tax).toBe(9180);
    expect(f.amount).toBe(60180);
    expect(f.currency).toBe('INR');
  });

  it('extracts line items', () => {
    expect(f.line_items).toEqual([
      { description: 'Cotton fabric (roll)', quantity: 10, unit_price: 4500, amount: 45000 },
      { description: 'Silk thread box', quantity: 5, unit_price: 1200, amount: 6000 },
    ]);
  });

  it('produces a draft with no validation errors or warnings', () => {
    const d = makeDraft(f, { fileName: 'a.pdf' });
    expect(validateDraft(d)).toEqual({});
    expect(d.warnings).toEqual([]);
    expect(d.confidence).toBe(1);
  });
});

describe('extractInvoiceFromText: US invoice with payment terms', () => {
  const f = extractInvoiceFromText(US_INVOICE);

  it('extracts the main fields', () => {
    expect(f).toMatchObject({
      invoice_number: 'INV-1042',
      invoice_date: '2026-10-15',
      customer_name: 'Globex Corporation',
      email: 'billing@globex.com',
      subtotal: 5050,
      tax: 404,
      amount: 5454,
      currency: 'USD',
      terms_days: 30,
    });
    expect(f.line_items).toHaveLength(2);
    expect(f.line_items[0]).toMatchObject({ description: 'Website redesign', quantity: 40, unit_price: 120, amount: 4800 });
  });

  it('computes the due date from Net 30 terms', () => {
    const d = makeDraft(f, {});
    expect(d.due_date).toBe('2026-11-14');
    expect(d.warnings[0]).toMatch(/Net 30/);
  });
});

// Layout seen in real GST invoices: two-column billed/shipped block, items spanning two
// lines (name + qty, then serial/HSN/rate/amount), detail lines, and a round-off.
const TWO_LINE_ITEMS = `
ORBIT TRADING CO   TAX INVOICE
Invoice No:   OTC/26-27/0101
Invoice Date:   02 Nov 2026
BILLED TO (CUSTOMER)   SHIPPED TO (CONSIGNEE)
Lakeview Fabricators Pvt. Ltd.   Lakeview Plant 3
#   Item Description   HSN/SAC   Qty
Steel Hinges 4in   10
1   830210   150.00   1,500.00
Model: H-4, Zinc plated   Pcs
Gear Box Assembly   2
2   848340   7,250.00   14,500.00
Amount in Words:   Indian Rupees Nineteen Thousand Only
Subtotal (Taxable):   ₹ 16,000.00
CGST (9%):   ₹ 1,440.00
SGST (9%):   ₹ 1,440.00
Round Off:   + ₹ 120.00
Grand Total:   ₹ 19,000.00
1. Payment is due within 15 days from the invoice date (Net 15).
`;

describe('extractInvoiceFromText: two-line items and billed/shipped columns', () => {
  const f = extractInvoiceFromText(TWO_LINE_ITEMS);

  it('takes the customer from the line under "BILLED TO (CUSTOMER)"', () => {
    expect(f.customer_name).toBe('Lakeview Fabricators Pvt. Ltd.');
  });

  it('joins item names, quantities and rates that span two lines', () => {
    expect(f.line_items).toEqual([
      { description: 'Steel Hinges 4in · Model: H-4, Zinc plated', quantity: 10, unit_price: 150, amount: 1500 },
      { description: 'Gear Box Assembly', quantity: 2, unit_price: 7250, amount: 14500 },
    ]);
  });

  it('counts the round-off when checking totals', () => {
    expect(f.round_off).toBe(120);
    const d = makeDraft(f, {});
    expect(d).toMatchObject({ subtotal: 16000, tax: 2880, amount: 19000, due_date: '2026-11-17' });
    expect(d.warnings).toEqual(['Due date calculated from payment terms (Net 15).']);
  });
});

describe('makeDraft / validateDraft', () => {
  it('falls back to subtotal + tax and flags inconsistent totals', () => {
    expect(makeDraft({ subtotal: '100', tax: '18' }, {}).amount).toBe(118);
    expect(makeDraft({ subtotal: '100', tax: '18', amount: '200' }, {}).warnings.join(' ')).toMatch(/doesn’t equal/);
  });

  it('reports missing and invalid fields inline', () => {
    const d = makeDraft({ invoice_number: 'X', amount: '0', phone: '123' }, {});
    expect(validateDraft(d)).toEqual({ customer_name: 'Required', amount: 'Enter a total above 0', due_date: 'Required', phone: '10 digits or +countrycode' });
  });

  it('flags an unreadable due date instead of silently replacing it', () => {
    const d = makeDraft({ invoice_number: 'A', customer_name: 'B', amount: 1, invoice_date: '01/02/2026', due_date: '31/02/2026' }, {});
    expect(d.due_date).toBe('');
    expect(d.warnings[0]).toMatch(/Couldn’t read the due date “31\/02\/2026”/);
  });

  it('handles OCR noise without throwing', () => {
    const f = extractInvoiceFromText('lnvoice No : 0O12\n\n%%%%\nT0tal 1,000');
    expect(f).toBeTypeOf('object');
    expect(extractInvoiceFromText('')).toMatchObject({ warnings: ['No readable text was found in this file.'] });
  });
});
