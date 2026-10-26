CREATE OR REPLACE FUNCTION commit_import_batch(
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
BEGIN
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
    LOOP
        BEGIN
            -- 1. Match or Create Customer (priority: phone, reference, name)
            IF v_row->>'phone' IS NOT NULL AND v_row->>'phone' <> '' THEN
                SELECT id INTO v_customer_id FROM customers 
                WHERE business_id = p_business_id AND phone = v_row->>'phone' LIMIT 1;
            END IF;

            IF v_customer_id IS NULL AND v_row->>'name' IS NOT NULL THEN
                SELECT id INTO v_customer_id FROM customers 
                WHERE business_id = p_business_id AND LOWER(name) = LOWER(v_row->>'name') LIMIT 1;
            END IF;

            IF v_customer_id IS NULL THEN
                INSERT INTO customers (business_id, name, phone)
                VALUES (p_business_id, v_row->>'name', NULLIF(v_row->>'phone', ''))
                RETURNING id INTO v_customer_id;
            END IF;

            -- 2. Insert Invoice
            INSERT INTO invoices (business_id, customer_id, invoice_number, amount, due_date, status)
            VALUES (
                p_business_id,
                v_customer_id,
                v_row->>'invoice_number',
                (v_row->>'amount')::numeric,
                (v_row->>'due_date')::date,
                'unpaid'
            )
            RETURNING id INTO v_invoice_id;

            v_success_count := v_success_count + 1;
            v_results := v_results || jsonb_build_object('invoice_number', v_row->>'invoice_number', 'status', 'success');

        EXCEPTION WHEN OTHERS THEN
            -- In an atomic batch commit, error propagates out or records failure
            RAISE EXCEPTION 'Failed on invoice %: %', v_row->>'invoice_number', SQLERRM;
        END;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'count', v_success_count, 'results', v_results);
END;
$$;