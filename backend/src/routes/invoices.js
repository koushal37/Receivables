import express from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { canRead, canWrite, assertInvoiceInBusiness, audit } from '../middleware/auth.js';
import { parseAmount, parseDate, normalizePhone, normalizeCurrency } from '../../../shared/parsing.js';

const router = express.Router();

// GET /api/invoices - list from the deterministic ledger view
router.get('/', ...canRead, async (req, res, next) => {
  try {
    const { status, search } = req.query;

    let query = supabase
      .from('invoice_ledger_view')
      .select('*')
      .eq('business_id', req.businessId)
      .order('due_date', { ascending: true });

    if (status && status !== 'all') {
      query = query.eq('payment_status', String(status));
    }
    if (search) {
      // Strip PostgREST filter syntax characters so user input can't inject extra filters
      const term = String(search).replace(/[,()*%\\]/g, ' ').trim().slice(0, 100);
      if (term) query = query.or(`customer_name.ilike.%${term}%,invoice_number.ilike.%${term}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ invoices: data || [] });
  } catch (err) {
    next(err);
  }
});

// GET /api/invoices/:id - full invoice (incl. document fields) with its customer and balance
router.get('/:id', ...canRead, async (req, res, next) => {
  try {
    await assertInvoiceInBusiness(req.params.id, req.businessId);
    const [inv, ledger] = await Promise.all([
      supabase.from('invoices').select('*, customers(id, name, phone, email)').eq('id', req.params.id).eq('business_id', req.businessId).single(),
      supabase.from('invoice_ledger_view').select('total_paid, total_adjusted, outstanding_balance, payment_status, days_overdue').eq('id', req.params.id).eq('business_id', req.businessId).maybeSingle(),
    ]);
    if (inv.error) throw inv.error;
    res.json({ invoice: { ...inv.data, ...(ledger.data || {}) } });
  } catch (err) {
    next(err);
  }
});

const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
const optionalMoney = z.union([z.string(), z.number(), z.null()]).optional();

const editSchema = z.object({
  invoice_number: z.string().trim().min(1, 'Invoice number is required').max(100).optional(),
  invoice_date: z.string().optional(),
  due_date: z.string().optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  currency: z.string().max(5).optional(),
  customer_name: z.string().trim().min(1, 'Customer name is required').max(200).optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  subtotal: optionalMoney,
  tax: optionalMoney,
  vendor_name: z.string().max(200).nullable().optional(),
  line_items: z.array(z.record(z.string(), z.unknown())).max(500).optional(),
});

const bad = (message) => Object.assign(new Error(message), { statusCode: 400 });

// PATCH /api/invoices/:id - correct an invoice and its customer's contact details
router.patch('/:id', ...canWrite, async (req, res, next) => {
  try {
    const body = editSchema.parse(req.body);
    await assertInvoiceInBusiness(req.params.id, req.businessId);

    const { data: before, error: loadErr } = await supabase
      .from('invoices').select('*, customers(id, name, phone, email)')
      .eq('id', req.params.id).eq('business_id', req.businessId).single();
    if (loadErr) throw loadErr;
    const { data: ledger } = await supabase
      .from('invoice_ledger_view').select('total_paid').eq('id', req.params.id).maybeSingle();

    const core = {};
    if (body.invoice_number !== undefined && body.invoice_number !== before.invoice_number) {
      const { data: clash } = await supabase.from('invoices').select('id')
        .eq('business_id', req.businessId).ilike('invoice_number', body.invoice_number.replace(/[%_]/g, '\\$&')).neq('id', before.id).limit(1);
      if (clash?.length) throw Object.assign(new Error(`Invoice number ${body.invoice_number} already exists`), { statusCode: 409 });
      core.invoice_number = body.invoice_number;
    }
    if (body.invoice_date !== undefined) {
      core.invoice_date = parseDate(body.invoice_date);
      if (!core.invoice_date) throw bad('Invalid invoice date');
    }
    if (body.due_date !== undefined) {
      core.due_date = parseDate(body.due_date);
      if (!core.due_date) throw bad('Invalid due date');
    }
    if ((core.invoice_date ?? before.invoice_date) > (core.due_date ?? before.due_date)) throw bad('Due date is before the invoice date');
    if (body.amount !== undefined) {
      const amount = parseAmount(body.amount);
      if (amount === null) throw bad('Total must be greater than 0');
      const paid = Number(ledger?.total_paid) || 0;
      if (amount < paid) throw bad(`Total can't be less than the ${paid} already paid. Reverse a payment first.`);
      core.original_amount = amount;
    }
    if (body.currency !== undefined) core.currency_code = normalizeCurrency(body.currency, before.currency_code || 'INR');

    if (Object.keys(core).length) {
      const { error } = await supabase.from('invoices').update({ ...core, updated_at: new Date().toISOString() })
        .eq('id', before.id).eq('business_id', req.businessId);
      if (error) throw error;
      // Older databases also keep a legacy `amount` column in sync
      if (core.original_amount !== undefined) {
        const legacy = await supabase.from('invoices').update({ amount: core.original_amount }).eq('id', before.id).eq('business_id', req.businessId);
        if (legacy.error && !/amount/.test(legacy.error.message)) console.warn('Legacy amount sync failed:', legacy.error.message);
      }
    }

    // Document fields from migration 009 (best-effort so a missing migration doesn't block edits)
    const extra = {};
    if (body.subtotal !== undefined) extra.subtotal = text(body.subtotal) ? parseAmount(body.subtotal) : null;
    if (body.tax !== undefined) extra.tax_amount = text(body.tax) === '0' ? 0 : text(body.tax) ? parseAmount(body.tax) : null;
    if (body.vendor_name !== undefined) extra.vendor_name = text(body.vendor_name) || null;
    if (body.line_items !== undefined) extra.line_items = body.line_items;
    if (Object.keys(extra).length) {
      const { error } = await supabase.from('invoices').update(extra).eq('id', before.id).eq('business_id', req.businessId);
      if (error) console.warn('Invoice document fields not saved (run migration 009):', error.message);
    }

    // Customer contact details live on the customer record (shared by their invoices)
    const customer = {};
    if (body.customer_name !== undefined && body.customer_name !== before.customers?.name) customer.name = body.customer_name;
    if (body.phone !== undefined) {
      const phone = text(body.phone) ? normalizePhone(body.phone) : null;
      if (text(body.phone) && !phone) throw bad('Phone must be 10 digits, or + and the country code');
      if (phone !== (before.customers?.phone ?? null)) customer.phone = phone;
    }
    if (body.email !== undefined) {
      const email = text(body.email) || null;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Invalid email');
      if (email !== (before.customers?.email ?? null)) customer.email = email;
    }
    if (Object.keys(customer).length) {
      const { error } = await supabase.from('customers').update({ ...customer, updated_at: new Date().toISOString() })
        .eq('id', before.customer_id).eq('business_id', req.businessId);
      if (error) throw error.code === '23505' ? bad('Another customer already uses that phone number') : error;
    }

    await audit({
      businessId: req.businessId,
      userId: req.user.id,
      action: 'INVOICE_EDITED',
      entity: 'invoices',
      entityId: before.id,
      beforeState: { invoice_number: before.invoice_number, invoice_date: before.invoice_date, due_date: before.due_date, original_amount: before.original_amount, customer: before.customers },
      afterState: { ...core, ...extra, customer },
    });

    const { data: updated } = await supabase.from('invoice_ledger_view').select('*').eq('id', before.id).maybeSingle();
    res.json({ invoice: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
