-- ==============================================================================
-- 004_collection_queue.sql
-- Queue tasks, payment commitments, and disputes with tenant isolation
-- ==============================================================================

-- 1. COLLECTION ACTIONS (The prioritized action queue)
CREATE TABLE IF NOT EXISTS public.collection_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL DEFAULT 'call', -- 'call', 'whatsapp_reminder', 'escalation'
    priority TEXT NOT NULL DEFAULT 'routine', -- 'critical', 'important', 'routine'
    priority_reason TEXT NOT NULL,
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    scheduled_at DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'queued', -- 'queued', 'in_progress', 'completed', 'snoozed', 'cancelled'
    outcome TEXT, -- 'no_answer', 'payment_promised', 'disputed', 'paid_reported', 'completed'
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_actions_business_status ON public.collection_actions (business_id, status);
CREATE INDEX IF NOT EXISTS idx_actions_priority ON public.collection_actions (business_id, priority);


-- 2. PAYMENT PROMISES
CREATE TABLE IF NOT EXISTS public.payment_promises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    promised_amount NUMERIC(14,2) NOT NULL CHECK (promised_amount > 0),
    promised_date DATE NOT NULL,
    recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    source TEXT NOT NULL DEFAULT 'phone_call', -- 'phone_call', 'whatsapp_reply', 'direct'
    status TEXT NOT NULL DEFAULT 'upcoming', -- 'upcoming', 'fulfilled', 'missed', 'revised', 'cancelled'
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_promises_business_date ON public.payment_promises (business_id, promised_date, status);


-- 3. DISPUTES
CREATE TABLE IF NOT EXISTS public.disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL, -- 'pricing_error', 'damaged_goods', 'short_shipment', 'already_paid'
    description TEXT,
    status TEXT NOT NULL DEFAULT 'open', -- 'open', 'under_review', 'resolved'
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_disputes_business_status ON public.disputes (business_id, status);


-- ==============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ==============================================================================

ALTER TABLE public.collection_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_promises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view actions for their business"
    ON public.collection_actions FOR SELECT
    USING (business_id IN (SELECT business_id FROM public.business_memberships WHERE user_id = auth.uid()));

CREATE POLICY "Users modify actions for their business"
    ON public.collection_actions FOR ALL
    USING (business_id IN (SELECT business_id FROM public.business_memberships WHERE user_id = auth.uid()));

CREATE POLICY "Users view promises for their business"
    ON public.payment_promises FOR SELECT
    USING (business_id IN (SELECT business_id FROM public.business_memberships WHERE user_id = auth.uid()));

CREATE POLICY "Users modify promises for their business"
    ON public.payment_promises FOR ALL
    USING (business_id IN (SELECT business_id FROM public.business_memberships WHERE user_id = auth.uid()));

CREATE POLICY "Users view disputes for their business"
    ON public.disputes FOR SELECT
    USING (business_id IN (SELECT business_id FROM public.business_memberships WHERE user_id = auth.uid()));

CREATE POLICY "Users modify disputes for their business"
    ON public.disputes FOR ALL
    USING (business_id IN (SELECT business_id FROM public.business_memberships WHERE user_id = auth.uid()));