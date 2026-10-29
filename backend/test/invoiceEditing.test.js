import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createFakeSupabase } from './helpers/fakeSupabase.js';
import { validateImportRows } from '../src/lib/importValidation.js';

const BIZ_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BIZ_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INV_A = '11111111-1111-4111-8111-111111111111';
const INV_A2 = '33333333-3333-4333-8333-333333333333';
const INV_B = '22222222-2222-4222-8222-222222222222';

let fake;
vi.mock('../src/supabase.js', () => ({
  get supabase() { return fake; },
}));
const { app } = await import('../src/app.js');

beforeEach(() => {
  fake = createFakeSupabase({
    business_memberships: [
      { user_id: 'owner-a', business_id: BIZ_A, role: 'owner', status: 'active' },
      { user_id: 'emp-a', business_id: BIZ_A, role: 'employee', status: 'active' },
      { user_id: 'ro-a', business_id: BIZ_A, role: 'read_only', status: 'active' },
    ],
    customers: [
      { id: 'cust-a', business_id: BIZ_A, name: 'Acme', phone: null, email: null },
      { id: 'cust-b', business_id: BIZ_B, name: 'Other', phone: null, email: null },
    ],
    invoices: [
      { id: INV_A, business_id: BIZ_A, customer_id: 'cust-a', invoice_number: 'A-1', invoice_date: '2026-10-01', due_date: '2026-10-31', original_amount: 1000, currency_code: 'INR', record_status: 'active', customers: { id: 'cust-a', name: 'Acme', phone: null, email: null } },
      { id: INV_A2, business_id: BIZ_A, customer_id: 'cust-a', invoice_number: 'A-2', invoice_date: '2026-10-01', due_date: '2026-10-31', original_amount: 500, record_status: 'active', customers: { id: 'cust-a', name: 'Acme' } },
      { id: INV_B, business_id: BIZ_B, customer_id: 'cust-b', invoice_number: 'B-1', invoice_date: '2026-10-01', due_date: '2026-10-31', original_amount: 900, record_status: 'active' },
    ],
    invoice_ledger_view: [
      { id: INV_A, business_id: BIZ_A, total_paid: 400, outstanding_balance: 600 },
      { id: INV_A2, business_id: BIZ_A, total_paid: 0, outstanding_balance: 500 },
    ],
  });
  for (const id of ['owner-a', 'emp-a', 'ro-a']) fake.users.set(`tok-${id}`, { id });
});

const as = (user) => ({ Authorization: `Bearer tok-${user}` });
const invoice = (id) => fake.tables.invoices.find((i) => i.id === id);

