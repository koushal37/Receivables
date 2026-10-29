import express from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { canRead, canWrite, assertInvoiceInBusiness, audit } from '../middleware/auth.js';
import { todayInTz, startOfMonthInTz } from '../lib/dates.js';
import { buildActionPlan } from '../engine/actionPlan.js';

const router = express.Router();

// 1. GET 4 CORE FINANCIAL METRICS
router.get('/metrics', ...canRead, async (req, res, next) => {
  try {
    const businessId = req.businessId;

    const { data: invoices, error: invErr } = await supabase
      .from('invoice_ledger_view')
      .select('outstanding_balance, payment_status, due_date')
      .eq('business_id', businessId)
      .neq('payment_status', 'void');

    if (invErr) throw invErr;

    const todayStr = todayInTz();

    let totalOutstanding = 0;
    let overdue = 0;
    let dueToday = 0;

    (invoices || []).forEach((inv) => {
      const balance = Number(inv.outstanding_balance) || 0;
      if (balance > 0) {
        totalOutstanding += balance;
        if (inv.due_date < todayStr) {
          overdue += balance;
        } else if (inv.due_date === todayStr) {
          dueToday += balance;
        }
      }
    });

    // Received this month (IST calendar month): confirmed payments
    const { data: payments, error: payErr } = await supabase
      .from('payments')
      .select('received_amount')
      .eq('business_id', businessId)
      .eq('confirmation_status', 'confirmed')
      .gte('received_at', startOfMonthInTz());

    if (payErr) throw payErr;

    const receivedThisMonth = (payments || []).reduce((sum, p) => sum + (Number(p.received_amount) || 0), 0);

    res.json({ metrics: { totalOutstanding, overdue, dueToday, receivedThisMonth } });
  } catch (err) {
    next(err);
  }
});

// 2. GET TODAY'S ACTION PLAN (Prioritized Collection Queue)
router.get('/action-plan', ...canRead, async (req, res, next) => {
  try {
    const businessId = req.businessId;
    const today = todayInTz();

    // Only invoices due today or earlier belong in today's queue
    const { data: invoices, error } = await supabase
      .from('invoice_ledger_view')
      .select('id, customer_id, customer_name, customer_phone, invoice_number, outstanding_balance, days_overdue, due_date, payment_status')
      .eq('business_id', businessId)
      .gt('outstanding_balance', 0)
      .lte('due_date', today)
      .not('payment_status', 'in', '(void,disputed)');

    if (error) throw error;

    const { data: missedPromises, error: promErr } = await supabase
      .from('payment_promises')
      .select('invoice_id')
      .eq('business_id', businessId)
      .eq('status', 'missed');
    if (promErr) throw promErr;

    const actionPlan = buildActionPlan(invoices || [], new Set((missedPromises || []).map((p) => p.invoice_id)));
    res.json({ actionPlan: actionPlan.slice(0, 15) });
  } catch (err) {
    next(err);
  }
});

// 3. RECORD PROMISE TO PAY
const promiseSchema = z.object({
  invoiceId: z.string().uuid(),
  promisedAmount: z.coerce.number().positive(),
  promisedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  notes: z.string().max(1000).optional().nullable(),
});

router.post('/record-promise', ...canWrite, async (req, res, next) => {
  try {
    const body = promiseSchema.parse(req.body);
    if (body.promisedDate < todayInTz()) {
      return res.status(400).json({ error: 'Promise date cannot be in the past' });
    }
    // Customer comes from the invoice, never from the request body (tenant isolation)
    const invoice = await assertInvoiceInBusiness(body.invoiceId, req.businessId);

    const { data, error } = await supabase
      .from('payment_promises')
      .insert({
        business_id: req.businessId,
        customer_id: invoice.customer_id,
        invoice_id: invoice.id,
        promised_amount: body.promisedAmount,
        promised_date: body.promisedDate,
        notes: body.notes || null,
        recorded_by: req.user.id,
        status: 'upcoming'
      })
      .select()
      .single();

    if (error) throw error;
    await audit({ businessId: req.businessId, userId: req.user.id, action: 'PROMISE_RECORDED', entity: 'payment_promises', entityId: data.id, afterState: body });
    res.json({ success: true, promise: data });
  } catch (err) {
    next(err);
  }
});

// 4. FLAG DISPUTE
const disputeSchema = z.object({
  invoiceId: z.string().uuid(),
  reason: z.enum(['pricing_error', 'damaged_goods', 'short_shipment', 'already_paid', 'other']),
  description: z.string().max(2000).optional().nullable(),
});

router.post('/flag-dispute', ...canWrite, async (req, res, next) => {
  try {
    const body = disputeSchema.parse(req.body);
    const invoice = await assertInvoiceInBusiness(body.invoiceId, req.businessId);

    const { data, error } = await supabase
      .from('disputes')
      .insert({
        business_id: req.businessId,
        customer_id: invoice.customer_id,
        invoice_id: invoice.id,
        reason: body.reason,
        description: body.description || null
      })
      .select()
      .single();
    if (error) throw error;

    // Only mark the invoice disputed once the dispute record exists
    const { error: updErr } = await supabase
      .from('invoices')
      .update({ record_status: 'disputed' })
      .eq('id', invoice.id)
      .eq('business_id', req.businessId);
    if (updErr) throw updErr;

    await audit({ businessId: req.businessId, userId: req.user.id, action: 'DISPUTE_FLAGGED', entity: 'disputes', entityId: data.id, beforeState: { record_status: invoice.record_status }, afterState: body });
    res.json({ success: true, dispute: data });
  } catch (err) {
    next(err);
  }
});

export default router;
