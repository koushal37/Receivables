-- Add Unique UTR constraint per business (ignoring NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_utr_per_biz 
ON payments (business_id, utr) 
WHERE utr IS NOT NULL;

-- Atomic Payment Recording Function
CREATE OR REPLACE FUNCTION record_payment_atomic(
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
    v_total_paid numeric;
    v_outstanding numeric;
    v_payment_id uuid;
BEGIN
    -- 1. Fetch & lock invoice
    SELECT id, amount, status INTO v_inv
    FROM invoices
    WHERE id = p_invoice_id AND business_id = p_business_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found';
    END IF;

    -- 2. Calculate current outstanding
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM payments
    WHERE invoice_id = p_invoice_id AND status != 'reversed';

    v_outstanding := v_inv.amount - v_total_paid;

    -- 3. Check for overpayment
    IF p_amount > v_outstanding THEN
        RAISE EXCEPTION 'Payment of % exceeds outstanding balance of %', p_amount, v_outstanding;
    END IF;

    -- 4. Deduplicate UTR
    IF p_utr IS NOT NULL AND EXISTS (
        SELECT 1 FROM payments WHERE business_id = p_business_id AND utr = p_utr AND status != 'reversed'
    ) THEN
        RAISE EXCEPTION 'Payment with UTR % already recorded', p_utr;
    END IF;

    -- 5. Record Payment
    INSERT INTO payments (business_id, invoice_id, amount, payment_method, utr, notes, status, payment_date)
    VALUES (p_business_id, p_invoice_id, p_amount, p_payment_method, p_utr, p_notes, 'completed', now())
    RETURNING id INTO v_payment_id;

    -- 6. Update Invoice Status if fully settled
    IF (v_outstanding - p_amount) = 0 THEN
        UPDATE invoices SET status = 'paid', updated_at = now() WHERE id = p_invoice_id;
        -- Auto fulfill any open promises on this invoice
        UPDATE promises SET status = 'fulfilled', updated_at = now() 
        WHERE invoice_id = p_invoice_id AND status = 'pending';
    ELSE
        UPDATE invoices SET status = 'partially_paid', updated_at = now() WHERE id = p_invoice_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id, 'remaining_balance', (v_outstanding - p_amount));
END;
$$;
