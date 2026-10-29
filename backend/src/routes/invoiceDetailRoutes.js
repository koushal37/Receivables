import { Router } from 'express';
import { canRead, assertInvoiceInBusiness } from '../middleware/auth.js';
import { supabase } from '../supabase.js';

const router = Router();

// GET /api/invoices/:id/timeline - Unified timeline of payments, promises, disputes & messages
router.get('/:id/timeline', ...canRead, async (req, res, next) => {
  try {
    const invoice = await assertInvoiceInBusiness(req.params.id, req.businessId);

    const [allocs, direct, promises, disputes, msgs] = await Promise.all([
      supabase.from('payment_allocations').select('allocated_amount, payments(*)').eq('invoice_id', invoice.id).eq('business_id', req.businessId),
      // Some payment functions link the payment to the invoice directly instead of via allocations
      supabase.from('payments').select('*').eq('invoice_id', invoice.id).eq('business_id', req.businessId),
      supabase.from('payment_promises').select('*').eq('invoice_id', invoice.id).eq('business_id', req.businessId),
      supabase.from('disputes').select('*').eq('invoice_id', invoice.id).eq('business_id', req.businessId),
      supabase.from('message_logs').select('*').eq('invoice_id', invoice.id).eq('business_id', req.businessId),
    ]);

    const payments = new Map();
    (allocs.data || []).forEach((a) => a.payments && payments.set(a.payments.id, { ...a.payments, allocated_amount: a.allocated_amount }));
    (direct.error ? [] : direct.data || []).forEach((p) => !payments.has(p.id) && payments.set(p.id, p));

    const timeline = [
      ...[...payments.values()].map((p) => ({ type: 'payment', date: p.received_at || p.payment_date || p.created_at, details: p })),
      ...(promises.data || []).map((pr) => ({ type: 'promise', date: pr.created_at, details: pr })),
      ...(disputes.data || []).map((d) => ({ type: 'dispute', date: d.created_at, details: d })),
      ...(msgs.data || []).map((m) => ({ type: 'message', date: m.created_at, details: m })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ invoice, timeline });
  } catch (err) {
    next(err);
  }
});

export default router;
