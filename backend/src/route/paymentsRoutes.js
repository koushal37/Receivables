import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { demoStore, getDemoLedgerInvoices, getISTDateString } from '../demoStore.js';
import { requireAuth, requireBusiness, requireRole, assertInvoiceInBusiness, audit } from '../middleware/auth.js';

const router = Router();

const recordPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.coerce.number().positive(),
  paymentMethod: z.string().default('neft_rtgs'),
  utr: z.string().trim().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// GET /api/payments - List payments for business
router.get('/', requireAuth, requireBusiness, async (req, res) => {
  try {
    if (req.isDemoMode || !isSupabaseConfigured) {
      const pmts = demoStore.payments
        .filter((p) => p.business_id === req.businessId)
        .map((p) => {
          const inv = demoStore.invoices.find((i) => i.id === p.invoice_id);
          const cust = demoStore.customers.find((c) => c.id === (p.customer_id || inv?.customer_id));
          return {
            ...p,
            invoice_number: inv?.invoice_number || '-',
            customer_name: cust?.name || '-',
          };
        });
      return res.json(pmts);
    }

    const { data, error } = await supabase
      .from('payments')
      .select('*, invoices(invoice_number), customers(name)')
      .eq('business_id', req.businessId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/record
router.post('/record', requireAuth, requireBusiness, requireRole('owner', 'employee'), async (req, res) => {
  try {
    const data = recordPaymentSchema.parse(req.body);
    const inv = await assertInvoiceInBusiness(data.invoiceId, req.businessId);

    if (req.isDemoMode || !isSupabaseConfigured) {
      const outstanding = Number(inv.outstanding_balance ?? inv.outstanding_amount ?? 0);
      if (data.amount > outstanding) {
        return res.status(400).json({
          error: `Payment of ₹${data.amount.toLocaleString('en-IN')} exceeds outstanding balance of ₹${outstanding.toLocaleString('en-IN')}`,
        });
      }

      if (
        data.utr &&
        demoStore.payments.some(
          (p) => p.business_id === req.businessId && p.utr === data.utr && p.status !== 'reversed'
        )
      ) {
        return res.status(400).json({ error: `Payment with UTR ${data.utr} is already recorded.` });
      }

      const newPmt = {
        id: crypto.randomUUID(),
        business_id: req.businessId,
        customer_id: inv.customer_id,
        invoice_id: inv.id,
        received_amount: data.amount,
        amount: data.amount,
        received_at: getISTDateString(0),
        payment_date: new Date().toISOString(),
        payment_method: data.paymentMethod,
        payment_reference: data.utr || null,
        utr: data.utr || null,
        notes: data.notes || null,
        confirmation_status: 'confirmed',
        status: 'completed',
        recorded_by: req.user.id,
        created_at: new Date().toISOString(),
      };
      demoStore.payments.unshift(newPmt);

      const targetInv = demoStore.invoices.find((i) => i.id === inv.id);
      const remaining = Math.max(0, outstanding - data.amount);
      if (targetInv) {
        targetInv.status = remaining <= 0 ? 'paid' : 'partially_paid';
      }
      if (remaining <= 0) {
        demoStore.promises.forEach((pr) => {
          if (pr.invoice_id === inv.id && ['upcoming', 'pending', 'missed'].includes(pr.status)) {
            pr.status = 'fulfilled';
          }
        });
      }

      await audit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'PAYMENT_RECORDED',
        entity: 'payments',
        entityId: newPmt.id,
        afterState: data,
      });

      return res.json({
        success: true,
        payment_id: newPmt.id,
        remaining_balance: remaining,
      });
    }

    const { data: result, error } = await supabase.rpc('record_payment_atomic', {
      p_business_id: req.businessId,
      p_invoice_id: data.invoiceId,
      p_amount: data.amount,
      p_payment_method: data.paymentMethod,
      p_utr: data.utr || null,
      p_notes: data.notes || null,
    });

    if (error) throw error;

    await audit({
      businessId: req.businessId,
      userId: req.user.id,
      action: 'PAYMENT_RECORDED',
      entity: 'payments',
      entityId: result.payment_id,
      afterState: data,
    });

    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

// POST /api/payments/reverse
router.post('/reverse', requireAuth, requireBusiness, requireRole('owner'), async (req, res) => {
  try {
    const { paymentId, reason } = z
      .object({ paymentId: z.string().min(1), reason: z.string().min(3) })
      .parse(req.body);

    if (req.isDemoMode || !isSupabaseConfigured) {
      const pmt = demoStore.payments.find((p) => p.id === paymentId && p.business_id === req.businessId);
      if (!pmt) return res.status(404).json({ error: 'Payment not found' });
      if (pmt.status === 'reversed') return res.status(400).json({ error: 'Payment is already reversed' });

      pmt.status = 'reversed';
      pmt.confirmation_status = 'reversed';
      pmt.reversal_reason = reason;

      const updatedLedger = getDemoLedgerInvoices(req.businessId).find((i) => i.id === pmt.invoice_id);
      return res.json({ success: true, newStatus: updatedLedger?.payment_status || 'unpaid' });
    }

    const { data: pmt, error: pmtErr } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .eq('business_id', req.businessId)
      .single();

    if (pmtErr || !pmt) return res.status(404).json({ error: 'Payment not found' });
    if (pmt.status === 'reversed') return res.status(400).json({ error: 'Payment is already reversed' });

    await supabase
      .from('payments')
      .update({ status: 'reversed', confirmation_status: 'reversed', reversal_reason: reason })
      .eq('id', paymentId);

    await audit({
      businessId: req.businessId,
      userId: req.user.id,
      action: 'PAYMENT_REVERSED',
      entity: 'payments',
      entityId: paymentId,
      afterState: { reason },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
