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

    // Extra document fields (dates, currency, tax, line items) are stored best-effort;
    // the columns come from migration 009 and the financial core is already committed.
    await Promise.all(valid.map(async (r) => {
      const { error: updErr } = await supabase
        .from('invoices')
        .update({
          invoice_date: r.invoice_date,
          currency_code: r.currency,
          subtotal: r.subtotal,
          tax_amount: r.tax,
          line_items: r.line_items,
          vendor_name: r.vendor_name,
          source_reference: fileName || null,
        })
        .eq('business_id', req.businessId)
        .eq('invoice_number', r.invoice_number);
      if (updErr) console.warn(`Import metadata not saved for ${r.invoice_number}: ${updErr.message}`);
    }));

    await audit({
      businessId: req.businessId,
      userId: req.user.id,
      action: 'IMPORT_COMMITTED',
      entity: 'invoices',
      afterState: { count: data?.count ?? valid.length, fileName: fileName || null },
    });

    res.json({ success: true, count: data?.count ?? valid.length });
  } catch (err) {
    next(err);
  }
});

export default router;
