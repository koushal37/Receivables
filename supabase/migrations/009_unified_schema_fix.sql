-- ==============================================================================
-- 009_unified_schema_fix.sql
-- Complete, Unified, Idempotent Supabase Schema for AI Receivables Recovery Assistant
-- Paste this into your Supabase SQL Editor and click "Run"
-- ==============================================================================

-- 1. CORE TABLES
CREATE TABLE IF NOT EXISTS public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  currency_code char(3) NOT NULL DEFAULT 'INR',
  business_settings jsonb NOT NULL DEFAULT '{"overdue_threshold_days": 7, "critical_threshold_days": 30, "high_value_threshold": 100000, "reminder_cooldown_hours": 24}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.business_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'employee', 'read_only')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'revoked')),
  display_name text,
  phone text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)
);

ALTER TABLE public.business_memberships
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text;

-- Updatable compatibility view for code referencing "memberships"
CREATE OR REPLACE VIEW public.memberships AS
SELECT * FROM public.business_memberships;

-- 2. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  external_customer_reference text,
  email text,
  phone text,
  preferred_channel text NOT NULL DEFAULT 'whatsapp',
  communication_permission_status text NOT NULL DEFAULT 'granted',
  opt_out boolean NOT NULL DEFAULT false,
  opted_out_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS external_customer_reference text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS preferred_channel text DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS communication_permission_status text DEFAULT 'granted',
  ADD COLUMN IF NOT EXISTS opt_out boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS opted_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

-- 3. INVOICES TABLE (Supports both original_amount and amount via sync trigger)
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  invoice_number text NOT NULL,
  invoice_date date NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date),
  due_date date NOT NULL,
  original_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (original_amount >= 0),
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency_code varchar(3) NOT NULL DEFAULT 'INR',
  source_system text DEFAULT 'manual_import',
  source_reference text,
  record_status text NOT NULL DEFAULT 'active',
  status text NOT NULL DEFAULT 'unpaid',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_business_invoice_number UNIQUE (business_id, invoice_number)
);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_date date DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date),
  ADD COLUMN IF NOT EXISTS original_amount numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS record_status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.sync_invoice_amounts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.original_amount IS NULL OR NEW.original_amount = 0 THEN
    NEW.original_amount := COALESCE(NEW.amount, 0);
  END IF;
  IF NEW.amount IS NULL OR NEW.amount = 0 THEN
    NEW.amount := COALESCE(NEW.original_amount, 0);
  END IF;
  IF NEW.invoice_date IS NULL THEN
    NEW.invoice_date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_invoice_amounts ON public.invoices;
CREATE TRIGGER trg_sync_invoice_amounts
BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_amounts();

-- 4. PAYMENTS & ALLOCATIONS TABLES
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  received_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (received_amount > 0),
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount > 0),
  received_at date NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date),
  payment_date timestamptz NOT NULL DEFAULT now(),
  payment_method text NOT NULL DEFAULT 'bank_transfer',
  payment_reference text,
  utr text,
  notes text,
  confirmation_status text NOT NULL DEFAULT 'confirmed',
  status text NOT NULL DEFAULT 'completed',
  reversal_reason text,
  source text DEFAULT 'manual_entry',
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS received_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS received_at date DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date),
  ADD COLUMN IF NOT EXISTS payment_date timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS utr text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS confirmation_status text DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS reversal_reason text;

CREATE OR REPLACE FUNCTION public.sync_payment_fields()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.received_amount IS NULL OR NEW.received_amount = 0 THEN
    NEW.received_amount := COALESCE(NEW.amount, 0);
  END IF;
  IF NEW.amount IS NULL OR NEW.amount = 0 THEN
    NEW.amount := COALESCE(NEW.received_amount, 0);
  END IF;
  IF NEW.utr IS NULL AND NEW.payment_reference IS NOT NULL THEN
    NEW.utr := NEW.payment_reference;
  END IF;
  IF NEW.payment_reference IS NULL AND NEW.utr IS NOT NULL THEN
    NEW.payment_reference := NEW.utr;
  END IF;
  IF NEW.status = 'reversed' THEN
    NEW.confirmation_status := 'reversed';
  ELSIF NEW.confirmation_status = 'reversed' THEN
    NEW.status := 'reversed';
  END IF;
  IF NEW.customer_id IS NULL AND NEW.invoice_id IS NOT NULL THEN
    SELECT customer_id INTO NEW.customer_id FROM public.invoices WHERE id = NEW.invoice_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_payment_fields ON public.payments;
CREATE TRIGGER trg_sync_payment_fields
BEFORE INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.sync_payment_fields();

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_utr_per_biz 
ON public.payments (business_id, utr) 
WHERE utr IS NOT NULL AND status != 'reversed';

CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  allocated_amount numeric(14,2) NOT NULL CHECK (allocated_amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_payment_invoice_allocation UNIQUE (payment_id, invoice_id)
);

CREATE TABLE IF NOT EXISTS public.invoice_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  adjustment_type text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  effective_date date NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. COLLECTION ACTIONS, PROMISES, DISPUTES & LOGS
CREATE TABLE IF NOT EXISTS public.collection_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  action_type text NOT NULL DEFAULT 'call',
  action_date date NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date),
  priority text NOT NULL DEFAULT 'routine',
  rule_triggered text,
  priority_reason text NOT NULL DEFAULT 'Scheduled follow-up',
  reason text,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  scheduled_at date NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date),
  status text NOT NULL DEFAULT 'queued',
  outcome text,
  notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, action_date)
);

ALTER TABLE public.collection_actions
  ADD COLUMN IF NOT EXISTS action_date date DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date),
  ADD COLUMN IF NOT EXISTS rule_triggered text,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE TABLE IF NOT EXISTS public.payment_promises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  promised_amount numeric(14,2) NOT NULL CHECK (promised_amount > 0),
  promised_date date NOT NULL,
  promise_date date,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'phone_call',
  status text NOT NULL DEFAULT 'upcoming',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_promises
  ADD COLUMN IF NOT EXISTS promise_date date;

CREATE OR REPLACE FUNCTION public.sync_promise_dates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.promised_date IS NULL AND NEW.promise_date IS NOT NULL THEN
    NEW.promised_date := NEW.promise_date;
  END IF;
  IF NEW.promise_date IS NULL AND NEW.promised_date IS NOT NULL THEN
    NEW.promise_date := NEW.promised_date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_promise_dates ON public.payment_promises;
CREATE TRIGGER trg_sync_promise_dates
BEFORE INSERT OR UPDATE ON public.payment_promises
FOR EACH ROW EXECUTE FUNCTION public.sync_promise_dates();

CREATE OR REPLACE VIEW public.promises AS
SELECT * FROM public.payment_promises;

CREATE TABLE IF NOT EXISTS public.disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.message_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  phone text,
  direction text NOT NULL DEFAULT 'outbound',
  channel text NOT NULL DEFAULT 'whatsapp',
  message_type text DEFAULT 'text',
  template_name text,
  message_content text NOT NULL DEFAULT '',
  content text,
  provider_message_id text,
  meta_message_id text,
  status text NOT NULL DEFAULT 'sent',
  failure_reason text,
  sent_at timestamptz DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.message_logs
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS message_type text DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS meta_message_id text;

CREATE OR REPLACE VIEW public.communication_logs AS
SELECT * FROM public.message_logs;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz DEFAULT now()
);

-- 6. UNIFIED DETERMINISTIC LEDGER VIEWS (Asia/Kolkata Timezone Aware)
DROP VIEW IF EXISTS public.invoice_summary_view CASCADE;
DROP VIEW IF EXISTS public.invoice_ledger_view CASCADE;

