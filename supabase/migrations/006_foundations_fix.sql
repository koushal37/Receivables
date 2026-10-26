-- Fix Missing Grants for service_role and authenticated users across existing tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Ensure default columns on customers exist properly
ALTER TABLE IF EXISTS customers 
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS opt_out boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT timezone('utc'::text, now());

-- Create Audit Logs Table for tracking all mutating actions
CREATE TABLE IF NOT EXISTS audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    action text NOT NULL,
    entity text NOT NULL,
    entity_id uuid,
    before_state jsonb,
    after_state jsonb,
    created_at timestamptz DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_biz ON audit_logs(business_id, created_at DESC);

-- Redefine or replace view to enforce Asia/Kolkata CURRENT_DATE
-- Invoices due today or overdue must use Asia/Kolkata instead of UTC
CREATE OR REPLACE VIEW invoice_summary_view AS
SELECT 
    i.id,
    i.business_id,
    i.customer_id,
    i.invoice_number,
    i.amount,
    i.due_date,
    i.status,
    c.name AS customer_name,
    c.phone AS customer_phone,
    COALESCE(SUM(p.amount) FILTER (WHERE p.status != 'reversed'), 0) AS total_paid,
    (i.amount - COALESCE(SUM(p.amount) FILTER (WHERE p.status != 'reversed'), 0)) AS outstanding_amount,
    CASE 
        WHEN (i.amount - COALESCE(SUM(p.amount) FILTER (WHERE p.status != 'reversed'), 0)) <= 0 THEN 'paid'
        WHEN i.due_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date THEN 'overdue'
        WHEN i.due_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date THEN 'due_today'
        ELSE 'upcoming'
    END AS computed_status,
    CASE
        WHEN i.due_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date 
        THEN ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - i.due_date)
        ELSE 0
    END AS days_overdue
FROM invoices i
JOIN customers c ON i.customer_id = c.id
LEFT JOIN payments p ON p.invoice_id = i.id
GROUP BY i.id, c.name, c.phone;
