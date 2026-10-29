import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createFakeSupabase } from './helpers/fakeSupabase.js';

const BIZ_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BIZ_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INV_A = '11111111-1111-4111-8111-111111111111';
const INV_B = '22222222-2222-4222-8222-222222222222';

let fake;
vi.mock('../src/supabase.js', () => ({
  get supabase() { return fake; },
}));

const { app } = await import('../src/app.js');
const { assertInvoiceInBusiness } = await import('../src/middleware/auth.js');

beforeEach(() => {
  fake = createFakeSupabase({
    business_memberships: [
      { user_id: 'owner-a', business_id: BIZ_A, role: 'owner', status: 'active' },
      { user_id: 'emp-a', business_id: BIZ_A, role: 'employee', status: 'active' },
      { user_id: 'ro-a', business_id: BIZ_A, role: 'read_only', status: 'active' },
      { user_id: 'revoked-a', business_id: BIZ_A, role: 'owner', status: 'revoked' },
    ],
    invoices: [
      { id: INV_A, business_id: BIZ_A, customer_id: 'cust-a', invoice_number: 'A-1', record_status: 'active' },
      { id: INV_B, business_id: BIZ_B, customer_id: 'cust-b', invoice_number: 'B-1', record_status: 'active' },
    ],
  });
  for (const id of ['owner-a', 'emp-a', 'ro-a', 'revoked-a', 'new-user']) fake.users.set(`tok-${id}`, { id, email: `${id}@x.test` });
});

const as = (user) => ({ Authorization: `Bearer tok-${user}` });
const futureDate = '2099-01-01';

describe('Tenant Isolation Unit Verification', () => {
  it('throws 404 when querying an invoice outside caller business scope', async () => {
    await expect(assertInvoiceInBusiness(INV_B, BIZ_A)).rejects.toThrow(
      'Invoice not found in the authenticated business scope'
    );
  });

  it('resolves an invoice inside the caller business scope', async () => {
    await expect(assertInvoiceInBusiness(INV_A, BIZ_A)).resolves.toMatchObject({ id: INV_A });
  });

  it('cannot record a promise against another business invoice', async () => {
    const res = await request(app).post('/api/dashboard/record-promise').set(as('owner-a'))
      .send({ invoiceId: INV_B, promisedAmount: 100, promisedDate: futureDate });
    expect(res.status).toBe(404);
    expect(fake.tables.payment_promises ?? []).toHaveLength(0);
  });

  it('cannot flag a dispute on another business invoice, and leaves it untouched', async () => {
    const res = await request(app).post('/api/dashboard/flag-dispute').set(as('owner-a'))
      .send({ invoiceId: INV_B, reason: 'other' });
    expect(res.status).toBe(404);
    expect(fake.tables.invoices.find((i) => i.id === INV_B).record_status).toBe('active');
  });

  it('cannot record a payment against another business invoice', async () => {
    const res = await request(app).post('/api/payments/record').set(as('owner-a')).send({ invoiceId: INV_B, amount: 10 });
    expect(res.status).toBe(404);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it('derives the customer from the invoice, ignoring any customerId in the body', async () => {
    const res = await request(app).post('/api/dashboard/record-promise').set(as('emp-a'))
      .send({ invoiceId: INV_A, customerId: 'cust-b', promisedAmount: 100, promisedDate: futureDate });
    expect(res.status).toBe(200);
    expect(fake.tables.payment_promises[0]).toMatchObject({ business_id: BIZ_A, customer_id: 'cust-a' });
  });
});

describe('Role enforcement', () => {
  const writes = [
    ['post', '/api/dashboard/record-promise', { invoiceId: INV_A, promisedAmount: 1, promisedDate: futureDate }],
    ['post', '/api/dashboard/flag-dispute', { invoiceId: INV_A, reason: 'other' }],
    ['post', '/api/payments/record', { invoiceId: INV_A, amount: 1 }],
    ['post', '/api/import/preview', { rows: [{ invoice_number: 'x' }] }],
    ['post', '/api/import/commit', { rows: [{ invoice_number: 'x' }] }],
    ['post', '/api/messages/send-reminder', { invoiceId: INV_A }],
    ['get', '/api/team', undefined],
  ];

  it.each(writes)('read_only user gets 403 on %s %s', async (method, path, body) => {
    const res = await request(app)[method](path).set(as('ro-a')).send(body);
    expect(res.status).toBe(403);
  });

  it('employees cannot reverse payments or manage the team', async () => {
    expect((await request(app).post('/api/payments/reverse').set(as('emp-a')).send({})).status).toBe(403);
    expect((await request(app).get('/api/team').set(as('emp-a'))).status).toBe(403);
  });

  it('read_only users can still read', async () => {
    fake.tables.invoice_ledger_view = [];
    fake.tables.payments = [];
    expect((await request(app).get('/api/invoices').set(as('ro-a'))).status).toBe(200);
    expect((await request(app).get('/api/dashboard/metrics').set(as('ro-a'))).status).toBe(200);
  });

  it('revoked members and users without a business are rejected', async () => {
    expect((await request(app).get('/api/invoices').set(as('revoked-a'))).body.code).toBe('NO_BUSINESS');
    expect((await request(app).get('/api/invoices').set(as('new-user'))).status).toBe(403);
  });

  it('requests without a valid token get 401', async () => {
    expect((await request(app).get('/api/invoices')).status).toBe(401);
    expect((await request(app).get('/api/invoices').set({ Authorization: 'Bearer nope' })).status).toBe(401);
  });
});

describe('Onboarding and import', () => {
  it('a new signup can create a business and becomes its owner', async () => {
    const res = await request(app).post('/api/onboard').set(as('new-user')).send({ businessName: 'New Co' });
    expect(res.status).toBe(201);
    const me = await request(app).get('/api/me').set(as('new-user'));
    expect(me.body.membership.role).toBe('owner');
    expect(me.body.business.name).toBe('New Co');
  });

  it('commit re-validates on the server and rejects the whole batch if any row is bad', async () => {
    const res = await request(app).post('/api/import/commit').set(as('emp-a')).send({
      rows: [
        { invoice_number: 'N-1', customer_name: 'Acme', amount: '1,000', due_date: '01/01/2099' },
        { invoice_number: 'N-2', customer_name: 'Acme', amount: '1,50,000', due_date: '31/02/2099' },
      ],
    });
    expect(res.status).toBe(422);
    expect(res.body.errors).toHaveLength(1);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it('commit sends only server-normalized rows to the atomic RPC', async () => {
    const res = await request(app).post('/api/import/commit').set(as('emp-a')).send({
      rows: [{ 'Invoice No': 'N-1', 'Party Name': 'Acme', Amount: '₹1,50,000', 'Due Date': '15/10/2099' }],
    });
    expect(res.status).toBe(200);
    expect(fake.rpcCalls[0].args.p_business_id).toBe(BIZ_A);
    expect(fake.rpcCalls[0].args.p_rows[0]).toMatchObject({ invoice_number: 'N-1', amount: 150000, due_date: '2099-10-15' });
  });

  it('flags invoice numbers that already exist in the business as duplicates', async () => {
    const res = await request(app).post('/api/import/preview').set(as('emp-a')).send({
      rows: [{ invoice_number: 'a-1', customer_name: 'Acme', amount: 5, due_date: '01/01/2099' }],
    });
    expect(res.body.duplicates).toHaveLength(1);
  });
});
