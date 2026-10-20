-- ==============================================================================
-- 003_invoices_customers_payments.sql
-- Schema for Customers, Invoices, Payments, Allocations, and Adjustments
-- ==============================================================================

-- 1. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    external_customer_reference TEXT,
    email TEXT,
    phone TEXT,
    preferred_channel TEXT NOT NULL DEFAULT 'whatsapp',
    communication_permission_status TEXT NOT NULL DEFAULT 'pending', -- 'granted', 'pending', 'opted_out'
    opted_out_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Unique customer phone/reference per business tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_business_phone 
    ON public.customers (business_id, phone) 
    WHERE phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_business_ext_ref 
    ON public.customers (business_id, external_customer_reference) 
    WHERE external_customer_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_business_id ON public.customers (business_id);


-- 2. INVOICES TABLE
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    invoice_number TEXT NOT NULL,
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    original_amount NUMERIC(14,2) NOT NULL CHECK (original_amount >= 0),
    currency_code VARCHAR(3) NOT NULL DEFAULT 'INR',
    source_system TEXT DEFAULT 'manual_import', -- 'manual_import', 'tally', etc.
    source_reference TEXT,
    record_status TEXT NOT NULL DEFAULT 'active', -- 'active', 'void', 'disputed'
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_business_invoice_number UNIQUE (business_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_business_customer ON public.invoices (business_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices (business_id, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices (business_id, record_status);


-- 3. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    received_amount NUMERIC(14,2) NOT NULL CHECK (received_amount > 0),
    received_at DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method TEXT NOT NULL DEFAULT 'bank_transfer', -- 'bank_transfer', 'upi', 'cash', 'cheque'
    payment_reference TEXT, -- UTR, Cheque #, Transaction ID
    confirmation_status TEXT NOT NULL DEFAULT 'confirmed', -- 'confirmed', 'pending', 'reversed'
    source TEXT DEFAULT 'manual_entry',
    recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_payments_business_received ON public.payments (business_id, received_at);


-- 4. PAYMENT ALLOCATIONS TABLE
CREATE TABLE IF NOT EXISTS public.payment_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
    allocated_amount NUMERIC(14,2) NOT NULL CHECK (allocated_amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_payment_invoice_allocation UNIQUE (payment_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_allocations_invoice ON public.payment_allocations (invoice_id);


-- 5. INVOICE ADJUSTMENTS TABLE (Credits, debit notes, waivers)
CREATE TABLE IF NOT EXISTS public.invoice_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    adjustment_type TEXT NOT NULL, -- 'credit_note', 'write_off', 'discount'
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_adjustments_invoice ON public.invoice_adjustments (invoice_id);


-- ==============================================================================
-- DETERMINISTIC FINANCIAL CALCULATION VIEW
-- Automatically computes outstanding balances, days overdue, and ageing buckets
-- ==============================================================================

CREATE OR REPLACE VIEW public.invoice_ledger_view AS
WITH payment_totals AS (
    SELECT 
        pa.invoice_id,
        COALESCE(SUM(pa.allocated_amount), 0) AS total_paid
    FROM public.payment_allocations pa
    JOIN public.payments p ON p.id = pa.payment_id
    WHERE p.confirmation_status = 'confirmed'
    GROUP BY pa.invoice_id
),
adjustment_totals AS (
    SELECT 
        ia.invoice_id,
        COALESCE(SUM(ia.amount), 0) AS total_adjusted
    FROM public.invoice_adjustments ia
    GROUP BY ia.invoice_id
)
SELECT 
    i.id,
    i.business_id,
    i.customer_id,
    c.name AS customer_name,
    c.phone AS customer_phone,
    i.invoice_number,
    i.invoice_date,
    i.due_date,
    i.original_amount,
    COALESCE(pt.total_paid, 0) AS total_paid,
    COALESCE(at.total_adjusted, 0) AS total_adjusted,
    GREATEST(0, i.original_amount - COALESCE(pt.total_paid, 0) - COALESCE(at.total_adjusted, 0)) AS outstanding_balance,
    CASE 
        WHEN i.record_status = 'void' THEN 'void'
        WHEN i.record_status = 'disputed' THEN 'disputed'
        WHEN (i.original_amount - COALESCE(pt.total_paid, 0) - COALESCE(at.total_adjusted, 0)) <= 0 THEN 'paid'
        WHEN COALESCE(pt.total_paid, 0) > 0 THEN 'partially_paid'
        WHEN CURRENT_DATE > i.due_date THEN 'overdue'
        ELSE 'open'
    END AS payment_status,
    CASE 
        WHEN (i.original_amount - COALESCE(pt.total_paid, 0) - COALESCE(at.total_adjusted, 0)) <= 0 THEN 0
        WHEN CURRENT_DATE > i.due_date THEN (CURRENT_DATE - i.due_date)
        ELSE 0
    END AS days_overdue,
    CASE 
        WHEN (i.original_amount - COALESCE(pt.total_paid, 0) - COALESCE(at.total_adjusted, 0)) <= 0 THEN 'settled'
        WHEN CURRENT_DATE < i.due_date THEN 'not_yet_due'
        WHEN CURRENT_DATE = i.due_date THEN 'due_today'
        WHEN (CURRENT_DATE - i.due_date) BETWEEN 1 AND 7 THEN '1-7_days'
        WHEN (CURRENT_DATE - i.due_date) BETWEEN 8 AND 30 THEN '8-30_days'
        WHEN (CURRENT_DATE - i.due_date) BETWEEN 31 AND 60 THEN '31-60_days'
        ELSE 'more_than_60_days'
    END AS ageing_bucket
FROM public.invoices i
JOIN public.customers c ON c.id = i.customer_id
LEFT JOIN payment_totals pt ON pt.invoice_id = i.id
LEFT JOIN adjustment_totals at ON at.invoice_id = i.id;


-- ==============================================================================
-- ROW LEVEL SECURITY (RLS)
-- Restricts records strictly to members of the corresponding business
-- ==============================================================================

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_adjustments ENABLE ROW LEVEL SECURITY;

-- Helper condition check macro for memberships
-- (Assumes public.business_memberships exists with user_id and business_id)

-- 1. Customers RLS
CREATE POLICY "Users can view customers of their business"
    ON public.customers FOR SELECT
    USING (business_id IN (
        SELECT bm.business_id FROM public.business_memberships bm WHERE bm.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert customers into their business"
    ON public.customers FOR INSERT
    WITH CHECK (business_id IN (
        SELECT bm.business_id FROM public.business_memberships bm WHERE bm.user_id = auth.uid()
    ));

CREATE POLICY "Users can update customers of their business"
    ON public.customers FOR UPDATE
    USING (business_id IN (
        SELECT bm.business_id FROM public.business_memberships bm WHERE bm.user_id = auth.uid()
    ));

-- 2. Invoices RLS
CREATE POLICY "Users can view invoices of their business"
    ON public.invoices FOR SELECT
    USING (business_id IN (
        SELECT bm.business_id FROM public.business_memberships bm WHERE bm.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert invoices into their business"
    ON public.invoices FOR INSERT
    WITH CHECK (business_id IN (
        SELECT bm.business_id FROM public.business_memberships bm WHERE bm.user_id = auth.uid()
    ));

CREATE POLICY "Users can update invoices of their business"
    ON public.invoices FOR UPDATE
    USING (business_id IN (
        SELECT bm.business_id FROM public.business_memberships bm WHERE bm.user_id = auth.uid()
    ));

-- 3. Payments RLS
CREATE POLICY "Users can view payments of their business"
    ON public.payments FOR SELECT
    USING (business_id IN (
        SELECT bm.business_id FROM public.business_memberships bm WHERE bm.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert payments for their business"
    ON public.payments FOR INSERT
    WITH CHECK (business_id IN (
        SELECT bm.business_id FROM public.business_memberships bm WHERE bm.user_id = auth.uid()
    ));

-- 4. Allocations & Adjustments RLS
CREATE POLICY "Users can view allocations of their business"
    ON public.payment_allocations FOR SELECT
    USING (business_id IN (
        SELECT bm.business_id FROM public.business_memberships bm WHERE bm.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert allocations for their business"
    ON public.payment_allocations FOR INSERT
    WITH CHECK (business_id IN (
        SELECT bm.business_id FROM public.business_memberships bm WHERE bm.user_id = auth.uid()
    ));

CREATE POLICY "Users can view adjustments of their business"
    ON public.invoice_adjustments FOR SELECT
    USING (business_id IN (
        SELECT bm.business_id FROM public.business_memberships bm WHERE bm.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert adjustments for their business"
    ON public.invoice_adjustments FOR INSERT
    WITH CHECK (business_id IN (
        SELECT bm.business_id FROM public.business_memberships bm WHERE bm.user_id = auth.uid()
    ));