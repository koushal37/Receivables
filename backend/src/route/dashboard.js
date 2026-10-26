import express from 'express';
import crypto from 'crypto';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { demoStore, getDemoLedgerInvoices, getISTDateString } from '../demoStore.js';
import { requireAuth, requireBusiness, requireRole, assertInvoiceInBusiness, assertCustomerInBusiness, audit } from '../middleware/auth.js';

const router = express.Router();

// 1. GET 4 CORE FINANCIAL METRICS + TODAY'S EXPECTATIONS
router.get('/metrics', requireAuth, requireBusiness, async (req, res) => {
  try {
    const businessId = req.businessId;
    const todayStr = getISTDateString(0);
    const startOfMonth = todayStr.slice(0, 7) + '-01';

    let invoices = [];
    let payments = [];
    let promises = [];

    if (req.isDemoMode || !isSupabaseConfigured) {
      invoices = getDemoLedgerInvoices(businessId).filter((i) => i.payment_status !== 'void');
      payments = demoStore.payments.filter(
        (p) => p.business_id === businessId && p.status !== 'reversed' && p.confirmation_status !== 'reversed' && (p.received_at >= startOfMonth || p.payment_date?.slice(0, 10) >= startOfMonth)
      );
      promises = demoStore.promises.filter((pr) => pr.business_id === businessId);
    } else {
      const { data: invData, error: invErr } = await supabase
        .from('invoice_ledger_view')
        .select('*')
        .eq('business_id', businessId)
        .neq('payment_status', 'void');
      if (invErr) throw invErr;
      invoices = invData || [];

      const { data: payData, error: payErr } = await supabase
        .from('payments')
        .select('received_amount, amount, received_at, status, confirmation_status')
        .eq('business_id', businessId)
        .neq('status', 'reversed')
        .gte('received_at', startOfMonth);
      if (payErr) throw payErr;
      payments = payData || [];

      const { data: promData } = await supabase
        .from('payment_promises')
        .select('*')
        .eq('business_id', businessId);
      promises = promData || [];
    }

    let totalOutstanding = 0;
    let overdue = 0;
    let dueToday = 0;
    let disputedAmount = 0;

    invoices.forEach((inv) => {
      const balance = parseFloat(inv.outstanding_balance ?? inv.outstanding_amount ?? 0) || 0;
      if (balance > 0) {
        totalOutstanding += balance;
        if (inv.payment_status === 'disputed' || inv.computed_status === 'disputed') {
          disputedAmount += balance;
        }
        if (inv.due_date < todayStr) {
          overdue += balance;
        } else if (inv.due_date === todayStr) {
          dueToday += balance;
        }
      }
    });

    const receivedThisMonth = payments.reduce(
      (sum, p) => sum + (parseFloat(p.received_amount ?? p.amount ?? 0) || 0),
      0
    );

    const receivedToday = payments
      .filter((p) => (p.received_at || '').slice(0, 10) === todayStr)
      .reduce((sum, p) => sum + (parseFloat(p.received_amount ?? p.amount ?? 0) || 0), 0);

    const promisedToday = promises
      .filter((pr) => (pr.promised_date || pr.promise_date) === todayStr && pr.status !== 'cancelled' && pr.status !== 'fulfilled')
      .reduce((sum, pr) => sum + (parseFloat(pr.promised_amount ?? 0) || 0), 0);

    const missedPromisesCount = promises.filter((pr) => pr.status === 'missed' || ((pr.promised_date || pr.promise_date) < todayStr && ['upcoming', 'pending'].includes(pr.status))).length;

    res.json({
      metrics: {
        totalOutstanding,
        overdue,
        dueToday,
        receivedThisMonth,
        receivedToday,
        promisedToday,
        disputedAmount,
        missedPromisesCount,
        openInvoicesCount: invoices.filter((i) => Number(i.outstanding_balance ?? i.outstanding_amount) > 0).length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET TODAY'S ACTION PLAN (Prioritized Collection Queue)
router.get('/action-plan', requireAuth, requireBusiness, async (req, res) => {
  try {
    const businessId = req.businessId;
    const todayStr = getISTDateString(0);

    let invoices = [];
    let promises = [];

    if (req.isDemoMode || !isSupabaseConfigured) {
      invoices = getDemoLedgerInvoices(businessId).filter(
        (i) => i.outstanding_balance > 0 && i.payment_status !== 'void' && i.payment_status !== 'disputed' && i.due_date <= todayStr
      );
      promises = demoStore.promises.filter((p) => p.business_id === businessId);
    } else {
      const { data: invData, error } = await supabase
        .from('invoice_ledger_view')
        .select('*')
        .eq('business_id', businessId)
        .gt('outstanding_balance', 0)
        .neq('payment_status', 'void')
        .neq('payment_status', 'disputed')
        .lte('due_date', todayStr);
      if (error) throw error;
      invoices = invData || [];

      const { data: promData } = await supabase
        .from('payment_promises')
        .select('*')
        .eq('business_id', businessId);
      promises = promData || [];
    }

    const missedSet = new Set(
      promises
        .filter((p) => p.status === 'missed' || ((p.promised_date || p.promise_date) < todayStr && ['upcoming', 'pending'].includes(p.status)))
        .map((p) => p.invoice_id)
    );

    const promisedTodayMap = new Map();
    promises
      .filter((p) => (p.promised_date || p.promise_date) === todayStr && ['upcoming', 'pending'].includes(p.status))
      .forEach((p) => promisedTodayMap.set(p.invoice_id, p));

    const actions = invoices
      .map((inv) => {
        const balance = Number(inv.outstanding_balance ?? inv.outstanding_amount ?? 0);
        const days = Number(inv.days_overdue ?? 0);

        let priority = 'routine';
        let ruleTriggered = 'DUE_TODAY';
        let reason = 'Invoice is contractually due today.';
        let recommendedStep = 'Send friendly WhatsApp reminder and confirm RTGS/NEFT schedule.';

        if (missedSet.has(inv.id)) {
          priority = 'critical';
          ruleTriggered = 'MISSED_PROMISE';
          reason = `Customer missed a recorded payment promise (${days} days overdue).`;
          recommendedStep = 'Urgent call required: speak with Finance Head for immediate UTR or revised commitment.';
        } else if (days > 30) {
          priority = 'critical';
          ruleTriggered = 'OVERDUE_30_DAYS';
          reason = `${days} days overdue — exceeds 30-day credit escalation threshold.`;
          recommendedStep = 'Escalate via direct phone call to Accounts Director and send formal statement.';
        } else if (days > 0 && balance >= 100000) {
          priority = 'important';
          ruleTriggered = 'HIGH_VALUE_OVERDUE';
          reason = `High-value balance (₹${balance.toLocaleString('en-IN')}) is ${days} days overdue.`;
          recommendedStep = 'Place priority follow-up call and log expected settlement date.';
        } else if (days > 7) {
          priority = 'important';
          ruleTriggered = 'OVERDUE_7_DAYS';
          reason = `${days} days overdue without confirmed settlement.`;
          recommendedStep = 'Call accounts team to verify invoice approval status.';
        } else if (days > 0) {
          priority = 'routine';
          ruleTriggered = 'RECENTLY_OVERDUE';
          reason = `${days} day(s) past due date.`;
          recommendedStep = 'Send polite WhatsApp payment reminder.';
        } else if (promisedTodayMap.has(inv.id)) {
          priority = 'routine';
          ruleTriggered = 'PROMISE_DUE_TODAY';
          reason = 'Customer promised payment for today.';
          recommendedStep = 'Check bank ledger or send polite afternoon check-in for UTR.';
        }

        return {
          id: inv.id,
          customerId: inv.customer_id,
          customerName: inv.customer_name,
          customerPhone: inv.customer_phone,
          invoiceNumber: inv.invoice_number,
          dueDate: inv.due_date,
          originalAmount: Number(inv.original_amount ?? inv.amount ?? 0),
          outstandingBalance: balance,
          daysOverdue: days,
          priority,
          ruleTriggered,
          priorityReason: reason,
          recommendedNextStep: recommendedStep,
          assignedEmployee: 'Priya Mohanty',
        };
      })
      .sort((a, b) => {
        const rank = { critical: 1, important: 2, routine: 3 };
        if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority];
        if (b.daysOverdue !== a.daysOverdue) return b.daysOverdue - a.daysOverdue;
        return b.outstandingBalance - a.outstandingBalance;
      });

    res.json({ actionPlan: actions.slice(0, 20) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. RECORD PROMISE TO PAY
router.post('/record-promise', requireAuth, requireBusiness, requireRole('owner', 'employee'), async (req, res) => {
  try {
    const businessId = req.businessId;
    const { customerId, invoiceId, promisedAmount, promisedDate, notes, source } = req.body;

    if (!customerId || !promisedAmount || !promisedDate) {
      return res.status(400).json({ error: 'Customer, promised amount, and promised date are required.' });
    }

    await assertCustomerInBusiness(customerId, businessId);
    if (invoiceId) await assertInvoiceInBusiness(invoiceId, businessId);

    if (req.isDemoMode || !isSupabaseConfigured) {
      // Mark previous missed/upcoming promises on this invoice as revised
      demoStore.promises.forEach((p) => {
        if (p.invoice_id === invoiceId && ['missed', 'upcoming', 'pending'].includes(p.status)) {
          p.status = 'revised';
        }
      });

      const newPromise = {
        id: crypto.randomUUID(),
        business_id: businessId,
        customer_id: customerId,
        invoice_id: invoiceId || null,
        promised_amount: Number(promisedAmount),
        promised_date: promisedDate,
        promise_date: promisedDate,
        source: source || 'phone_call',
        status: 'upcoming',
        notes: notes || null,
        recorded_by: req.user.id,
        created_at: new Date().toISOString(),
      };
      demoStore.promises.unshift(newPromise);
      await audit({
        businessId,
        userId: req.user.id,
        action: 'PROMISE_RECORDED',
        entity: 'payment_promises',
        entityId: newPromise.id,
        afterState: newPromise,
      });
      return res.json({ success: true, promise: newPromise });
    }

    const { data, error } = await supabase
      .from('payment_promises')
      .insert({
        business_id: businessId,
        customer_id: customerId,
        invoice_id: invoiceId || null,
        promised_amount: Number(promisedAmount),
        promised_date: promisedDate,
        promise_date: promisedDate,
        source: source || 'phone_call',
        status: 'upcoming',
        notes: notes || null,
        recorded_by: req.user.id,
      })
      .select()
      .single();

    if (error) throw error;

    await audit({
      businessId,
      userId: req.user.id,
      action: 'PROMISE_RECORDED',
      entity: 'payment_promises',
      entityId: data.id,
      afterState: data,
    });

    res.json({ success: true, promise: data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 4. FLAG DISPUTE
router.post('/flag-dispute', requireAuth, requireBusiness, requireRole('owner', 'employee'), async (req, res) => {
  try {
    const businessId = req.businessId;
    const { customerId, invoiceId, reason, description } = req.body;

    if (!invoiceId || !reason) {
      return res.status(400).json({ error: 'Invoice and dispute reason are required.' });
    }

    const inv = await assertInvoiceInBusiness(invoiceId, businessId);
    const resolvedCustId = customerId || inv.customer_id;

    if (req.isDemoMode || !isSupabaseConfigured) {
      const targetInv = demoStore.invoices.find((i) => i.id === invoiceId);
      if (targetInv) {
        targetInv.record_status = 'disputed';
        targetInv.status = 'disputed';
      }
      const newDispute = {
        id: crypto.randomUUID(),
        business_id: businessId,
        customer_id: resolvedCustId,
        invoice_id: invoiceId,
        reason,
        description: description || null,
        status: 'open',
        created_at: new Date().toISOString(),
      };
      demoStore.disputes.unshift(newDispute);
      await audit({
        businessId,
        userId: req.user.id,
        action: 'DISPUTE_FLAGGED',
        entity: 'disputes',
        entityId: newDispute.id,
        afterState: newDispute,
      });
      return res.json({ success: true, dispute: newDispute });
    }

    await supabase
      .from('invoices')
      .update({ record_status: 'disputed', status: 'disputed' })
      .eq('id', invoiceId)
      .eq('business_id', businessId);

    const { data, error } = await supabase
      .from('disputes')
      .insert({
        business_id: businessId,
        customer_id: resolvedCustId,
        invoice_id: invoiceId,
        reason,
        description: description || null,
        status: 'open',
      })
      .select()
      .single();

    if (error) throw error;

    await audit({
      businessId,
      userId: req.user.id,
      action: 'DISPUTE_FLAGGED',
      entity: 'disputes',
      entityId: data.id,
      afterState: data,
    });

    res.json({ success: true, dispute: data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 5. RESOLVE DISPUTE
router.post('/resolve-dispute', requireAuth, requireBusiness, requireRole('owner', 'employee'), async (req, res) => {
  try {
    const businessId = req.businessId;
    const { invoiceId, resolutionNotes } = req.body;

    if (!invoiceId) {
      return res.status(400).json({ error: 'Invoice ID is required.' });
    }

    await assertInvoiceInBusiness(invoiceId, businessId);

    if (req.isDemoMode || !isSupabaseConfigured) {
      const targetInv = demoStore.invoices.find((i) => i.id === invoiceId);
      if (targetInv) {
        targetInv.record_status = 'active';
        targetInv.status = 'unpaid';
      }
      demoStore.disputes.forEach((d) => {
        if (d.invoice_id === invoiceId && d.status !== 'resolved') {
          d.status = 'resolved';
          d.resolution_notes = resolutionNotes || 'Resolved by management';
          d.resolved_at = new Date().toISOString();
        }
      });
      return res.json({ success: true });
    }

    await supabase
      .from('invoices')
      .update({ record_status: 'active', status: 'unpaid' })
      .eq('id', invoiceId)
      .eq('business_id', businessId);

    await supabase
      .from('disputes')
      .update({
        status: 'resolved',
        resolution_notes: resolutionNotes || 'Resolved',
        resolved_at: new Date().toISOString(),
      })
      .eq('invoice_id', invoiceId)
      .eq('business_id', businessId);

    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

export default router;
