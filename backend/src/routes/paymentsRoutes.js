import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { canWrite, ownerOnly, assertInvoiceInBusiness, audit } from '../middleware/auth.js';

const router = Router();

const recordPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  paymentMethod: z.enum(['bank_transfer', 'upi', 'cash', 'cheque', 'card', 'other']).default('bank_transfer'),
  utr: z.string().trim().min(3).max(64).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

// Record Payment (atomic RPC: locks invoice, rejects overpayment, dedupes UTR)
router.post('/record', ...canWrite, async (req, res, next) => {
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
    if (error) throw Object.assign(new Error(error.message), { statusCode: 400 });

    await audit({ businessId: req.businessId, userId: req.user.id, action: 'PAYMENT_RECORDED', entity: 'payments', entityId: result?.payment_id, afterState: data });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Reverse Payment (owner only, atomic RPC)
router.post('/reverse', ...ownerOnly, async (req, res, next) => {
  try {
    const { paymentId, reason } = z.object({ paymentId: z.string().uuid(), reason: z.string().trim().min(3).max(500) }).parse(req.body);

    const { data: pmt, error: pmtErr } = await supabase
      .from('payments')
      .select('id')
      .eq('id', paymentId)
      .eq('business_id', req.businessId)
      .maybeSingle();
    if (pmtErr || !pmt) return res.status(404).json({ error: 'Payment not found' });

    const { data: result, error } = await supabase.rpc('reverse_payment', {
      p_business: req.businessId,
      p_payment: paymentId,
      p_reason: reason,
      p_user: req.user.id,
    });
    if (error) throw Object.assign(new Error(error.message), { statusCode: 400 });

    await audit({ businessId: req.businessId, userId: req.user.id, action: 'PAYMENT_REVERSED', entity: 'payments', entityId: paymentId, afterState: { reason } });
    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
});

export default router;
