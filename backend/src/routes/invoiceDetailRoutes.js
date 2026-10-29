import { Router } from 'express';
import { canRead, assertInvoiceInBusiness } from '../middleware/auth.js';
import { supabase } from '../supabase.js';

const router = Router();

// GET /api/invoices/:id/timeline - Unified timeline of payments, promises, disputes & messages
router.get('/:id/timeline', ...canRead, async (req, res, next) => {
  try {
    const invoice = await assertInvoiceInBusiness(req.params.id, req.businessId);

    const [allocs, promises, disputes, msgs] = await Promise.all([
      supabase.from('payment_allocations').select('allocated_amount, payments(*)').eq('invoice_id', invoice.id).eq('business_id', req.businessId),
      supabase.from('payment_promises').select('*').eq('invoice_id', invoice.id).eq('business_id', req.businessId),
      supabase.from('disputes').select('*').eq('invoice_id', invoice.id).eq('business_id', req.businessId),
      supabase.from('message_logs').select('*').eq('invoice_id', invoice.id).eq('business_id', req.businessId),
    ]);

    const timeline = [
      ...(allocs.data || []).map((a) => ({ type: 'payment', date: a.payments?.received_at || a.payments?.created_at, details: { ...a.payments, allocated_amount: a.allocated_amount } })),
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
