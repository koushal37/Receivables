import express from 'express';
import { supabase } from '../supabase.js';
import { canRead } from '../middleware/auth.js';

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

export default router;
