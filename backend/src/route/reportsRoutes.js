import { Router } from 'express';
import { requireAuth, requireBusiness } from '../middleware/auth.js';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { demoStore, getDemoLedgerInvoices } from '../demoStore.js';

const router = Router();

router.get('/ageing', requireAuth, requireBusiness, async (req, res) => {
  try {
    let rows = [];
    let promises = [];
    let disputes = [];
    let payments = [];

    if (req.isDemoMode || !isSupabaseConfigured) {
      rows = getDemoLedgerInvoices(req.businessId).filter((r) => r.payment_status !== 'void');
      promises = demoStore.promises.filter((p) => p.business_id === req.businessId);
      disputes = demoStore.disputes.filter((d) => d.business_id === req.businessId);
      payments = demoStore.payments.filter((p) => p.business_id === req.businessId && p.status !== 'reversed');
    } else {
      const [invRes, promRes, dispRes, pmtRes] = await Promise.all([
        supabase.from('invoice_ledger_view').select('*').eq('business_id', req.businessId).neq('payment_status', 'void'),
        supabase.from('payment_promises').select('*').eq('business_id', req.businessId),
        supabase.from('disputes').select('*').eq('business_id', req.businessId),
        supabase.from('payments').select('*').eq('business_id', req.businessId).neq('status', 'reversed'),
      ]);
      if (invRes.error) throw invRes.error;
      rows = invRes.data || [];
      promises = promRes.data || [];
      disputes = dispRes.data || [];
      payments = pmtRes.data || [];
    }

    const buckets = {
      not_yet_due: 0,
      due_today: 0,
      days_1_7: 0,
      days_8_30: 0,
      days_31_60: 0,
      days_60_plus: 0,
      total_outstanding: 0,
    };

    const customerMap = new Map();

    rows.forEach((r) => {
      const amt = Number(r.outstanding_balance ?? r.outstanding_amount ?? 0);
      const orig = Number(r.original_amount ?? r.amount ?? 0);
      const paid = Number(r.total_paid ?? 0);
      const days = Number(r.days_overdue ?? 0);

      if (amt > 0) {
        buckets.total_outstanding += amt;
        if (r.ageing_bucket === 'due_today' || (days === 0 && r.computed_status === 'due_today')) {
          buckets.due_today += amt;
        } else if (days === 0) {
          buckets.not_yet_due += amt;
        } else if (days <= 7) {
          buckets.days_1_7 += amt;
        } else if (days <= 30) {
          buckets.days_8_30 += amt;
        } else if (days <= 60) {
          buckets.days_31_60 += amt;
        } else {
          buckets.days_60_plus += amt;
        }
      }

      const cKey = r.customer_id;
      if (!customerMap.has(cKey)) {
        customerMap.set(cKey, {
          customer_id: r.customer_id,
          customer_name: r.customer_name,
          customer_phone: r.customer_phone,
          customer_email: r.customer_email,
          opt_out: Boolean(r.customer_opt_out),
          invoice_count: 0,
          total_billed: 0,
          total_paid: 0,
          total_outstanding: 0,
          overdue_amount: 0,
          max_days_overdue: 0,
        });
      }
      const cEntry = customerMap.get(cKey);
      cEntry.invoice_count += 1;
      cEntry.total_billed += orig;
      cEntry.total_paid += paid;
      cEntry.total_outstanding += amt;
      if (days > 0 && amt > 0) {
        cEntry.overdue_amount += amt;
        if (days > cEntry.max_days_overdue) cEntry.max_days_overdue = days;
      }
    });

    const promiseStats = {
      total: promises.length,
      upcoming: promises.filter((p) => ['upcoming', 'pending'].includes(p.status)).length,
      fulfilled: promises.filter((p) => p.status === 'fulfilled').length,
      missed: promises.filter((p) => p.status === 'missed').length,
      revised: promises.filter((p) => p.status === 'revised').length,
    };

    const disputeStats = {
      total: disputes.length,
      open: disputes.filter((d) => d.status !== 'resolved').length,
      resolved: disputes.filter((d) => d.status === 'resolved').length,
    };

    res.json({
      buckets,
      customerSummary: Array.from(customerMap.values()).sort((a, b) => b.total_outstanding - a.total_outstanding),
      promiseStats,
      disputeStats,
      totalCollectedAllTime: payments.reduce((s, p) => s + Number(p.received_amount ?? p.amount ?? 0), 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/customers', requireAuth, requireBusiness, async (req, res) => {
  try {
    let customers = [];
    let invoices = [];

    if (req.isDemoMode || !isSupabaseConfigured) {
      customers = demoStore.customers.filter((c) => c.business_id === req.businessId);
      invoices = getDemoLedgerInvoices(req.businessId);
    } else {
      const [cRes, iRes] = await Promise.all([
        supabase.from('customers').select('*').eq('business_id', req.businessId).order('name'),
        supabase.from('invoice_ledger_view').select('*').eq('business_id', req.businessId),
      ]);
      if (cRes.error) throw cRes.error;
      customers = cRes.data || [];
      invoices = iRes.data || [];
    }

    const enriched = customers.map((c) => {
      const custInvs = invoices.filter((i) => i.customer_id === c.id && i.payment_status !== 'void');
      const totalOutstanding = custInvs.reduce((s, i) => s + Number(i.outstanding_balance ?? 0), 0);
      const overdueBalance = custInvs
        .filter((i) => Number(i.days_overdue) > 0)
        .reduce((s, i) => s + Number(i.outstanding_balance ?? 0), 0);

      return {
        ...c,
        openInvoicesCount: custInvs.filter((i) => Number(i.outstanding_balance) > 0).length,
        totalInvoicesCount: custInvs.length,
        totalOutstanding,
        overdueBalance,
      };
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
