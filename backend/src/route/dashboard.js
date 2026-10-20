import express from 'express';
import { supabase } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// 1. GET 4 CORE FINANCIAL METRICS
router.get('/metrics', requireAuth, async (req, res) => {
  try {
    const businessId = req.businessId;

    // Fetch live balances from the deterministic ledger view
    const { data: invoices, error: invErr } = await supabase
      .from('invoice_ledger_view')
      .select('outstanding_balance, original_amount, payment_status, due_date')
      .eq('business_id', businessId)
      .neq('payment_status', 'void');

    if (invErr) throw invErr;

    const todayStr = new Date().toISOString().split('T')[0];

    let totalOutstanding = 0;
    let overdue = 0;
    let dueToday = 0;

    (invoices || []).forEach((inv) => {
      const balance = parseFloat(inv.outstanding_balance) || 0;
      if (balance > 0) {
        totalOutstanding += balance;
        if (inv.payment_status === 'overdue' || inv.due_date < todayStr) {
          overdue += balance;
        } else if (inv.due_date === todayStr) {
          dueToday += balance;
        }
      }
    });

    // Received this month: confirmed payments where received_at is in current calendar month
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const { data: payments, error: payErr } = await supabase
      .from('payments')
      .select('received_amount')
      .eq('business_id', businessId)
      .eq('confirmation_status', 'confirmed')
      .gte('received_at', startOfMonth);

    if (payErr) throw payErr;

    const receivedThisMonth = (payments || []).reduce(
      (sum, p) => sum + (parseFloat(p.received_amount) || 0),
      0
    );

    res.json({
      metrics: {
        totalOutstanding,
        overdue,
        dueToday,
        receivedThisMonth
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET TODAY'S ACTION PLAN (Prioritized Collection Queue)
router.get('/action-plan', requireAuth, async (req, res) => {
  try {
    const businessId = req.businessId;

    // Fetch active overdue and due-today invoices
    const { data: invoices, error } = await supabase
      .from('invoice_ledger_view')
      .select('*')
      .eq('business_id', businessId)
      .gt('outstanding_balance', 0)
      .neq('payment_status', 'void')
      .neq('payment_status', 'disputed');

    if (error) throw error;

    // Check for active missed promises
    const { data: missedPromises } = await supabase
      .from('payment_promises')
      .select('customer_id, invoice_id, promised_date, status')
      .eq('business_id', businessId)
      .eq('status', 'missed');

    const missedSet = new Set((missedPromises || []).map((p) => p.invoice_id));

    // Map invoices into prioritized action cards
    const actions = (invoices || [])
      .map((inv) => {
        let priority = 'routine';
        let reason = 'Invoice due today.';
        let recommendedStep = 'Send friendly payment reminder.';

        if (missedSet.has(inv.id)) {
          priority = 'critical';
          reason = 'Customer missed an agreed payment promise date.';
          recommendedStep = 'Urgent call required. Follow up on missed commitment.';
        } else if (inv.days_overdue > 30) {
          priority = 'critical';
          reason = `${inv.days_overdue} days overdue (high delay).`;
          recommendedStep = 'Escalate with phone call to accounts head.';
        } else if (inv.days_overdue > 7) {
          priority = 'important';
          reason = `${inv.days_overdue} days overdue without confirmed settlement.`;
          recommendedStep = 'Place follow-up phone call to verify payment status.';
        } else if (inv.days_overdue > 0) {
          priority = 'routine';
          reason = `${inv.days_overdue} day(s) overdue.`;
          recommendedStep = 'Send follow-up WhatsApp notice.';
        }

        return {
          id: inv.id,
          customerId: inv.customer_id,
          customerName: inv.customer_name,
          customerPhone: inv.customer_phone,
          invoiceNumber: inv.invoice_number,
          outstandingBalance: inv.outstanding_balance,
          daysOverdue: inv.days_overdue,
          priority,
          priorityReason: reason,
          recommendedNextStep: recommendedStep
        };
      })
      .sort((a, b) => {
        // Tie-breaker: Critical > Important > Routine, then highest days overdue, then balance
        const rank = { critical: 1, important: 2, routine: 3 };
        if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority];
        if (b.daysOverdue !== a.daysOverdue) return b.daysOverdue - a.daysOverdue;
        return b.outstandingBalance - a.outstandingBalance;
      });

    res.json({ actionPlan: actions.slice(0, 15) }); // Top 15 priority items
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. RECORD PROMISE TO PAY
router.post('/record-promise', requireAuth, async (req, res) => {
  try {
    const businessId = req.businessId;
    const { customerId, invoiceId, promisedAmount, promisedDate, notes } = req.body;

    if (!customerId || !promisedAmount || !promisedDate) {
      return res.status(400).json({ error: 'Customer, amount, and promise date required.' });
    }

    const { data, error } = await supabase
      .from('payment_promises')
      .insert({
        business_id: businessId,
        customer_id: customerId,
        invoice_id: invoiceId || null,
        promised_amount: promisedAmount,
        promised_date: promisedDate,
        notes: notes || null,
        recorded_by: req.user.id
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, promise: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. FLAG DISPUTE
router.post('/flag-dispute', requireAuth, async (req, res) => {
  try {
    const businessId = req.businessId;
    const { customerId, invoiceId, reason, description } = req.body;

    if (!invoiceId || !reason) {
      return res.status(400).json({ error: 'Invoice and reason are required.' });
    }

    // Mark invoice status as disputed
    await supabase
      .from('invoices')
      .update({ record_status: 'disputed' })
      .eq('id', invoiceId)
      .eq('business_id', businessId);

    // Insert dispute record
    const { data, error } = await supabase
      .from('disputes')
      .insert({
        business_id: businessId,
        customer_id: customerId,
        invoice_id: invoiceId,
        reason,
        description: description || null
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, dispute: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;