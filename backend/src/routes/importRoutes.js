import { Router } from 'express';
import { z } from 'zod';
import { canWrite, audit } from '../middleware/auth.js';
import { supabase } from '../supabase.js';
import { validateImportRows } from '../lib/importValidation.js';
import { todayInTz } from '../lib/dates.js';

const router = Router();

const MAX_ROWS = 5000;
const rowsSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1, 'No rows provided').max(MAX_ROWS, `At most ${MAX_ROWS} rows per import`),
  fileName: z.string().max(255).optional(),
});

async function existingInvoiceNumbers(businessId) {
  // Page through so businesses with more than 1000 invoices still dedupe correctly
  const numbers = new Set();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('invoices')
      .select('invoice_number')
      .eq('business_id', businessId)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    (data || []).forEach((i) => numbers.add(String(i.invoice_number).trim().toLowerCase()));
    if (!data || data.length < pageSize) break;
  }
  return numbers;
}

// Maps lower-cased invoice numbers to ids for the given business.
async function invoiceIdsByNumber(businessId, numbers) {
  const map = new Map();
  for (let i = 0; i < numbers.length; i += 200) {
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number')
      .eq('business_id', businessId)
      .in('invoice_number', numbers.slice(i, i + 200));
    if (error) throw error;
    (data || []).forEach((row) => map.set(String(row.invoice_number).toLowerCase(), row.id));
  }
  return map;
}

// POST /api/import/preview - Validates, dedupes, categorizes
router.post('/preview', ...canWrite, async (req, res, next) => {
  try {
    const { rows } = rowsSchema.parse(req.body);
    const existing = await existingInvoiceNumbers(req.businessId);
    res.json(validateImportRows(rows, existing, { today: todayInTz() }));
  } catch (err) {
    next(err);
  }
});

// POST /api/import/commit - Re-validates on the server, then commits atomically via RPC
router.post('/commit', ...canWrite, async (req, res, next) => {
  try {
    const { rows, fileName } = rowsSchema.parse(req.body);
    const existing = await existingInvoiceNumbers(req.businessId);
    const { valid, duplicates, errors } = validateImportRows(rows, existing, { today: todayInTz() });

    // All-or-nothing: never commit a batch the server considers invalid
    if (errors.length || duplicates.length) {
      return res.status(422).json({
        error: `${errors.length + duplicates.length} row(s) failed validation. Fix them and try again.`,
        errors,
        duplicates,
      });
    }

    const { data, error } = await supabase.rpc('commit_import_batch', {
      p_business_id: req.businessId,
      p_rows: valid,
    });
    if (error) throw Object.assign(new Error(error.message), { statusCode: 400 });

    // Fields the batch function doesn't write. Core fields first, then the document
    // fields from migration 009 separately, so a missing migration can't block the core.
    const ids = await invoiceIdsByNumber(req.businessId, valid.map((r) => r.invoice_number));
    const warnings = [];
    await Promise.all(valid.map(async (r) => {
      const id = ids.get(r.invoice_number.toLowerCase());
      if (!id) return;
      const core = await supabase.from('invoices')
        .update({ invoice_date: r.invoice_date, currency_code: r.currency, source_reference: fileName || null })
        .eq('id', id).eq('business_id', req.businessId);
      if (core.error) console.warn(`Import: dates/currency not saved for ${r.invoice_number}: ${core.error.message}`);
      const extra = await supabase.from('invoices')
        .update({ subtotal: r.subtotal, tax_amount: r.tax, line_items: r.line_items, vendor_name: r.vendor_name })
        .eq('id', id).eq('business_id', req.businessId);
      if (extra.error) console.warn(`Import: tax/line items not saved for ${r.invoice_number} (run migration 009): ${extra.error.message}`);
    }));

    // Optional follow-ups entered during review: money already received and promise dates
    let payments = 0;
    let promises = 0;
    for (const r of valid) {
      const id = ids.get(r.invoice_number.toLowerCase());
      if (!id) continue;
      if (r.paid_amount > 0) {
        const { error: payErr } = await supabase.rpc('record_payment_atomic', {
          p_business_id: req.businessId,
          p_invoice_id: id,
          p_amount: r.paid_amount,
          p_payment_method: 'other',
          p_utr: null,
          p_notes: 'Recorded when the invoice was added',
        });
        if (payErr) warnings.push(`${r.invoice_number}: payment of ${r.paid_amount} not recorded (${payErr.message})`);
        else payments++;
      }
      if (r.promise_date) {
        const { data: inv } = await supabase.from('invoices').select('customer_id').eq('id', id).maybeSingle();
        const { error: prErr } = await supabase.from('payment_promises').insert({
          business_id: req.businessId,
          customer_id: inv?.customer_id,
          invoice_id: id,
          promised_amount: Math.round((r.amount - r.paid_amount) * 100) / 100,
          promised_date: r.promise_date,
          recorded_by: req.user.id,
          source: 'direct',
          status: r.promise_date < todayInTz() ? 'missed' : 'upcoming',
        });
        if (prErr) warnings.push(`${r.invoice_number}: promise date not saved (${prErr.message})`);
        else promises++;
      }
    }

    await audit({
      businessId: req.businessId,
      userId: req.user.id,
      action: 'IMPORT_COMMITTED',
      entity: 'invoices',
      afterState: { count: data?.count ?? valid.length, fileName: fileName || null },
    });

    res.json({ success: true, count: data?.count ?? valid.length, payments, promises, warnings });
  } catch (err) {
    next(err);
  }
});

export default router;
