import { Router } from 'express';
import { requireAuth, requireBusiness, assertInvoiceInBusiness } from '../middleware/auth.js';
import { supabase } from '../supabase.js';

const router = Router();

// GET /api/invoices/:id/timeline - Unified timeline of payments, promises, disputes & messages
router.get('/:id/timeline', requireAuth, requireBusiness, async (req, res) => {
  try {
    const invoice = await assertInvoiceInBusiness(req.params.id, req.businessId);

    const [pmts, promises, disputes, msgs] = await Promise.all([
      supabase.from('payments').select('*').eq('invoice_id', invoice.id).order('created_at', { ascending: false }),
      supabase.from('promises').select('*').eq('invoice_id', invoice.id).order('created_at', { ascending: false }),
      supabase.from('disputes').select('*').eq('invoice_id', invoice.id).order('created_at', { ascending: false }),
      supabase.from('communication_logs').select('*').eq('invoice_id', invoice.id).order('created_at', { ascending: false }),
    ]);

    const timeline = [
      ...(pmts.data || []).map((p) => ({ type: 'payment', date: p.payment_date || p.created_at, details: p })),
      ...(promises.data || []).map((pr) => ({ type: 'promise', date: pr.created_at, details: pr })),
      ...(disputes.data || []).map((d) => ({ type: 'dispute', date: d.created_at, details: d })),
      ...(msgs.data || []).map((m) => ({ type: 'message', date: m.created_at, details: m })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ invoice, timeline });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

export default router;
