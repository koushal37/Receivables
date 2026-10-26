-- ==============================================================================
-- 005_communication_logs.sql
-- Inbound and outbound message tracking + customer communication preferences
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.message_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    direction TEXT NOT NULL DEFAULT 'outbound', -- 'outbound', 'inbound'
    channel TEXT NOT NULL DEFAULT 'whatsapp',
    template_name TEXT,
    message_content TEXT NOT NULL,
    provider_message_id TEXT, -- Meta wamid ID
    status TEXT NOT NULL DEFAULT 'queued', -- 'queued', 'sent', 'delivered', 'read', 'failed'
    failure_reason TEXT,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_messages_business_cust ON public.message_logs (business_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_messages_invoice ON public.message_logs (invoice_id);
CREATE INDEX IF NOT EXISTS idx_messages_provider_id ON public.message_logs (provider_message_id);

ALTER TABLE public.message_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view messages for their business" ON public.message_logs;
CREATE POLICY "Users view messages for their business"
    ON public.message_logs FOR SELECT
    USING (business_id IN (SELECT business_id FROM public.business_memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users insert messages for their business" ON public.message_logs;
CREATE POLICY "Users insert messages for their business"
    ON public.message_logs FOR INSERT
    WITH CHECK (business_id IN (SELECT business_id FROM public.business_memberships WHERE user_id = auth.uid()));