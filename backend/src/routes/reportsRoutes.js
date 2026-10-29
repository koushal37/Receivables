import { Router } from 'express';
import { canRead } from '../middleware/auth.js';
import { supabase } from '../supabase.js';

const router = Router();

export function bucketAgeing(rows) {
  const buckets = { not_due: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0, total_outstanding: 0 };
  rows.forEach((r) => {
    const amt = Number(r.outstanding_balance) || 0;
    const days = Number(r.days_overdue) || 0;
    buckets.total_outstanding += amt;
    if (days <= 0) buckets.not_due += amt;
    else if (days <= 30) buckets.days_1_30 += amt;
    else if (days <= 60) buckets.days_31_60 += amt;
    else if (days <= 90) buckets.days_61_90 += amt;
    else buckets.days_90_plus += amt;
  });
  return buckets;
}

router.get('/ageing', ...canRead, async (req, res, next) => {
  try {
    const { data: rows, error } = await supabase
      .from('invoice_ledger_view')
      .select('outstanding_balance, days_overdue')
      .eq('business_id', req.businessId)
      .gt('outstanding_balance', 0)
      .not('payment_status', 'in', '(void)');
    if (error) throw error;
    res.json(bucketAgeing(rows || []));
  } catch (err) {
    next(err);
  }
});

export default router;
