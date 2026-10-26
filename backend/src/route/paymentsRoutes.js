import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { requireAuth, requireBusiness, requireRole, assertInvoiceInBusiness, audit } from '../middleware/auth.js';

const router = Router();

// Record Payment with atomic verification
const recordPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMethod: z.string().default('bank_transfer'),
  utr: z.string().trim().min(3).optional().nullable(),
  notes: z.string().optional().nullable(),
});

router.post('/record', requireAuth, requireBusiness, requireRole('owner', 'employee'), async (req, res) => {
  try {
    const data = recordPaymentSchema.parse(req.body);
    await assertInvoiceInBusiness(data.invoiceId, req.businessId);

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
    res.status(400).json({ error: err.message });
  }
});

// Reverse Payment
router.post('/reverse', requireAuth, requireBusiness, requireRole('owner'), async (req, res) => {
  try {
    const { paymentId, reason } = z.object({ paymentId: z.string().uuid(), reason: z.string().min(3) }).parse(req.body);

    const { data: pmt, error: pmtErr } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .eq('business_id', req.businessId)
      .single();

    if (pmtErr || !pmt) return res.status(404).json({ error: 'Payment not found' });
    if (pmt.status === 'reversed') return res.status(400).json({ error: 'Payment is already reversed' });

    // Mark reversed
    await supabase.from('payments').update({ status: 'reversed', reversal_reason: reason }).eq('id', paymentId);

    // Recalculate invoice status
    const { data: payments } = await supabase
      .from('payments')
      .select('amount')
      .eq('invoice_id', pmt.invoice_id)
      .neq('status', 'reversed');

    const totalRemainingPaid = (payments || []).reduce((acc, curr) => acc + Number(curr.amount), 0);

    const { data: inv } = await supabase.from('invoices').select('amount').eq('id', pmt.invoice_id).single();
    const newStatus = totalRemainingPaid <= 0 ? 'unpaid' : totalRemainingPaid >= inv.amount ? 'paid' : 'partially_paid';

    await supabase.from('invoices').update({ status: newStatus }).eq('id', pmt.invoice_id);

    await audit({
      businessId: req.businessId,
      userId: req.user.id,
      action: 'PAYMENT_REVERSED',
      entity: 'payments',
      entityId: paymentId,
      afterState: { reason, newInvoiceStatus: newStatus },
    });

    res.json({ success: true, newStatus });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