describe('PATCH /api/invoices/:id (edit an invoice)', () => {
  it('lets an employee correct dates, total, currency and customer contact details', async () => {
    const res = await request(app).patch(`/api/invoices/${INV_A}`).set(as('emp-a')).send({
      invoice_date: '05/10/2026', due_date: '2026-11-15', amount: '1,200', currency: 'usd',
      customer_name: 'Acme Corp', phone: '98765 43210', email: 'ap@acme.in',
    });
    expect(res.status).toBe(200);
    expect(invoice(INV_A)).toMatchObject({ invoice_date: '2026-10-05', due_date: '2026-11-15', original_amount: 1200, currency_code: 'USD' });
    expect(fake.tables.customers.find((c) => c.id === 'cust-a')).toMatchObject({ name: 'Acme Corp', phone: '+919876543210', email: 'ap@acme.in' });
    expect(fake.tables.audit_logs.at(-1)).toMatchObject({ action: 'INVOICE_EDITED', entity_id: INV_A });
  });

  it('rejects a total below what has already been paid', async () => {
    const res = await request(app).patch(`/api/invoices/${INV_A}`).set(as('emp-a')).send({ amount: 300 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already paid/);
    expect(invoice(INV_A).original_amount).toBe(1000);
  });

  it('rejects a due date before the invoice date, and invalid dates', async () => {
    expect((await request(app).patch(`/api/invoices/${INV_A}`).set(as('emp-a')).send({ due_date: '2026-09-01' })).status).toBe(400);
    expect((await request(app).patch(`/api/invoices/${INV_A}`).set(as('emp-a')).send({ due_date: '31/02/2026' })).status).toBe(400);
  });

  it('keeps invoice numbers unique within the business', async () => {
    const res = await request(app).patch(`/api/invoices/${INV_A}`).set(as('emp-a')).send({ invoice_number: 'a-2' });
    expect(res.status).toBe(409);
    expect((await request(app).patch(`/api/invoices/${INV_A}`).set(as('emp-a')).send({ invoice_number: 'A-1-REV' })).status).toBe(200);
  });

  it('blocks read-only users and other businesses', async () => {
    expect((await request(app).patch(`/api/invoices/${INV_A}`).set(as('ro-a')).send({ amount: 5 })).status).toBe(403);
    expect((await request(app).patch(`/api/invoices/${INV_B}`).set(as('owner-a')).send({ amount: 5 })).status).toBe(404);
    expect(invoice(INV_B).original_amount).toBe(900);
  });
});

describe('Adding invoices with a paid amount and promise date', () => {
  it('records the payment and the promise after committing', async () => {
    const res = await request(app).post('/api/import/commit').set(as('emp-a')).send({
      rows: [{ invoice_number: 'N-1', customer_name: 'Acme', amount: '1,000', due_date: '01/12/2099', paid_amount: '250', promise_date: '15/12/2099' }],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ count: 1, payments: 1, promises: 1, warnings: [] });
    const pay = fake.rpcCalls.find((c) => c.name === 'record_payment_atomic');
    expect(pay.args).toMatchObject({ p_business_id: BIZ_A, p_amount: 250 });
    expect(fake.tables.payment_promises[0]).toMatchObject({ business_id: BIZ_A, promised_date: '2099-12-15', promised_amount: 750, status: 'upcoming' });
  });

  it('validates paid amounts and promise dates', () => {
    const base = { invoice_number: 'X', customer_name: 'A', amount: '100', invoice_date: '01/12/2099', due_date: '31/12/2099' };
    expect(validateImportRows([{ ...base, paid_amount: '150' }]).errors[0].reason).toBe('Amount paid is more than the invoice total');
    expect(validateImportRows([{ ...base, paid_amount: 'abc' }]).errors[0].reason).toMatch(/Invalid paid amount/);
    expect(validateImportRows([{ ...base, promise_date: '31/02/2099' }]).errors[0].reason).toMatch(/Invalid promise date/);
    expect(validateImportRows([{ ...base, promise_date: '01/11/2099' }]).errors[0].reason).toBe('Promise date is before the invoice date');
    expect(validateImportRows([{ ...base, paid_amount: '0.00' }]).valid[0].paid_amount).toBe(0);
    // Fully paid: a promise is meaningless and is dropped
    expect(validateImportRows([{ ...base, paid_amount: '100', promise_date: '15/12/2099' }]).valid[0].promise_date).toBeNull();
  });
});

describe('Changing a promise date', () => {
  it('marks the previous open promise as revised when a new one is recorded', async () => {
    fake.tables.payment_promises = [{ id: 'p-old', business_id: BIZ_A, invoice_id: INV_A, promised_date: '2099-01-01', status: 'upcoming' }];
    const res = await request(app).post('/api/dashboard/record-promise').set(as('emp-a'))
      .send({ invoiceId: INV_A, promisedAmount: 600, promisedDate: '2099-02-01' });
    expect(res.status).toBe(200);
    expect(res.body.revised).toBe(1);
    expect(fake.tables.payment_promises.find((p) => p.id === 'p-old').status).toBe('revised');
    expect(fake.tables.payment_promises.at(-1)).toMatchObject({ promised_date: '2099-02-01', status: 'upcoming' });
  });
});
