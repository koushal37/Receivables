-- 009_invoice_document_fields.sql
-- Additive only: stores the extra fields captured by multi-format invoice import.
-- Safe to re-run.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS subtotal     NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS tax_amount   NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS line_items   JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS vendor_name  TEXT;

-- Lets the daily job upsert one collection action per invoice per day
CREATE UNIQUE INDEX IF NOT EXISTS uq_collection_actions_invoice_day
  ON public.collection_actions (invoice_id, action_date)
  WHERE invoice_id IS NOT NULL AND action_date IS NOT NULL;

NOTIFY pgrst, 'reload schema';
