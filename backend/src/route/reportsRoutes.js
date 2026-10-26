import { Router } from 'express';
import { requireAuth, requireBusiness } from '../middleware/auth.js';
import { supabase } from '../supabase.js';

const router = Router();

router.get('/ageing', requireAuth, requireBusiness, async (req, res) => {
  try {
    const { data: rows, error } = await supabase
      .from('invoice_summary_view')
      .select('*')
      .eq('business_id', req.businessId)
      .gt('outstanding_amount', 0);

    if (error) throw error;

    const buckets = {
      not_due: 0,
      days_1_30: 0,
      days_31_60: 0,
      days_61_90: 0,
      days_90_plus: 0,
      total_outstanding: 0,
    };

    rows.forEach((r) => {
      const amt = Number(r.outstanding_amount);
      const days = Number(r.days_overdue);

      buckets.total_outstanding += amt;
      if (days === 0) buckets.not_due += amt;
      else if (days <= 30) buckets.days_1_30 += amt;
      else if (days <= 60) buckets.days_31_60 += amt;
      else if (days <= 90) buckets.days_61_90 += amt;
      else buckets.days_90_plus += amt;
    });

    res.json(buckets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