CREATE OR REPLACE VIEW public.invoice_ledger_view AS
WITH direct_payments AS (
    SELECT 
        p.invoice_id,
        COALESCE(SUM(COALESCE(p.received_amount, p.amount, 0)), 0) AS paid_direct
    FROM public.payments p
    WHERE p.invoice_id IS NOT NULL
      AND COALESCE(p.status, 'completed') != 'reversed'
      AND COALESCE(p.confirmation_status, 'confirmed') != 'reversed'
    GROUP BY p.invoice_id
),
alloc_payments AS (
    SELECT 
        pa.invoice_id,
        COALESCE(SUM(pa.allocated_amount), 0) AS paid_alloc
    FROM public.payment_allocations pa
    JOIN public.payments p ON p.id = pa.payment_id
    WHERE COALESCE(p.status, 'completed') != 'reversed'
      AND COALESCE(p.confirmation_status, 'confirmed') = 'confirmed'
      AND p.invoice_id IS NULL
    GROUP BY pa.invoice_id
),
adjustment_totals AS (
    SELECT 
        ia.invoice_id,
        COALESCE(SUM(ia.amount), 0) AS total_adjusted
    FROM public.invoice_adjustments ia
    GROUP BY ia.invoice_id
),
open_disputes AS (
    SELECT DISTINCT invoice_id
    FROM public.disputes
    WHERE status IN ('open', 'under_review')
)
SELECT 
    i.id,
    i.business_id,
    i.customer_id,
    c.name AS customer_name,
    c.phone AS customer_phone,
    c.email AS customer_email,
    c.opt_out AS customer_opt_out,
    i.invoice_number,
    i.invoice_date,
    i.due_date,
    GREATEST(COALESCE(i.original_amount, 0), COALESCE(i.amount, 0)) AS original_amount,
    GREATEST(COALESCE(i.original_amount, 0), COALESCE(i.amount, 0)) AS amount,
    (COALESCE(dp.paid_direct, 0) + COALESCE(ap.paid_alloc, 0)) AS total_paid,
    COALESCE(at.total_adjusted, 0) AS total_adjusted,
    GREATEST(0, GREATEST(COALESCE(i.original_amount, 0), COALESCE(i.amount, 0)) - (COALESCE(dp.paid_direct, 0) + COALESCE(ap.paid_alloc, 0)) - COALESCE(at.total_adjusted, 0)) AS outstanding_balance,
    GREATEST(0, GREATEST(COALESCE(i.original_amount, 0), COALESCE(i.amount, 0)) - (COALESCE(dp.paid_direct, 0) + COALESCE(ap.paid_alloc, 0)) - COALESCE(at.total_adjusted, 0)) AS outstanding_amount,
    CASE 
        WHEN i.record_status = 'void' OR i.status = 'void' THEN 'void'
        WHEN i.record_status = 'disputed' OR i.status = 'disputed' OR od.invoice_id IS NOT NULL THEN 'disputed'
        WHEN (GREATEST(COALESCE(i.original_amount, 0), COALESCE(i.amount, 0)) - (COALESCE(dp.paid_direct, 0) + COALESCE(ap.paid_alloc, 0)) - COALESCE(at.total_adjusted, 0)) <= 0 THEN 'paid'
        WHEN (COALESCE(dp.paid_direct, 0) + COALESCE(ap.paid_alloc, 0)) > 0 AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date > i.due_date THEN 'overdue'
        WHEN (COALESCE(dp.paid_direct, 0) + COALESCE(ap.paid_alloc, 0)) > 0 THEN 'partially_paid'
        WHEN (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date > i.due_date THEN 'overdue'
        WHEN (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date = i.due_date THEN 'due_today'
        ELSE 'open'
    END AS payment_status,
    CASE 
        WHEN i.record_status = 'void' OR i.status = 'void' THEN 'void'
        WHEN i.record_status = 'disputed' OR i.status = 'disputed' OR od.invoice_id IS NOT NULL THEN 'disputed'
        WHEN (GREATEST(COALESCE(i.original_amount, 0), COALESCE(i.amount, 0)) - (COALESCE(dp.paid_direct, 0) + COALESCE(ap.paid_alloc, 0)) - COALESCE(at.total_adjusted, 0)) <= 0 THEN 'paid'
        WHEN (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date > i.due_date THEN 'overdue'
        WHEN (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date = i.due_date THEN 'due_today'
        WHEN (COALESCE(dp.paid_direct, 0) + COALESCE(ap.paid_alloc, 0)) > 0 THEN 'partially_paid'
        ELSE 'upcoming'
    END AS computed_status,
    i.status,
    CASE 
        WHEN (GREATEST(COALESCE(i.original_amount, 0), COALESCE(i.amount, 0)) - (COALESCE(dp.paid_direct, 0) + COALESCE(ap.paid_alloc, 0)) - COALESCE(at.total_adjusted, 0)) <= 0 THEN 0
        WHEN (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date > i.due_date THEN ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - i.due_date)
        ELSE 0
    END AS days_overdue,
    CASE 
        WHEN (GREATEST(COALESCE(i.original_amount, 0), COALESCE(i.amount, 0)) - (COALESCE(dp.paid_direct, 0) + COALESCE(ap.paid_alloc, 0)) - COALESCE(at.total_adjusted, 0)) <= 0 THEN 'settled'
        WHEN (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date < i.due_date THEN 'not_yet_due'
        WHEN (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date = i.due_date THEN 'due_today'
        WHEN ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - i.due_date) BETWEEN 1 AND 7 THEN '1-7_days'
        WHEN ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - i.due_date) BETWEEN 8 AND 30 THEN '8-30_days'
        WHEN ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - i.due_date) BETWEEN 31 AND 60 THEN '31-60_days'
        ELSE 'more_than_60_days'
    END AS ageing_bucket
FROM public.invoices i
JOIN public.customers c ON c.id = i.customer_id
LEFT JOIN direct_payments dp ON dp.invoice_id = i.id
LEFT JOIN alloc_payments ap ON ap.invoice_id = i.id
LEFT JOIN adjustment_totals at ON at.invoice_id = i.id
LEFT JOIN open_disputes od ON od.invoice_id = i.id;

CREATE OR REPLACE VIEW public.invoice_summary_view AS
SELECT * FROM public.invoice_ledger_view;

-- 7. ATOMIC RPC FUNCTIONS
CREATE OR REPLACE FUNCTION public.commit_import_batch(
    p_business_id uuid,
    p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_row jsonb;
    v_customer_id uuid;
    v_invoice_id uuid;
    v_success_count int := 0;
    v_results jsonb := '[]'::jsonb;
    v_inv_date date;
BEGIN
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
    LOOP
        v_customer_id := NULL;

        IF v_row->>'phone' IS NOT NULL AND v_row->>'phone' <> '' THEN
            SELECT id INTO v_customer_id FROM public.customers 
            WHERE business_id = p_business_id AND phone = v_row->>'phone' LIMIT 1;
        END IF;

        IF v_customer_id IS NULL AND v_row->>'name' IS NOT NULL THEN
            SELECT id INTO v_customer_id FROM public.customers 
            WHERE business_id = p_business_id AND LOWER(name) = LOWER(v_row->>'name') LIMIT 1;
        END IF;

        IF v_customer_id IS NULL THEN
            INSERT INTO public.customers (business_id, name, phone, email)
            VALUES (
                p_business_id,
                v_row->>'name',
                NULLIF(v_row->>'phone', ''),
                NULLIF(v_row->>'email', '')
            )
            RETURNING id INTO v_customer_id;
        END IF;

        v_inv_date := COALESCE((NULLIF(v_row->>'invoice_date', ''))::date, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date);

        INSERT INTO public.invoices (
            business_id, customer_id, invoice_number, invoice_date, due_date, original_amount, amount, record_status, status
        )
        VALUES (
            p_business_id,
            v_customer_id,
            v_row->>'invoice_number',
            v_inv_date,
            (v_row->>'due_date')::date,
            (v_row->>'amount')::numeric,
            (v_row->>'amount')::numeric,
            'active',
            'unpaid'
        )
        RETURNING id INTO v_invoice_id;

        v_success_count := v_success_count + 1;
        v_results := v_results || jsonb_build_object('invoice_number', v_row->>'invoice_number', 'invoice_id', v_invoice_id, 'status', 'success');
    END LOOP;

    RETURN jsonb_build_object('success', true, 'count', v_success_count, 'results', v_results);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_payment_atomic(
    p_business_id uuid,
    p_invoice_id uuid,
    p_amount numeric,
    p_payment_method text,
    p_utr text,
    p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inv record;
    v_outstanding numeric;
    v_payment_id uuid;
BEGIN
    SELECT id, customer_id, GREATEST(COALESCE(original_amount, 0), COALESCE(amount, 0)) AS inv_amt, status
    INTO v_inv
    FROM public.invoices
    WHERE id = p_invoice_id AND business_id = p_business_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found';
    END IF;

    SELECT outstanding_balance INTO v_outstanding
    FROM public.invoice_ledger_view
    WHERE id = p_invoice_id;

    IF p_amount > v_outstanding THEN
        RAISE EXCEPTION 'Payment of ₹% exceeds outstanding balance of ₹%', p_amount, v_outstanding;
    END IF;

    IF p_utr IS NOT NULL AND p_utr <> '' AND EXISTS (
        SELECT 1 FROM public.payments 
        WHERE business_id = p_business_id AND (utr = p_utr OR payment_reference = p_utr) AND status != 'reversed'
    ) THEN
        RAISE EXCEPTION 'Payment with UTR/Reference % already recorded', p_utr;
    END IF;

    INSERT INTO public.payments (
        business_id, customer_id, invoice_id, received_amount, amount, payment_method, payment_reference, utr, notes, confirmation_status, status, received_at, payment_date
    )
    VALUES (
        p_business_id, v_inv.customer_id, p_invoice_id, p_amount, p_amount, COALESCE(p_payment_method, 'bank_transfer'), NULLIF(p_utr, ''), NULLIF(p_utr, ''), p_notes, 'confirmed', 'completed', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date, now()
    )
    RETURNING id INTO v_payment_id;

    INSERT INTO public.payment_allocations (business_id, payment_id, invoice_id, allocated_amount)
    VALUES (p_business_id, v_payment_id, p_invoice_id, p_amount)
    ON CONFLICT (payment_id, invoice_id) DO NOTHING;

    IF (v_outstanding - p_amount) <= 0 THEN
        UPDATE public.invoices SET status = 'paid', updated_at = now() WHERE id = p_invoice_id;
        UPDATE public.payment_promises SET status = 'fulfilled', updated_at = now() 
        WHERE invoice_id = p_invoice_id AND status IN ('upcoming', 'pending', 'missed');
        UPDATE public.collection_actions SET status = 'completed', outcome = 'payment_confirmed', completed_at = now()
        WHERE invoice_id = p_invoice_id AND status IN ('queued', 'pending', 'in_progress');
    ELSE
        UPDATE public.invoices SET status = 'partially_paid', updated_at = now() WHERE id = p_invoice_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'remaining_balance', GREATEST(0, v_outstanding - p_amount)
    );
END;
$$;

-- 8. GRANTS FOR SUPABASE ROLES
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO authenticated;

NOTIFY pgrst, 'reload schema';
